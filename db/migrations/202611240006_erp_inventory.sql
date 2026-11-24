create function public.sparkle_delete_unused_product(target text)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(target,1));
  perform 1 from public.catalog_products where slug=target and archived for update;
  if not found then raise exception 'archive_required'; end if;
  if exists(select 1 from public.stock_movements where product_slug=target) or
     exists(select 1 from public.shop_orders o cross join lateral jsonb_array_elements(o.snapshot->'lines') line
       where line->>'productId'=target) then raise exception 'product_has_history'; end if;
  delete from public.catalog_skus where product_slug=target;
  delete from public.catalog_products where slug=target;
end $$;
revoke execute on function public.sparkle_delete_unused_product(text) from public;
grant execute on function public.sparkle_delete_unused_product(text) to sparkle_runtime;
grant delete on public.catalog_products,public.catalog_skus to sparkle_runtime;

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


create or replace function public.sparkle_submit(submission_id uuid, items jsonb, customer jsonb, expected jsonb, language text)
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
  select jsonb_set(quote,'{lines}',jsonb_agg(line || jsonb_build_object('cost',(p.presentation->>'cost')::integer) order by ord))
    into quote from jsonb_array_elements(quote->'lines') with ordinality as lines(line,ord)
    join public.catalog_products p on p.slug=line->>'productId';
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
