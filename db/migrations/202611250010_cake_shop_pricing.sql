alter table public.shop_categories
  drop constraint shop_categories_section_check,
  add check (section in ('ready','kits','cakes')),
  add column description text not null default '',
  add column description_ar text not null default '',
  add column section_intro boolean not null default false,
  add check (not section_intro or (parent is null and section='cakes'));
create unique index sparkle_shop_section_intro on public.shop_categories(section) where section_intro;

insert into public.shop_categories(name,name_ar,section,description,description_ar,section_intro)
values ('Fake Cake Boxes','علب كيك وهمية','cakes',
  'A little collection of dreamy boxes, made just for you. A cream-decorated heart-shaped box designed to look like a tiny dreamy cake.',
  'تشكيلة صغيرة من العلب الحالمة المصنوعة خصيصاً لكِ. علبة على شكل قلب مزيّنة بالكريمة لتبدو كقطعة كيك صغيرة حالمة.',true)
on conflict(name) do update set section='cakes',parent=null,section_intro=true;

update public.catalog_products set presentation=presentation || jsonb_build_object(
  'category','Fake Cake Boxes','categoryAr','علب كيك وهمية')
where presentation->>'category'='Boxes' and (slug like '%cake%box%' or presentation->>'name' ilike '%cake%box%');

-- Convert the former starting-price listing to the approved price range.
update public.catalog_products
set presentation=presentation || '{"priceMode":"range","minPrice":8000,"maxPrice":14000,"trackStock":false,"madeToOrder":true}'::jsonb
where slug='fake-cake-box' and presentation->>'priceMode'='starting' and presentation->>'displayPrice'='₪60+'
  and exists(select 1 from public.catalog_skus s where s.product_slug='fake-cake-box' and s.active and s.stock is null);

alter table public.catalog_products add constraint sparkle_range_prices_check check (
  presentation->>'priceMode' is distinct from 'range' or coalesce((
    jsonb_typeof(presentation->'minPrice')='number' and jsonb_typeof(presentation->'maxPrice')='number'
    and (presentation->>'minPrice') ~ '^[0-9]+$' and (presentation->>'maxPrice') ~ '^[0-9]+$'
    and (presentation->>'minPrice')::numeric between 0 and (presentation->>'maxPrice')::numeric
    and (presentation->>'maxPrice')::numeric <= 100000000
  ),false)
);

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
    select r.*, p.presentation, s.base_price,
      case when p.presentation->>'priceMode'='range' then (p.presentation->>'minPrice')::integer end as min_price,
      case when p.presentation->>'priceMode'='range' then (p.presentation->>'maxPrice')::integer end as max_price,
      public.sparkle_active_price(p.slug,p.presentation->>'category',s.base_price,public.sparkle_direct_price(p.presentation,s.sale_price)) as price
    from counted r
    join public.catalog_products p on p.slug = r.slug and p.published and not p.archived and public.sparkle_category_visible(p.presentation->>'category')
    join public.catalog_skus s on s.product_slug = r.slug and s.variant = r.variant
      and s.active and (p.presentation->>'trackStock'='false' or s.stock >= r.sku_quantity) and (s.base_price is not null or p.presentation->>'priceMode'='range')
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

create function public.sparkle_order_delivery(target uuid, details text, fee integer, prices jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved public.shop_orders;
  revised jsonb;
  fixed_total bigint;
  agreed_total bigint;
begin
  select * into strict saved from public.shop_orders where id=target for update;
  if saved.paid or saved.status='Cancelled' or (prices is not null and saved.status<>'Pending') then
    raise exception 'delivery_locked';
  end if;
  revised := saved.snapshot->'lines';
  if prices is not null then
    if jsonb_array_length(prices) <> jsonb_array_length(revised) or not (saved.snapshot ? 'estimatedMin') then
      raise exception 'unresolved_prices';
    end if;
    if exists(select 1 from jsonb_array_elements(prices) value
      where value <> 'null'::jsonb and (jsonb_typeof(value)<>'number'
        or value::text !~ '^[0-9]{1,9}$' or value::text::numeric>100000000)
    ) then raise exception 'unresolved_prices'; end if;
    select jsonb_agg(line || case when line->>'minPrice' is null then '{}'::jsonb else
        jsonb_build_object('agreedUnitPrice',prices->(ord::integer-1)) end order by ord)
      into revised from jsonb_array_elements(revised) with ordinality as entries(line,ord);
  end if;
  fixed_total := (saved.snapshot->>'subtotal')::bigint-(saved.snapshot->>'discount')::bigint;
  if saved.snapshot ? 'estimatedMin' then
    select case when bool_and(line->>'agreedUnitPrice' is not null)
      then sum((line->>'agreedUnitPrice')::bigint * (line->>'quantity')::integer) end
      into agreed_total from jsonb_array_elements(revised) line where line->>'minPrice' is not null;
  else agreed_total := 0;
  end if;
  update public.shop_orders set delivery_details=details,
    snapshot=snapshot || jsonb_build_object('lines',revised,'deliveryFee',fee,
      'total',fixed_total+agreed_total+coalesce(fee,0))
    where id=target;
  return target;
end $$;

revoke execute on function public.sparkle_order_delivery(uuid,text,integer,jsonb) from public;
grant execute on function public.sparkle_order_delivery(uuid,text,integer,jsonb) to sparkle_runtime;
