create table public.shop_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('store','category','products')),
  targets text[] not null,
  type text not null check (type in ('percent','amount')),
  amount integer not null check (amount >= 0 and (type <> 'percent' or amount <= 100)),
  starts timestamptz,
  ends timestamptz,
  active boolean not null
);
alter table public.shop_promotions enable row level security;
grant select,insert,update on public.shop_promotions to sparkle_runtime;
create policy sparkle_promotions on public.shop_promotions to sparkle_runtime using (true) with check (true);

create function public.sparkle_active_price(slug text, category text, base integer, direct integer)
returns integer language sql stable set search_path = '' as $$
  select least(coalesce(direct,base),(
    select min(case when p.type='percent' then round(base::numeric * (100-p.amount)/100)::integer
      else greatest(0,base-p.amount) end)
    from public.shop_promotions p where p.active
      and (p.starts is null or p.starts<=now()) and (p.ends is null or p.ends>now())
      and (p.scope='store' or (p.scope='category' and category=any(p.targets))
        or (p.scope='products' and slug=any(p.targets)))
  ));
$$;
revoke execute on function public.sparkle_active_price(text,text,integer,integer) from public;
grant execute on function public.sparkle_active_price(text,text,integer,integer) to sparkle_runtime;

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
    select r.*, p.presentation, s.base_price, public.sparkle_active_price(p.slug,p.presentation->>'category',s.base_price,s.sale_price) as price
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
