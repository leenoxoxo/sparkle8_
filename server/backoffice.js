export const adminReport = `
with filtered as materialized (
  select *, (created_at at time zone 'Asia/Hebron')::date as day,
    (snapshot->>'total')::bigint as total, status not in ('Pending','Cancelled') as confirmed
  from public.shop_orders
  where ($1::date is null or created_at >= ($1::date::timestamp at time zone 'Asia/Hebron'))
    and ($2::date is null or created_at < (($2::date+1)::timestamp at time zone 'Asia/Hebron'))
), days as (
  select day,count(*) as orders, count(*) filter(where confirmed) as confirmed,
    count(*) filter(where status='Cancelled') as cancelled,
    coalesce(sum(total) filter(where confirmed),0) as sales,
    coalesce(sum(total) filter(where paid),0) as revenue,
    coalesce(sum(total) filter(where confirmed and not paid),0) as outstanding
  from filtered group by day
), sales as materialized (
  select f.id,line->>'productId' as product,coalesce(line->>'name','') as name,
    line->>'nameAr' as name_ar, coalesce(line->>'category',p.presentation->>'category','') as category,
    coalesce(line->>'categoryAr',p.presentation->>'categoryAr') as category_ar,
    coalesce(line->>'variantId','') as variant, line->'option'->>'name' as variant_name,
    line->'option'->>'nameAr' as variant_ar, (line->>'quantity')::int as units,
    coalesce((line->>'lineTotal')::bigint,coalesce(line->>'agreedUnitPrice',line->>'unitPrice')::bigint*(line->>'quantity')::int) as sales,
    coalesce((line->>'quantityDiscount')::bigint,0) as quantity_discount,
    (line->>'promotionalQuantity')::int as discounted_units,
    coalesce((line->>'originalPrice')::bigint-(line->>'unitPrice')::bigint,0)*(line->>'quantity')::int as standard_discount,
    coalesce((f.actual_unit_costs->>(ord::text))::bigint,(line->>'cost')::bigint)*(line->>'quantity')::int as direct_cost
  from filtered f cross join lateral jsonb_array_elements(f.snapshot->'lines') with ordinality as entry(line,ord)
    left join public.catalog_products p on p.slug=line->>'productId'
  where f.confirmed
), breakdown as (
  select dimension,key,max(label) as name,max(ar) as name_ar,sum(units) as units,
    coalesce(sum(sales),0) as sales, sum(quantity_discount) as quantity_discount,
    sum(standard_discount) as standard_discount,
    case when count(direct_cost)=count(*) and count(sales)=count(*) then sum(sales-direct_cost) end as gross
  from sales cross join lateral (values ('product',product,name,name_ar),('category',category,category,category_ar),
    ('variant',product || ':' || variant,name || case when variant='' then '' else ' · '||coalesce(variant_name,variant) end,
      coalesce(name_ar,name) || case when variant='' then '' else ' · '||coalesce(variant_ar,variant_name,variant) end)
  ) as scope(dimension,key,label,ar) group by dimension,key
), margin as (
  select count(*) as lines,count(direct_cost) as costed,
    case when count(*)>0 and count(direct_cost)=count(*) and count(sales)=count(*) then sum(sales-direct_cost) end as gross,
    coalesce(sum(standard_discount),0) as standard_discount,coalesce(sum(quantity_discount),0) as quantity_discount,
    coalesce(sum(discounted_units),0) as discounted_units,
    count(distinct id) filter(where quantity_discount>0) as promoted_orders from sales
), inventory as (
  select p.slug,p.presentation->>'name' as name,p.presentation->>'nameAr' as name_ar,
    p.published,p.presentation->>'trackStock' is distinct from 'false' as tracked,
    count(s.variant) filter(where s.variant<>'')>0 as variant_managed,
    count(s.stock) as verified,coalesce(sum(s.stock),0) as units,
    bool_or(s.stock>0 and s.stock<=s.low_stock) as low,
    bool_and(s.stock=0) and count(s.stock)=count(s.variant) and count(s.variant)>0 as sold_out
  from public.catalog_products p left join public.catalog_skus s on s.product_slug=p.slug and s.active
   and public.sparkle_variant_available(p.presentation,s.variant)
  where not p.archived
  group by p.slug,p.presentation,p.published
), stock as (
  select count(*) as products,count(*) filter(where published) as published,
    count(*) filter(where tracked) as tracked,count(*) filter(where not tracked) as untracked,
    count(*) filter(where tracked and variant_managed) as variant_managed,
    count(*) filter(where tracked and verified=0) as unverified,
    coalesce(sum(units) filter(where tracked),0) as units,
    count(*) filter(where tracked and low) as low,count(*) filter(where tracked and sold_out) as sold_out from inventory
)
select jsonb_build_object(
  'orders',count(*),'customers',(select count(*) from public.shop_customers),'stock',(select to_jsonb(stock) from stock),
  'statuses',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from filtered group by status) s),
  'sales',coalesce(sum(total) filter(where confirmed),0),'revenue',coalesce(sum(total) filter(where paid),0),
  'outstanding',coalesce(sum(total) filter(where confirmed and not paid),0),
  'margin',(select to_jsonb(margin) from margin),
  'days',(select coalesce(jsonb_agg(days order by day),'[]') from days),
  'breakdown',case when $3::boolean then '[]'::jsonb else
    (select coalesce(jsonb_agg(breakdown order by sales desc,name),'[]') from breakdown) end,
  'best',(select coalesce(jsonb_agg(b order by units desc,name),'[]') from
     (select * from breakdown where dimension='product' order by units desc,name limit 8) b),
  'alerts',(select coalesce(jsonb_agg(a),'[]') from
    (select slug,name,name_ar,units,sold_out from inventory where tracked and (low or sold_out) order by sold_out desc,name limit 8) a),
  'recent',(select coalesce(jsonb_agg(r order by created_at desc),'[]') from
    (select reference,status,paid,total,snapshot->'estimatedMin' as "estimatedMin",
      snapshot->'estimatedMax' as "estimatedMax",snapshot->'customer'->>'referenceFormat' as "referenceFormat",
      created_at from filtered order by created_at desc,id desc limit 8) r)
) as result from filtered`;
