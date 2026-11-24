import pg from 'pg';
import {databaseError, HttpError} from './errors.js';

const {Pool} = pg;

export function connectionOptions(connectionString) {
  const url = new URL(connectionString);
  if (url.hostname.endsWith('.neon.tech')) url.searchParams.set('sslmode','verify-full');
  return {connectionString:url.toString(),connectionTimeoutMillis:15000,enableChannelBinding:true};
}

export function createPool(connectionString) {
  if (!connectionString) return null;
  const pool = new Pool({...connectionOptions(connectionString),max:4,idleTimeoutMillis:10000});
  pool.on('error', () => console.error('A PostgreSQL connection closed unexpectedly.'));
  return pool;
}

export function repository(pool) {
  const rows = async (query, params = []) => {
    if (!pool) throw new HttpError(503,'store_unconfigured');
    try { return (await pool.query(query,params)).rows; }
    catch (error) { throw databaseError(error); }
  };
  const one = async (...args) => (await rows(...args))[0];
  const value = async (...args) => (await one(...args))?.result;
  const json = JSON.stringify;
  return {
    catalog: (publishedOnly = false) => rows(`
      select p.*, coalesce(s.skus,'[]'::jsonb) as catalog_skus
      from public.catalog_products p
      left join lateral (select jsonb_agg(to_jsonb(s) || case when $1 then jsonb_build_object('sale_price',
          public.sparkle_active_price(p.slug,p.presentation->>'category',s.base_price,public.sparkle_direct_price(p.presentation,s.sale_price))) else '{}'::jsonb end order by s.variant) as skus
        from public.catalog_skus s where s.product_slug = p.slug) s on true
      where (not $1::boolean or (p.published and not p.archived)) order by p.slug
    `,[publishedOnly]),
    productSlugs: () => rows('select slug from public.catalog_products'),
    saveProduct: (target, product, skus, createOnly = false) => rows('select public.sparkle_admin_save_product($1,$2,$3,$4)',[target,json(product),json(skus),createOnly]),
    archiveProduct: id => rows('update public.catalog_products set archived=true,published=false where slug=$1',[id]),
    deleteProduct: id => rows('select public.sparkle_delete_unused_product($1)',[id]),
    delivery: () => rows('select * from public.delivery_areas order by name'),
    regions: (region,code) => one(`
      select exists(select 1 from public.delivery_areas where code=$1 and region is null) as valid,
      exists(select 1 from public.delivery_areas where region=$2) as parent`, [region,code]),
    saveDelivery: area => rows(`
      insert into public.delivery_areas(code,name,name_ar,region,fee,active,selectable) values($1,$2,$3,$4,$5,$6,$7)
      on conflict(code) do update set name=excluded.name,name_ar=excluded.name_ar,
        region=excluded.region,fee=excluded.fee,active=excluded.active,selectable=excluded.selectable
    `,[area.code,area.name,area.name_ar,area.region,area.fee,area.active,area.selectable]),
    quote: (items,area) => value('select public.sparkle_quote($1,$2) as result',[json(items),area]),
    submit: ({submission,items,customer,expected,language}) => one('select * from public.sparkle_submit($1,$2,$3,$4,$5)',
      [submission,json(items),json(customer),json(expected),language]),
    order: token => one('select reference,snapshot from public.shop_orders where submission=$1',[token]),
    orders: offset => rows(`
      select o.*, coalesce(e.events,'[]'::jsonb) as order_events from public.shop_orders o
      left join lateral (select jsonb_agg(jsonb_build_object('event',event,'created_at',created_at) order by id) as events
        from public.order_events e where e.order_id=o.id) e on true
      order by o.created_at desc,o.id desc limit 50 offset $1`,[offset]),
    transition: (id,status,actor) => one('select * from public.sparkle_transition($1,$2,$3)',[id,status,actor]),
    createRequest: details => one('insert into public.custom_requests(details) values($1) returning id',[json(details)]),
    requests: offset => rows('select * from public.custom_requests order by created_at desc,id desc limit 50 offset $1',[offset]),
    saveRequest: (id,status,quote) => rows('update public.custom_requests set status=$2,quote=$3 where id=$1',[id,status,quote]),
    settings: () => one('select whatsapp from public.shop_settings where singleton'),
    setWhatsapp: whatsapp => rows('update public.shop_settings set whatsapp=$1 where singleton',[whatsapp]),
    stats: () => value('select public.sparkle_stats() as result'),
    categories: () => rows(`select name,max(name_ar) as name_ar,sum(products)::int as products from (
      select name,name_ar,0 as products from public.shop_categories union all
      select presentation->>'category',coalesce(presentation->>'categoryAr',''),1
      from public.catalog_products where not archived
      ) categories group by name order by name`),
    renameCategory: (from,to,ar) => rows(`with renamed as (
      update public.catalog_products set presentation=jsonb_set(jsonb_set(presentation,'{category}',to_jsonb($2::text)),'{categoryAr}',to_jsonb($3::text))
      where presentation->>'category'=$1 returning slug
    ), promotions as (
      update public.shop_promotions set targets=array_replace(targets,$1,$2)
      where scope='category' and $1=any(targets) returning id
    ), old as (
      delete from public.shop_categories where name=$1 and name<>$2 returning name
    ) insert into public.shop_categories(name,name_ar) values($2,$3)
      on conflict(name) do update set name_ar=excluded.name_ar`,[from,to,ar]),
    content: section => rows('select key,body from public.shop_content where section=$1 order by key',[section]),
    saveContent: (section,key,body) => rows(`insert into public.shop_content(section,key,body) values($1,$2,$3)
      on conflict(section,key) do update set body=excluded.body`,[section,key,json(body)]),
    registrations: () => rows('select * from public.workshop_registrations order by created_at desc limit 250'),
    registerWorkshop: (key,name,phone) => value('select public.sparkle_register_workshop($1,$2,$3) as result',[key,name,phone]),
    promotions: () => rows('select * from public.shop_promotions order by name,id'),
    savePromotion: (id,p) => rows(`insert into public.shop_promotions(id,name,scope,targets,type,amount,starts,ends,active)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set name=excluded.name,scope=excluded.scope,
      targets=excluded.targets,type=excluded.type,amount=excluded.amount,starts=excluded.starts,ends=excluded.ends,active=excluded.active`,
      [id,p.name,p.scope,p.targets,p.type,p.amount,p.starts,p.ends,p.active]),
    movements: () => rows(`select m.*, p.presentation->>'name' as name
      from public.stock_movements m join public.catalog_products p on p.slug=m.product_slug
      order by m.id desc limit 250`),
    customers: () => rows(`select regexp_replace(snapshot->'customer'->>'phone','[^0-9]','','g') as phone_key,
      (array_agg(snapshot->'customer' order by created_at desc))[1] as customer,
      jsonb_agg(jsonb_build_object('reference',reference,'status',status,'paid',paid,'total',snapshot->'total','date',created_at)
        order by created_at desc) as orders
      from public.shop_orders group by 1 order by max(created_at) desc`),
    report: (from,to) => value(`
      with filtered as (
        select *, (created_at at time zone 'Asia/Hebron')::date as day, (snapshot->>'total')::bigint as total
        from public.shop_orders
        where ($1::date is null or (created_at at time zone 'Asia/Hebron')::date >= $1)
          and ($2::date is null or (created_at at time zone 'Asia/Hebron')::date <= $2)
      ), days as (
        select day,count(*) as orders,
          coalesce(sum(total) filter(where status not in ('Pending','Cancelled')),0) as sales,
          coalesce(sum(total) filter(where paid),0) as revenue
        from filtered group by day
      ), best as (
        select line->>'name' as name,sum((line->>'quantity')::int) as units
        from filtered cross join lateral jsonb_array_elements(snapshot->'lines') line
        where status not in ('Pending','Cancelled') group by 1 order by units desc limit 10
      ), margins as (
        select sum(((line->>'unitPrice')::bigint-(line->>'cost')::bigint)*(line->>'quantity')::int) as value,
          count(*) as lines
        from filtered cross join lateral jsonb_array_elements(snapshot->'lines') line
        where paid and line->>'cost' is not null
      )
      select jsonb_build_object(
        'products',(select count(*) from public.catalog_products where not archived),
        'published',(select count(*) from public.catalog_products where published and not archived),
        'statuses',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from filtered group by status) s),
        'sales',coalesce(sum(total) filter(where status not in ('Pending','Cancelled')),0),
        'revenue',coalesce(sum(total) filter(where paid),0),
        'outstanding',coalesce(sum(total) filter(where not paid and status not in ('Pending','Cancelled')),0),
        'margin',(select value from margins),'costedLines',(select lines from margins),
        'days',(select coalesce(jsonb_agg(days order by day),'[]') from days),
        'best',(select coalesce(jsonb_agg(best order by units desc),'[]') from best),
        'recent',(select coalesce(jsonb_agg(r),'[]') from
          (select reference,status,paid,total,created_at from filtered order by created_at desc limit 8) r)
      ) as result from filtered`,[from,to]),
    adminByEmail: email => one('select user_id,email,password_hash from public.admin_members where email=$1 and active',[email]),
    activeAdmin: id => one('select user_id,email from public.admin_members where user_id=$1 and active',[id])
  };
}
