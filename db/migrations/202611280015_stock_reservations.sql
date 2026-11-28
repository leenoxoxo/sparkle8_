-- Pending holds affect available stock; physical stock changes only on confirmation.
-- Orders placed before this migration have no hold and retain their existing status.
alter table public.shop_orders add column reservation_expires_at timestamptz;
create index shop_orders_active_reservations on public.shop_orders(reservation_expires_at)
  where status='Pending' and reservation_expires_at is not null;

create function public.sparkle_reserved_stock(excluded_order uuid default null)
returns table(slug text, variant text, quantity bigint)
language sql volatile set search_path='' as $$
  select line->>'productId',line->>'variantId',sum((line->>'quantity')::integer)
  from public.shop_orders o
  cross join lateral jsonb_array_elements(o.snapshot->'lines') line
  where o.status='Pending' and o.reservation_expires_at>clock_timestamp()
    and o.id is distinct from excluded_order
    and line->>'trackStock' is distinct from 'false'
  group by 1,2
$$;

create function public.sparkle_available_quote(items jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  quote jsonb;
begin
  quote := public.sparkle_quote(items);
  if exists (
    select 1 from (
      select line->>'productId' as slug,line->>'variantId' as variant,sum((line->>'quantity')::integer) as quantity
      from jsonb_array_elements(quote->'lines') line where line->>'trackStock' is distinct from 'false'
      group by 1,2
    ) wanted join public.catalog_skus s on s.product_slug=wanted.slug and s.variant=wanted.variant
    join public.sparkle_reserved_stock() r on r.slug=wanted.slug and r.variant=wanted.variant
    where s.stock-r.quantity<wanted.quantity
  ) then raise exception 'stock_unavailable'; end if;
  return quote;
end $$;

revoke execute on function public.sparkle_reserved_stock(uuid),public.sparkle_available_quote(jsonb) from public;
grant execute on function public.sparkle_reserved_stock(uuid),public.sparkle_available_quote(jsonb) to sparkle_runtime;


create or replace function public.sparkle_submit_whatsapp(submission_id uuid, items jsonb, customer jsonb, expected jsonb, language text)
returns public.shop_orders language plpgsql set search_path = '' as $$
declare
  saved public.shop_orders;
  quote jsonb;
  business_number text;
begin
  perform pg_advisory_xact_lock(hashtextextended(submission_id::text, 0));
  select * into saved from public.shop_orders where submission = submission_id;
  if found then return saved; end if;
  quote := public.sparkle_quote(items);
  if quote is distinct from expected then raise exception 'quote_changed'; end if;
  select jsonb_set(quote,'{lines}',jsonb_agg(line || jsonb_build_object('cost',coalesce(s.unit_cost,(p.presentation->>'cost')::integer),'category',p.presentation->>'category','categoryAr',p.presentation->>'categoryAr') order by ord))
    into quote from jsonb_array_elements(quote->'lines') with ordinality as lines(line,ord)
    join public.catalog_products p on p.slug=line->>'productId'
    left join public.catalog_skus s on s.product_slug=p.slug and s.variant=line->>'variantId';
  business_number := '970594503571';
  insert into public.shop_customers(phone,first_name,last_name)
    values(customer->>'phone',customer->>'firstName',customer->>'lastName')
    on conflict(phone) do update set first_name=coalesce(nullif(excluded.first_name,''),shop_customers.first_name),
      last_name=case when excluded.first_name='' then shop_customers.last_name else excluded.last_name end;
  insert into public.shop_orders (submission,snapshot,customer_phone)
    values (submission_id,quote || jsonb_build_object('customer',customer,
      'language',language,'whatsapp',business_number,'paymentMethod','COD'),customer->>'phone')
    returning * into saved;
  insert into public.order_events (order_id,event) values (saved.id,'Pending');
  return saved;
end $$;

create or replace function public.sparkle_submit_destination(submission_id uuid, items jsonb, customer jsonb,
  expected jsonb, language text, destination_code text, destination_region text)
returns public.shop_orders language plpgsql set search_path='' as $$
declare
  prior public.shop_orders;
  destination public.delivery_destinations;
begin
  perform pg_advisory_xact_lock(hashtextextended(submission_id::text, 0));
  select * into prior from public.shop_orders where submission=submission_id;
  if found then return prior; end if;
  select * into destination from public.delivery_destinations
    where code=destination_code and region=destination_region and active for share;
  if not found then raise exception 'invalid_destination'; end if;
  customer := customer || jsonb_build_object(
    'city', destination.name,
    'deliveryDestination', jsonb_build_object('code',destination.code,'region',destination.region,
      'name',destination.name,'nameAr',destination.name_ar));
  -- Match the catalog editor and confirmation's product lock order.
  perform 1 from public.catalog_products p
    where p.slug in (select item->>'productId' from jsonb_array_elements(items) item)
    order by p.slug for update;
  perform public.sparkle_available_quote(items);
  prior := public.sparkle_submit_whatsapp(submission_id,items,customer,expected,language);
  if exists(select 1 from jsonb_array_elements(prior.snapshot->'lines') entry
    where entry->>'trackStock' is distinct from 'false') then
    update public.shop_orders set reservation_expires_at=clock_timestamp()+interval '24 hours'
      where id=prior.id returning * into prior;
  end if;
  return prior;
end $$;

create or replace function public.sparkle_transition(target uuid, next_status text, actor uuid)
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

  if next_status = 'Confirmed' and exists(
    select 1 from jsonb_array_elements(saved.snapshot->'lines') item
      where item->>'minPrice' is not null and item->>'agreedUnitPrice' is null
  ) then raise exception 'unresolved_prices'; end if;

  if next_status = 'Confirmed' then
    -- Acquire product locks before SKU locks, matching the catalog editor.
    perform 1 from public.catalog_products p
      where p.slug in (select value->>'productId' from jsonb_array_elements(saved.snapshot->'lines'))
      order by p.slug for update;
    if saved.reservation_expires_at <= clock_timestamp() then raise exception 'reservation_expired'; end if;
    if exists (
      select 1 from (
        select entry->>'productId' as slug,entry->>'variantId' as variant,sum((entry->>'quantity')::integer) as quantity
        from jsonb_array_elements(saved.snapshot->'lines') as entries(entry)
        where entry->>'trackStock' is distinct from 'false'
        group by 1,2
      ) wanted join public.catalog_skus s on s.product_slug=wanted.slug and s.variant=wanted.variant
      left join public.sparkle_reserved_stock(target) r on r.slug=wanted.slug and r.variant=wanted.variant
      where s.stock-coalesce(r.quantity,0) < wanted.quantity
    ) then raise exception 'stock_unavailable'; end if;
    if exists (
      select 1 from jsonb_array_elements(saved.snapshot->'lines') as lines(line)
      where not exists (
        select 1 from public.catalog_products p join public.catalog_skus s on s.product_slug=p.slug
        where p.slug=lines.line->>'productId' and s.variant=lines.line->>'variantId'
          and p.published and not p.archived and s.active
          and public.sparkle_variant_available(p.presentation,s.variant)
      )
    ) then raise exception 'stock_unavailable'; end if;
  end if;

  if next_status = 'Confirmed' or (next_status = 'Cancelled' and saved.status <> 'Pending') then
    for line in select value from jsonb_array_elements(saved.snapshot->'lines') order by value->>'productId', value->>'variantId' loop
      if line->>'trackStock'='false' then continue; end if;
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
