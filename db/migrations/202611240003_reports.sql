create function public.sparkle_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'orders',(select count(*) from public.shop_orders),
    'pending',(select count(*) from public.shop_orders where status = 'Pending'),
    'sales',(select coalesce(sum((snapshot->>'total')::bigint),0) from public.shop_orders where status in ('Confirmed','Preparing','Shipped','Delivered')),
    'revenue',(select coalesce(sum((snapshot->>'total')::bigint),0) from public.shop_orders where paid),
    'stock',(select coalesce(sum(s.stock),0) from public.catalog_skus s join public.catalog_products p on p.slug=s.product_slug where s.active and not p.archived),
    'lowStock',(select coalesce(jsonb_agg(jsonb_build_object('slug',s.product_slug,'variant',s.variant,'stock',s.stock,'name',p.presentation->>'name')), '[]')
      from public.catalog_skus s join public.catalog_products p on p.slug=s.product_slug where s.active and not p.archived and s.stock <= s.low_stock)
  );
$$;
revoke execute on function public.sparkle_stats() from public;
grant execute on function public.sparkle_stats() to sparkle_runtime;
