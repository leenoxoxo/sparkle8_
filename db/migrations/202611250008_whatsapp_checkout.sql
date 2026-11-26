create table public.shop_customers (
  phone text primary key check (phone ~ '^\+(9705[69]|9725[0-689])[0-9]{7}$'),
  first_name text not null,
  last_name text not null,
  admin_notes text not null default ''
);
alter table public.shop_customers enable row level security;
grant select,insert,update on public.shop_customers to sparkle_runtime;
create policy sparkle_customers on public.shop_customers to sparkle_runtime using (true) with check (true);
alter table public.shop_orders add column customer_phone text references public.shop_customers(phone);
alter table public.shop_orders add column delivery_details text;
create index shop_orders_customer_phone_idx on public.shop_orders(customer_phone,created_at);

with numbers as (
  select id, created_at, snapshot->'customer'->>'name' as name,
    regexp_replace(coalesce(snapshot->'customer'->>'phone',''),'[^0-9]','','g') as digits
  from public.shop_orders
), normalized as (
  select *, case
    when digits ~ '^(00)?9705[69][0-9]{7}$' or digits ~ '^(00)?9725[0-689][0-9]{7}$' then '+' || regexp_replace(digits,'^00','')
    when digits ~ '^05[69][0-9]{7}$' then '+970' || substr(digits,2)
    when digits ~ '^05[0-58][0-9]{7}$' then '+972' || substr(digits,2)
  end as phone from numbers
), saved as (
  insert into public.shop_customers(phone,first_name,last_name)
    select distinct on (phone) phone,split_part(trim(coalesce(name,'')),' ',1),
      regexp_replace(trim(coalesce(name,'')),'^[^ ]+ *','')
    from normalized where phone is not null order by phone,created_at desc,id desc
    returning phone
)
update public.shop_orders o set customer_phone=n.phone
from normalized n join saved s on s.phone=n.phone where o.id=n.id;

create function public.sparkle_quote(items jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  result jsonb;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 40 then
    raise exception 'invalid_cart';
  end if;
  with requested as (
    select item->>'productId' as slug, coalesce(item->>'variantId','') as variant,
      sum((item->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(items) item group by 1, 2
  ), priced as (
    select r.*, p.presentation, s.base_price, public.sparkle_active_price(p.slug,p.presentation->>'category',s.base_price,public.sparkle_direct_price(p.presentation,s.sale_price)) as price
    from requested r
    join public.catalog_products p on p.slug = r.slug and p.published and not p.archived
    join public.catalog_skus s on s.product_slug = r.slug and s.variant = r.variant
      and s.active and (p.presentation->>'trackStock'='false' or s.stock >= r.quantity) and s.base_price is not null
    where r.quantity between 1 and 999
  )
  select jsonb_build_object(
    'lines', jsonb_agg(jsonb_build_object('productId',slug,'variantId',variant,
      'quantity',quantity,'trackStock',coalesce((presentation->>'trackStock')::boolean,true),'originalPrice',base_price,'unitPrice',price,
      'name',presentation->>'name','nameAr',presentation->>'nameAr',
      'option',(select v from jsonb_array_elements(coalesce(presentation->'variants','[]'::jsonb)) v where v->>'id' = variant limit 1),
      'image',presentation->>'image') order by slug,variant),
    'subtotal',sum(base_price::bigint*quantity), 'discount',sum((base_price-price)::bigint*quantity),
    'deliveryFee',null,'total',sum(price::bigint*quantity))
    into result from priced
    having count(*) = (select count(*) from requested) and count(*) > 0;
  if result is null then raise exception 'stock_unavailable'; end if;
  return result;
end $$;

create function public.sparkle_submit_whatsapp(submission_id uuid, items jsonb, customer jsonb, expected jsonb, language text)
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
  select jsonb_set(quote,'{lines}',jsonb_agg(line || jsonb_build_object('cost',(p.presentation->>'cost')::integer) order by ord))
    into quote from jsonb_array_elements(quote->'lines') with ordinality as lines(line,ord)
    join public.catalog_products p on p.slug=line->>'productId';
  business_number := '970594503571';
  insert into public.shop_customers(phone,first_name,last_name)
    values(customer->>'phone',customer->>'firstName',customer->>'lastName')
    on conflict(phone) do update set first_name=excluded.first_name,last_name=excluded.last_name;
  insert into public.shop_orders (submission,snapshot,customer_phone)
    values (submission_id,quote || jsonb_build_object('customer',customer,
      'language',language,'whatsapp',business_number,'paymentMethod','COD'),customer->>'phone')
    returning * into saved;
  insert into public.order_events (order_id,event) values (saved.id,'Pending');
  return saved;
end $$;

revoke execute on function public.sparkle_quote(jsonb), public.sparkle_submit_whatsapp(uuid,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.sparkle_quote(jsonb), public.sparkle_submit_whatsapp(uuid,jsonb,jsonb,jsonb,text) to sparkle_runtime;
