alter table public.shop_categories
  add column parent text references public.shop_categories(name) on update cascade,
  add column display_order integer not null default 0,
  add column published boolean not null default true,
  add column image text,
  add column section text not null default 'ready' check (section in ('ready','kits')),
  add check (parent is distinct from name);

insert into public.shop_categories(name,name_ar,section)
  values ('DIY Kits','أطقم الأعمال اليدوية','kits')
  on conflict(name) do update set section='kits';

create function public.sparkle_category_visible(category_name text)
returns boolean language sql stable set search_path='' as $$
  select coalesce((select c.published and coalesce(parent.published,true)
    from public.shop_categories c left join public.shop_categories parent on parent.name=c.parent
    where c.name=category_name),true)
$$;
revoke execute on function public.sparkle_category_visible(text) from public;
grant execute on function public.sparkle_category_visible(text) to sparkle_runtime;

update public.catalog_products
set presentation=presentation || jsonb_build_object('kitPieces',case slug when 'single-kit' then 1 else 2 end,
  'kitOptions',jsonb_build_array('Mirror','Phone case','Brush'))
where slug in ('single-kit','duo-kit') and not (presentation ? 'kitOptions');

create or replace function public.sparkle_quote(items jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  result jsonb;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 40 then
    raise exception 'invalid_cart';
  end if;
  with requested as (
    select item->>'productId' as slug, coalesce(item->>'variantId','') as variant,
      coalesce(item->'kitChoices','[]'::jsonb) as choices, sum((item->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(items) item group by 1, 2, 3
  ), counted as (
    select *,sum(quantity) over(partition by slug,variant) as sku_quantity from requested
  ), priced as (
    select r.*, p.presentation, s.base_price, public.sparkle_active_price(p.slug,p.presentation->>'category',s.base_price,public.sparkle_direct_price(p.presentation,s.sale_price)) as price
    from counted r
    join public.catalog_products p on p.slug = r.slug and p.published and not p.archived and public.sparkle_category_visible(p.presentation->>'category')
    join public.catalog_skus s on s.product_slug = r.slug and s.variant = r.variant
      and s.active and (p.presentation->>'trackStock'='false' or s.stock >= r.sku_quantity) and s.base_price is not null
    where r.sku_quantity between 1 and 999 and
      case when p.presentation->>'kind'='kit' and jsonb_array_length(coalesce(p.presentation->'kitOptions','[]'))>0
        then jsonb_array_length(r.choices)=coalesce((p.presentation->>'kitPieces')::integer,1)
          and not exists(select 1 from jsonb_array_elements_text(r.choices) choice
            where not (p.presentation->'kitOptions' ? choice))
        else r.choices='[]'::jsonb end
  )
  select jsonb_build_object(
    'lines', jsonb_agg(jsonb_build_object('productId',slug,'variantId',variant,
      'quantity',quantity,'kitChoices',choices,'trackStock',coalesce((presentation->>'trackStock')::boolean,true),'originalPrice',base_price,'unitPrice',price,
      'name',presentation->>'name','nameAr',presentation->>'nameAr',
      'option',(select v from jsonb_array_elements(coalesce(presentation->'variants','[]'::jsonb)) v where v->>'id' = variant limit 1),
      'image',presentation->>'image') order by slug,variant,choices),
    'subtotal',sum(base_price::bigint*quantity), 'discount',sum((base_price-price)::bigint*quantity),
    'deliveryFee',null,'total',sum(price::bigint*quantity))
    into result from priced
    having count(*) = (select count(*) from requested) and count(*) > 0;
  if result is null then raise exception 'stock_unavailable'; end if;
  return result;
end $$;
