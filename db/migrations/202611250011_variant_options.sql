create function public.sparkle_variant_option(presentation jsonb, variant text)
returns jsonb language sql immutable set search_path='' as $$
  select value from jsonb_array_elements(coalesce(presentation->'variants','[]'::jsonb))
    where value->>'id'=variant limit 1
$$;

create function public.sparkle_variant_available(presentation jsonb, variant text)
returns boolean language sql immutable set search_path='' as $$
  select case when variant='' then jsonb_array_length(coalesce(presentation->'variants','[]'::jsonb))=0
    else exists(select 1 from public.sparkle_variant_option(presentation,variant) opt
      where opt is not null and opt->>'enabled' is distinct from 'false' and opt->>'visible' is distinct from 'false') end
$$;

create function public.sparkle_variant_base(presentation jsonb, variant text, base integer)
returns integer language sql immutable set search_path='' as $$
  select coalesce(base,case when variant<>'' and presentation->>'priceMode'='exact'
    then (presentation->>'defaultPrice')::integer end)
$$;

revoke execute on function public.sparkle_variant_option(jsonb,text), public.sparkle_variant_available(jsonb,text),
  public.sparkle_variant_base(jsonb,text,integer) from public;
grant execute on function public.sparkle_variant_option(jsonb,text), public.sparkle_variant_available(jsonb,text),
  public.sparkle_variant_base(jsonb,text,integer) to sparkle_runtime;

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
  return result;
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
