create table public.quantity_promotions (
  id uuid primary key,
  product_slug text not null references public.catalog_products(slug) on delete cascade,
  mode text not null check(mode in ('fixed','percent')),
  amount integer not null check(amount >= 0 and amount <= case when mode='percent' then 100 else 100000000 end),
  title text not null default '',
  title_ar text not null default '',
  description text not null default '',
  description_ar text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean not null default false,
  archived boolean not null default false,
  stack boolean not null default false,
  check(starts_at is null or ends_at is null or starts_at < ends_at)
);
create index quantity_promotions_product_idx on public.quantity_promotions(product_slug);
alter table public.quantity_promotions enable row level security;
grant select,insert,update on public.quantity_promotions to sparkle_runtime;
create policy sparkle_quantity_promotions on public.quantity_promotions to sparkle_runtime using(true) with check(true);

create function public.sparkle_quantity_eligible(presentation jsonb)
returns boolean language sql immutable set search_path='' as $$
  select presentation->>'kind' is distinct from 'kit' and coalesce(presentation->>'priceMode','exact')='exact'
$$;

create function public.sparkle_quantity_active(target text)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',q.id,'mode',q.mode,'amount',q.amount,'title',q.title,'titleAr',q.title_ar,
    'description',q.description,'descriptionAr',q.description_ar,'stack',q.stack)
  from public.quantity_promotions q join public.catalog_products p on p.slug=q.product_slug
  where q.product_slug=target and q.enabled and not q.archived
    and (q.starts_at is null or q.starts_at <= statement_timestamp())
    and (q.ends_at is null or q.ends_at > statement_timestamp())
    and public.sparkle_quantity_eligible(p.presentation)
$$;

create function public.sparkle_save_quantity_promotion(target uuid, draft jsonb)
returns void language plpgsql set search_path='' as $$
declare
  product text := draft->>'product_slug';
  starts timestamptz := (draft->>'starts_at')::timestamptz;
  ends timestamptz := (draft->>'ends_at')::timestamptz;
  enabled boolean := (draft->>'enabled')::boolean;
  archived boolean := (draft->>'archived')::boolean;
  current_product public.catalog_products;
  previous public.quantity_promotions;
begin
  select * into strict current_product from public.catalog_products where slug=product for update;
  select * into previous from public.quantity_promotions where id=target for update;
  if found and (previous.product_slug<>product or previous.archived) then raise exception 'promotion_locked'; end if;
  if not archived and enabled and (current_product.archived or not public.sparkle_quantity_eligible(current_product.presentation)) then
    raise exception 'promotion_ineligible';
  end if;
  if enabled and not archived and exists (
    select 1 from public.quantity_promotions q where q.product_slug=product and q.id<>target and q.enabled and not q.archived
      and tstzrange(q.starts_at,q.ends_at,'[)') && tstzrange(starts,ends,'[)')
  ) then raise exception 'promotion_conflict'; end if;
  insert into public.quantity_promotions(id,product_slug,mode,amount,title,title_ar,description,description_ar,
    starts_at,ends_at,enabled,archived,stack)
  values(target,product,draft->>'mode',(draft->>'amount')::integer,draft->>'title',draft->>'title_ar',
    draft->>'description',draft->>'description_ar',starts,ends,enabled and not archived,archived,(draft->>'stack')::boolean)
  on conflict(id) do update set mode=excluded.mode,amount=excluded.amount,title=excluded.title,title_ar=excluded.title_ar,
    description=excluded.description,description_ar=excluded.description_ar,starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,enabled=excluded.enabled,archived=excluded.archived,stack=excluded.stack
  where quantity_promotions.product_slug=excluded.product_slug and not quantity_promotions.archived;
  if not found then raise exception 'promotion_locked'; end if;
end $$;

