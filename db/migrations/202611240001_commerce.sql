do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'sparkle_runtime') then
    create role sparkle_runtime nologin;
  end if;
end $$;

create sequence public.sparkle_order_reference;

create table public.admin_members (
  user_id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  active boolean not null default true
);
create table public.admin_sessions (
  sid varchar primary key,
  sess json not null,
  expire timestamp(6) not null
);
create index admin_sessions_expire_idx on public.admin_sessions(expire);
create table public.catalog_products (
  slug text primary key,
  published boolean not null default false,
  archived boolean not null default false,
  presentation jsonb not null check (jsonb_typeof(presentation) = 'object')
);
create table public.catalog_skus (
  product_slug text not null references public.catalog_products(slug),
  variant text not null default '',
  base_price integer check (base_price >= 0 and base_price <= 100000000),
  sale_price integer check (sale_price >= 0 and sale_price <= base_price),
  stock integer check (stock >= 0),
  low_stock integer not null default 2 check (low_stock >= 0),
  active boolean not null default true,
  primary key (product_slug, variant)
);
create table public.delivery_areas (
  code text primary key,
  name text not null,
  name_ar text not null,
  region text references public.delivery_areas(code),
  fee integer check (fee >= 0 and fee <= 1000000),
  active boolean not null default true,
  selectable boolean not null default true,
  check (region is distinct from code)
);
create table public.shop_settings (
  singleton boolean primary key default true check (singleton),
  whatsapp text not null check (whatsapp ~ '^[1-9][0-9]{7,14}$')
);
insert into public.shop_settings (whatsapp) values ('970594503571');
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  reference bigint not null unique default nextval('public.sparkle_order_reference'),
  submission uuid not null unique,
  status text not null default 'Pending' check (status in ('Pending','Confirmed','Preparing','Shipped','Delivered','Cancelled')),
  paid boolean not null default false check (not paid or status = 'Delivered'),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.shop_orders(id),
  admin_id uuid references public.admin_members(user_id) on delete set null,
  event text not null,
  created_at timestamptz not null default now()
);
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_slug text not null,
  variant text not null,
  order_id uuid references public.shop_orders(id),
  delta integer not null check (delta <> 0),
  created_at timestamptz not null default now(),
  foreign key (product_slug, variant) references public.catalog_skus(product_slug, variant)
);
create table public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  details jsonb not null,
  status text not null default 'Pending' check (status in ('Pending','Quoted','Confirmed','Preparing','Shipped','Delivered','Cancelled')),
  quote integer check (quote >= 0),
  created_at timestamptz not null default now()
);

alter table public.admin_members enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_skus enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_orders enable row level security;
alter table public.order_events enable row level security;
alter table public.stock_movements enable row level security;
alter table public.custom_requests enable row level security;
alter table public.admin_sessions enable row level security;
grant usage on schema public to sparkle_runtime;
grant select on public.admin_members to sparkle_runtime;
grant select, insert, update, delete on public.admin_sessions to sparkle_runtime;
grant select, insert, update on public.catalog_products, public.catalog_skus,
  public.delivery_areas, public.shop_settings, public.shop_orders, public.custom_requests to sparkle_runtime;
grant select, insert on public.order_events, public.stock_movements to sparkle_runtime;
grant usage on sequence public.sparkle_order_reference, public.order_events_id_seq, public.stock_movements_id_seq to sparkle_runtime;

do $$
declare relation text;
begin
  foreach relation in array array['admin_members','admin_sessions','catalog_products','catalog_skus',
    'delivery_areas','shop_settings','shop_orders','custom_requests','order_events','stock_movements'] loop
    execute format('create policy sparkle_api on public.%I to sparkle_runtime using (true) with check (true)', relation);
  end loop;
end $$;

