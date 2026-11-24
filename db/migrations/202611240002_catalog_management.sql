create function public.sparkle_save_product(target text, product jsonb, skus jsonb)
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
    insert into public.catalog_skus(product_slug,variant,base_price,sale_price,stock,low_stock,active)
      values(target,variant_id,(entry->>'base_price')::integer,(entry->>'sale_price')::integer,
        next_stock,(entry->>'low_stock')::integer,true)
      on conflict (product_slug,variant) do update set base_price = excluded.base_price,
        sale_price = excluded.sale_price, stock = excluded.stock, low_stock = excluded.low_stock, active = true;
    if coalesce(next_stock,0) <> coalesce(previous_stock,0) then
      insert into public.stock_movements(product_slug,variant,delta)
        values(target,variant_id,coalesce(next_stock,0)-coalesce(previous_stock,0));
    end if;
  end loop;
  update public.catalog_skus s set active = false where product_slug = target and active
    and not exists(select 1 from jsonb_array_elements(skus) e where e->>'variant' = s.variant);
end $$;

revoke execute on function public.sparkle_save_product(text,jsonb,jsonb) from public;
grant execute on function public.sparkle_save_product(text,jsonb,jsonb) to sparkle_runtime;
