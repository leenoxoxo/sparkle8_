alter table public.catalog_skus add column unit_cost integer check(unit_cost between 0 and 100000000);
alter table public.shop_orders
  add column admin_notes text not null default '',
  add column delivery_expense integer check(delivery_expense between 0 and 100000000),
  add column actual_unit_costs jsonb not null default '{}'::jsonb check(jsonb_typeof(actual_unit_costs)='object');
create index shop_orders_created_idx on public.shop_orders(created_at desc,id desc);
create index shop_orders_status_created_idx on public.shop_orders(status,created_at desc);

create or replace function public.sparkle_save_product(target text, product jsonb, skus jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  previous_stock integer;
  next_stock integer;
  entry jsonb;
  variant_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target, 1));
  insert into public.catalog_products(slug,published,archived,presentation)
    values(target,(product->>'published')::boolean,(product->>'archived')::boolean,product->'presentation')
    on conflict (slug) do update set published = excluded.published,
      archived = excluded.archived, presentation = excluded.presentation;
  for entry in select value from jsonb_array_elements(skus) order by value->>'variant' loop
    variant_id := entry->>'variant';
    select stock into previous_stock from public.catalog_skus
      where product_slug = target and variant = variant_id for update;
    if found and previous_stock is distinct from (entry->>'expectedStock')::integer then
      raise exception 'inventory_changed';
    end if;
    next_stock := (entry->>'stock')::integer;
    insert into public.catalog_skus(product_slug,variant,base_price,sale_price,stock,low_stock,active,unit_cost)
      values(target,variant_id,(entry->>'base_price')::integer,(entry->>'sale_price')::integer,
        next_stock,(entry->>'low_stock')::integer,true,(entry->>'unit_cost')::integer)
      on conflict (product_slug,variant) do update set base_price = excluded.base_price,
        sale_price = excluded.sale_price, stock = excluded.stock, low_stock = excluded.low_stock, active = true, unit_cost = excluded.unit_cost;
    if coalesce(next_stock,0) <> coalesce(previous_stock,0) then
      insert into public.stock_movements(product_slug,variant,delta)
        values(target,variant_id,coalesce(next_stock,0)-coalesce(previous_stock,0));
    end if;
  end loop;
  update public.catalog_skus s set active = false where product_slug = target and active
    and not exists(select 1 from jsonb_array_elements(skus) e where e->>'variant' = s.variant);
end $$;

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
    on conflict(phone) do update set first_name=excluded.first_name,last_name=excluded.last_name;
  insert into public.shop_orders (submission,snapshot,customer_phone)
    values (submission_id,quote || jsonb_build_object('customer',customer,
      'language',language,'whatsapp',business_number,'paymentMethod','COD'),customer->>'phone')
    returning * into saved;
  insert into public.order_events (order_id,event) values (saved.id,'Pending');
  return saved;
end $$;


create function public.sparkle_bulk_edit_products(targets text[], changes jsonb)
returns void language plpgsql set search_path='' as $$
declare
  target text;
  product public.catalog_products;
  price integer := (changes->>'price')::integer;
  quantity integer := (changes->>'stock')::integer;
  items jsonb;
begin
  for target in select unnest(targets) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(target,1));
    select * into strict product from public.catalog_products where slug=target and not archived for update;
    if price is not null and coalesce(product.presentation->>'priceMode','exact')<>'exact' then raise exception 'bulk_ineligible'; end if;
    if quantity is not null and product.presentation->>'trackStock'='false' then raise exception 'bulk_ineligible'; end if;
    if changes ? 'category' then
      product.presentation := product.presentation || jsonb_build_object('category',changes->>'category','categoryAr',changes->>'categoryAr');
    end if;
    if changes ? 'published' then
      product.published := (changes->>'published')::boolean;
      if product.published then product.presentation := product.presentation || '{"draft":false}'::jsonb; end if;
    end if;
    select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('expectedStock',s.stock,
      'base_price',coalesce(price,s.base_price),'sale_price',case when s.sale_price>price then null else s.sale_price end,
      'stock',coalesce(quantity,s.stock))), '[]'::jsonb) into items
    from public.catalog_skus s where s.product_slug=target and s.active;
    perform public.sparkle_save_product(target,to_jsonb(product),items);
  end loop;
end $$;
revoke execute on function public.sparkle_bulk_edit_products(text[],jsonb) from public;
grant execute on function public.sparkle_bulk_edit_products(text[],jsonb) to sparkle_runtime;
