create table public.shop_categories (
  name text primary key,
  name_ar text not null default ''
);
insert into public.shop_categories(name,name_ar)
select presentation->>'category',coalesce(max(presentation->>'categoryAr'),'')
from public.catalog_products group by 1 on conflict do nothing;
alter table public.shop_categories enable row level security;
grant select,insert,update,delete on public.shop_categories to sparkle_runtime;
create policy sparkle_categories on public.shop_categories to sparkle_runtime using (true) with check (true);

create function public.sparkle_admin_save_product(target text, product jsonb, skus jsonb, create_only boolean)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(target,1));
  if create_only and exists(select 1 from public.catalog_products where slug=target) then
    raise exception 'duplicate_slug';
  end if;
  perform public.sparkle_save_product(target,product,skus);
end $$;
revoke execute on function public.sparkle_admin_save_product(text,jsonb,jsonb,boolean) from public;
grant execute on function public.sparkle_admin_save_product(text,jsonb,jsonb,boolean) to sparkle_runtime;

create function public.sparkle_direct_price(presentation jsonb, price integer)
returns integer language sql stable set search_path = '' as $$
  select case
    when (presentation->>'saleStarts' is null or (presentation->>'saleStarts')::timestamptz <= now())
     and (presentation->>'saleEnds' is null or (presentation->>'saleEnds')::timestamptz > now()) then price
    else null end;
$$;
revoke execute on function public.sparkle_direct_price(jsonb,integer) from public;
grant execute on function public.sparkle_direct_price(jsonb,integer) to sparkle_runtime;

create or replace function public.sparkle_quote(items jsonb, area_code text)
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
    'deliveryFee',fee,'total',sum(price::bigint*quantity)+fee)
    into result from priced
    having count(*) = (select count(*) from requested) and count(*) > 0;
  if result is null then raise exception 'stock_unavailable'; end if;
  return result;
end $$;



create or replace function public.sparkle_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'orders',(select count(*) from public.shop_orders),
    'pending',(select count(*) from public.shop_orders where status = 'Pending'),
    'sales',(select coalesce(sum((snapshot->>'total')::bigint),0) from public.shop_orders where status in ('Confirmed','Preparing','Shipped','Delivered')),
    'revenue',(select coalesce(sum((snapshot->>'total')::bigint),0) from public.shop_orders where paid),
    'stock',(select coalesce(sum(s.stock),0) from public.catalog_skus s join public.catalog_products p on p.slug=s.product_slug where s.active and not p.archived and p.presentation->>'trackStock' is distinct from 'false'),
    'lowStock',(select coalesce(jsonb_agg(jsonb_build_object('slug',s.product_slug,'variant',s.variant,'stock',s.stock,'name',p.presentation->>'name')), '[]')
      from public.catalog_skus s join public.catalog_products p on p.slug=s.product_slug where s.active and not p.archived and p.presentation->>'trackStock' is distinct from 'false' and s.stock <= s.low_stock)
  );
$$;