create function public.sparkle_quote(items jsonb, area_code text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  fee integer;
  result jsonb;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 40 then
    raise exception 'invalid_cart';
  end if;
  select coalesce(area.fee, region.fee) into fee
    from public.delivery_areas area
    left join public.delivery_areas region on region.code = area.region and region.active
    where area.code = area_code and area.active and area.selectable;
  if fee is null then raise exception 'delivery_unavailable'; end if;

  with requested as (
    select item->>'productId' as slug, coalesce(item->>'variantId','') as variant,
      sum((item->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(items) item group by 1, 2
  ), priced as (
    select r.*, p.presentation, s.base_price, coalesce(s.sale_price,s.base_price) as price
    from requested r
    join public.catalog_products p on p.slug = r.slug and p.published and not p.archived
    join public.catalog_skus s on s.product_slug = r.slug and s.variant = r.variant
      and s.active and s.stock >= r.quantity and s.base_price is not null
    where r.quantity between 1 and 999
  )
  select jsonb_build_object(
    'lines', jsonb_agg(jsonb_build_object('productId',slug,'variantId',variant,
      'quantity',quantity,'originalPrice',base_price,'unitPrice',price,
      'name',presentation->>'name','nameAr',presentation->>'nameAr',
      'option',(select v from jsonb_array_elements(coalesce(presentation->'variants','[]'::jsonb)) v where v->>'id' = variant limit 1),
      'image',presentation->>'image') order by slug,variant),
    'subtotal',sum(base_price::bigint*quantity), 'discount',sum((base_price-price)::bigint*quantity),
    'deliveryFee',fee,'total',sum(price::bigint*quantity)+fee)
    into result from priced
    having count(*) = (select count(*) from requested) and count(*) > 0;
  if result is null then raise exception 'stock_unavailable'; end if;
  return result;
end $$;

create function public.sparkle_submit(submission_id uuid, items jsonb, customer jsonb, expected jsonb, language text)
returns public.shop_orders language plpgsql set search_path = '' as $$
declare
  saved public.shop_orders;
  quote jsonb;
  business_number text;
  destination jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(submission_id::text, 0));
  select * into saved from public.shop_orders where submission = submission_id;
  if found then return saved; end if;
  quote := public.sparkle_quote(items,customer->>'area');
  if quote is distinct from expected then raise exception 'quote_changed'; end if;
  select whatsapp into business_number from public.shop_settings where singleton;
  select jsonb_build_object('name',name,'nameAr',name_ar) into destination
    from public.delivery_areas where code = customer->>'area';
  insert into public.shop_orders (submission,snapshot)
    values (submission_id,quote || jsonb_build_object('customer',customer,'destination',destination,
      'language',language,'whatsapp',business_number,'paymentMethod','COD'))
    returning * into saved;
  insert into public.order_events (order_id,event) values (saved.id,'Pending');
  return saved;
end $$;

create function public.sparkle_transition(target uuid, next_status text, actor uuid)
returns public.shop_orders language plpgsql set search_path = '' as $$
declare
  saved public.shop_orders;
  line jsonb;
  adjustment integer;
  product text;
  option_id text;
begin
  select * into strict saved from public.shop_orders where id = target for update;
  if saved.status = next_status or (next_status = 'Paid' and saved.paid) then return saved; end if;
  if not (
    (saved.status = 'Pending' and next_status in ('Confirmed','Cancelled')) or
    (saved.status = 'Confirmed' and next_status in ('Preparing','Cancelled')) or
    (saved.status = 'Preparing' and next_status in ('Shipped','Cancelled')) or
    (saved.status = 'Shipped' and next_status = 'Delivered') or
    (saved.status = 'Delivered' and next_status = 'Paid')
  ) then raise exception 'invalid_transition'; end if;

  if next_status = 'Confirmed' or (next_status = 'Cancelled' and saved.status <> 'Pending') then
    for line in select value from jsonb_array_elements(saved.snapshot->'lines') order by value->>'productId', value->>'variantId' loop
      product := line->>'productId';
      option_id := line->>'variantId';
      adjustment := (line->>'quantity')::integer * case when next_status = 'Confirmed' then -1 else 1 end;
      update public.catalog_skus s set stock = s.stock + adjustment
        where s.product_slug = product and s.variant = option_id and s.stock + adjustment >= 0
          and (adjustment > 0 or (s.active and exists (
            select 1 from public.catalog_products p where p.slug = product and p.published and not p.archived
          )));
      if not found then raise exception 'stock_unavailable'; end if;
      insert into public.stock_movements (product_slug,variant,order_id,delta) values (product,option_id,target,adjustment);
    end loop;
  end if;

  update public.shop_orders set status = case when next_status = 'Paid' then status else next_status end,
    paid = paid or next_status = 'Paid' where id = target returning * into saved;
  insert into public.order_events (order_id,admin_id,event) values (target,actor,next_status);
  return saved;
end $$;

revoke execute on function public.sparkle_quote(jsonb,text),
  public.sparkle_submit(uuid,jsonb,jsonb,jsonb,text), public.sparkle_transition(uuid,text,uuid)
  from public;
grant execute on function public.sparkle_quote(jsonb,text),
  public.sparkle_submit(uuid,jsonb,jsonb,jsonb,text), public.sparkle_transition(uuid,text,uuid)
  to sparkle_runtime;