create function public.sparkle_apply_quantity(quote jsonb)
returns jsonb language sql stable set search_path='' as $$
  with lines as (
    select line, ord, line->>'productId' as product, (line->>'quantity')::int as qty,
      (line->>'unitPrice')::int as unit, (line->>'originalPrice')::int as original
    from jsonb_array_elements(quote->'lines') with ordinality as entries(line,ord)
  ), products as materialized (
    select product,public.sparkle_quantity_active(product) as promotion from (select distinct product from lines) p
  ), eligible as (
    select lines.*,promotion,
      sum(qty) over(partition by lines.product order by unit,ord) as position_end,
      sum(qty) over(partition by lines.product) as units
    from lines join products using(product)
    where promotion is not null and unit is not null and (unit=original or (promotion->>'stack')::boolean)
  ), allocations as (
    -- Pair units in ascending price order. Odd positions within complete pairs receive the discount.
    select ord,promotion, (least(position_end,units/2*2)+1)/2-(position_end-qty+1)/2 as discounted_units,
      case when promotion->>'mode'='percent' then (unit*(promotion->>'amount')::bigint+50)/100
        else greatest(0,unit-(promotion->>'amount')::integer) end as unit_savings
    from eligible
  ), totals as (
    select jsonb_agg(line || case when discounted_units*unit_savings>0 then jsonb_build_object(
      'quantityPromotion',promotion,'promotionalQuantity',discounted_units,'promotionalUnitPrice',unit-unit_savings,
      'quantityDiscount',discounted_units*unit_savings,'lineTotal',unit::bigint*qty-discounted_units*unit_savings)
      else '{}'::jsonb end order by lines.ord) as lines,
      coalesce(sum(discounted_units*unit_savings),0) as savings
    from lines left join allocations using(ord)
  )
  select case when savings=0 then quote else quote || jsonb_build_object(
    'lines',lines,'quantityDiscount',savings,'discount',(quote->>'discount')::bigint+savings,
    'total',(quote->>'total')::bigint-savings) ||
    case when quote ? 'estimatedMin' then jsonb_build_object(
      'estimatedMin',(quote->>'estimatedMin')::bigint-savings,'estimatedMax',(quote->>'estimatedMax')::bigint-savings)
    else '{}'::jsonb end end from totals
$$;

revoke execute on function public.sparkle_quantity_eligible(jsonb),public.sparkle_quantity_active(text),
  public.sparkle_save_quantity_promotion(uuid,jsonb),public.sparkle_apply_quantity(jsonb) from public;
grant execute on function public.sparkle_quantity_eligible(jsonb),public.sparkle_quantity_active(text),
  public.sparkle_save_quantity_promotion(uuid,jsonb),public.sparkle_apply_quantity(jsonb) to sparkle_runtime;

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
    select r.*, p.presentation, effective.base_price,
      case when p.presentation->>'priceMode'='range' then (p.presentation->>'minPrice')::integer end as min_price,
      case when p.presentation->>'priceMode'='range' then (p.presentation->>'maxPrice')::integer end as max_price,
      public.sparkle_active_price(p.slug,p.presentation->>'category',effective.base_price,public.sparkle_direct_price(p.presentation,s.sale_price)) as price
    from counted r
    join public.catalog_products p on p.slug = r.slug and p.published and not p.archived and public.sparkle_category_visible(p.presentation->>'category')
    join public.catalog_skus s on s.product_slug = r.slug and s.variant = r.variant
      and s.active and (p.presentation->>'trackStock'='false' or s.stock >= r.sku_quantity)
      and public.sparkle_variant_available(p.presentation,r.variant)
    cross join lateral (select public.sparkle_variant_base(p.presentation,r.variant,s.base_price) as base_price) effective
    where r.sku_quantity between 1 and 999
      and (effective.base_price is not null or p.presentation->>'priceMode'='range') and
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
      'option',public.sparkle_variant_option(presentation,variant) - 'images',
      'image',presentation->>'image') || case when min_price is null then '{}'::jsonb
        else jsonb_build_object('minPrice',min_price,'maxPrice',max_price,
          'pricingExplanation',presentation->>'pricingExplanation','pricingExplanationAr',presentation->>'pricingExplanationAr') end order by slug,variant,choices),
    'subtotal',coalesce(sum(base_price::bigint*quantity) filter(where min_price is null),0),
    'discount',coalesce(sum((base_price-price)::bigint*quantity) filter(where min_price is null),0),
    'deliveryFee',null,'total',case when count(min_price)=0 then sum(price::bigint*quantity) end)
    || case when count(min_price)=0 then '{}'::jsonb else jsonb_build_object(
      'estimatedMin',sum(coalesce(min_price,price)::bigint*quantity),
      'estimatedMax',sum(coalesce(max_price,price)::bigint*quantity)) end
    into result from priced
    having count(*) = (select count(*) from requested) and count(*) > 0;
  if result is null then raise exception 'stock_unavailable'; end if;
  return public.sparkle_apply_quantity(result);
end $$;
