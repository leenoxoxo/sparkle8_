import {adminReport} from './backoffice.js';
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
      select p.*, coalesce(s.skus,'[]'::jsonb) as catalog_skus,
        case when $1 then public.sparkle_quantity_active(p.slug) end as quantity_promotion
      from public.catalog_products p
      left join lateral (select jsonb_agg(to_jsonb(s) || case when $1 then jsonb_build_object(
          'base_price',effective.base_price,'sale_price',
          public.sparkle_active_price(p.slug,p.presentation->>'category',effective.base_price,public.sparkle_direct_price(p.presentation,s.sale_price)))
          else '{}'::jsonb end order by s.variant) as skus
        from public.catalog_skus s
        cross join lateral (select public.sparkle_variant_base(p.presentation,s.variant,s.base_price) as base_price) effective
        where s.product_slug = p.slug) s on true
      where (not $1::boolean or (p.published and not p.archived and public.sparkle_category_visible(p.presentation->>'category'))) order by p.slug
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
    quote: items => value('select public.sparkle_quote($1) as result',[json(items)]),
    submit: ({submission,items,customer,expected,language}) => one('select * from public.sparkle_submit_whatsapp($1,$2,$3,$4,$5)',
      [submission,json(items),json(customer),json(expected),language]),
    order: token => one('select reference,snapshot from public.shop_orders where submission=$1',[token]),
    orders: (offset,group,{search=null,from=null,to=null,status=null,paid=null,sort='recent'}={}) => rows(`
      select o.*, coalesce(e.events,'[]'::jsonb) as order_events from public.shop_orders o
      left join lateral (select jsonb_agg(jsonb_build_object('event',event,'created_at',created_at) order by id) as events
        from public.order_events e where e.order_id=o.id) e on true
      where ($2::text is null or ($2='confirmed' and o.status not in ('Pending','Cancelled'))
        or ($2 in ('pending','processed') and (o.status='Pending')=($2='pending')))
        and ($3::text is null or strpos(lower(trim(concat_ws(' ',o.snapshot->'customer'->>'name',
          o.snapshot->'customer'->>'firstName',o.snapshot->'customer'->>'lastName'))),lower($3))>0
          or strpos(lower(case when o.snapshot->'customer'->>'referenceFormat'='SP'
            then 'SP-' || lpad(o.reference::text,greatest(6,length(o.reference::text)),'0')
            else '#SPK-' || lpad(o.reference::text,greatest(4,length(o.reference::text)),'0') end),lower($3))>0
          or strpos(lower(coalesce(o.snapshot->'customer'->>'city',o.snapshot->'destination'->>'name','')),lower($3))>0
          or (regexp_replace($3,'[^0-9]','','g')<>'' and exists(
            select 1 from (values (coalesce(o.customer_phone,o.snapshot->'customer'->>'phone','')),
              (coalesce(o.snapshot->'customer'->>'alternativePhone',''))) contact(phone)
            where strpos(regexp_replace(contact.phone,'[^0-9]','','g'),
              nullif(regexp_replace(regexp_replace(regexp_replace($3,'[^0-9]','','g'),'^00',''),'^05','5'),''))>0)))
        and ($4::date is null or o.created_at>=($4::date::timestamp at time zone 'Asia/Hebron'))
        and ($5::date is null or o.created_at<(($5::date+1)::timestamp at time zone 'Asia/Hebron'))
        and ($6::text is null or o.status=$6) and ($7::boolean is null or o.paid=$7)
      order by case when $8='oldest' then o.created_at end asc,
        case when $8='highest' then (o.snapshot->>'total')::bigint end desc nulls last,
        o.created_at desc,o.id desc limit 50 offset $1`,[offset,group,search,from,to,status,paid,sort]),
    updateOrderNotes: (id,notes) => one('update public.shop_orders set admin_notes=$2 where id=$1 returning id',[id,notes]),
    updateDirectCosts: (id,delivery,costs) => one(`update public.shop_orders set delivery_expense=$2,actual_unit_costs=$3::jsonb
      where id=$1 and not exists(select 1 from jsonb_object_keys($3::jsonb) key where key::int > jsonb_array_length(snapshot->'lines'))
      returning id`,[id,delivery,json(costs)]),
    bulkProducts: (targets,changes) => rows('select public.sparkle_bulk_edit_products($1,$2)',[targets,json(changes)]),
    updateDelivery: (id,details,fee,prices) => one(
      'select public.sparkle_order_delivery($1,$2,$3,$4) as id',[id,details,fee,prices == null ? null : json(prices)]),
    transition: (id,status,actor) => one('select * from public.sparkle_transition($1,$2,$3)',[id,status,actor]),
    requests: offset => rows('select * from public.custom_requests order by created_at desc,id desc limit 50 offset $1',[offset]),
    saveRequest: (id,status,quote) => rows('update public.custom_requests set status=$2,quote=$3 where id=$1',[id,status,quote]),
    settings: () => one('select whatsapp from public.shop_settings where singleton'),
    setWhatsapp: whatsapp => rows('update public.shop_settings set whatsapp=$1 where singleton',[whatsapp]),
    stats: () => value('select public.sparkle_stats() as result'),
    categories: () => rows(`with products as (
      select presentation->>'category' as name, max(presentation->>'categoryAr') as name_ar,count(*)::int as products
      from public.catalog_products where not archived group by 1
      ) select coalesce(c.name,p.name) as name,coalesce(c.name_ar,p.name_ar,'') as name_ar,c.parent,c.image,
      coalesce(c.section,'ready') as section,coalesce(c.display_order,0) as display_order,
      coalesce(c.published,true) as published,coalesce(p.products,0) as products,
      c.description,c.description_ar,coalesce(c.section_intro,false) as section_intro
      from public.shop_categories c full join products p using(name) order by display_order,name`),
    renameCategory: (from,to,ar,metadata) => rows(`with renamed as (
      update public.catalog_products set presentation=jsonb_set(jsonb_set(presentation,'{category}',to_jsonb($2::text)),'{categoryAr}',to_jsonb($3::text))
      where presentation->>'category'=$1 returning slug
    ), promotions as (
      update public.shop_promotions set targets=array_replace(targets,$1,$2)
      where scope='category' and $1=any(targets) returning id
    ), children as (
      update public.shop_categories set parent=$2 where parent=$1 and $1<>$2 returning name
    ), old as (
      delete from public.shop_categories where name=$1 and name<>$2 returning name
    ) insert into public.shop_categories(name,name_ar,parent,section,published,display_order,image,description,description_ar,section_intro)
      select $2,$3,$4,$5,$6,$7,$8,$9,$10,$11 from (select count(*) from old) as removed
      on conflict(name) do update set name_ar=excluded.name_ar,parent=excluded.parent,section=excluded.section,
      published=excluded.published,display_order=excluded.display_order,image=excluded.image,
      description=excluded.description,description_ar=excluded.description_ar`,
      [from,to,ar,metadata.parent,metadata.section,metadata.published,metadata.displayOrder,metadata.image,metadata.description,metadata.descriptionAr,metadata.sectionIntro]),
    content: section => rows('select key,body from public.shop_content where section=$1 order by key',[section]),
    saveHomepage: (value,publish) => rows(`insert into public.shop_content(section,key,body)
      select 'website', version, jsonb_build_object('published',version='homepage-live','config',$1::jsonb)
      from unnest(case when $2::boolean then array['homepage-draft','homepage-live'] else array['homepage-draft'] end) version
      on conflict(section,key) do update set body=excluded.body`,[json(value),publish]),
    saveContent: (section,key,body) => rows(`insert into public.shop_content(section,key,body) values($1,$2,$3)
      on conflict(section,key) do update set body=excluded.body`,[section,key,json(body)]),
    registrations: () => rows('select * from public.workshop_registrations order by created_at desc limit 250'),
    promotions: () => rows('select * from public.shop_promotions order by name,id'),
    quantityPromotions: () => rows(`
      select q.*, (public.sparkle_quantity_active(q.product_slug)->>'id'=q.id::text
        and p.published and not p.archived and public.sparkle_category_visible(p.presentation->>'category')) is true as storefront_active
      from public.quantity_promotions q join public.catalog_products p on p.slug=q.product_slug
      order by q.archived,q.product_slug,q.starts_at nulls first,q.id`),
    saveQuantityPromotion: (id,draft) => rows('select public.sparkle_save_quantity_promotion($1,$2)',[id,json(draft)]),
    savePromotion: (id,p) => rows(`insert into public.shop_promotions(id,name,scope,targets,type,amount,starts,ends,active)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set name=excluded.name,scope=excluded.scope,
      targets=excluded.targets,type=excluded.type,amount=excluded.amount,starts=excluded.starts,ends=excluded.ends,active=excluded.active`,
      [id,p.name,p.scope,p.targets,p.type,p.amount,p.starts,p.ends,p.active]),
    movements: () => rows(`select m.*, p.presentation->>'name' as name
      from public.stock_movements m join public.catalog_products p on p.slug=m.product_slug
      order by m.id desc limit 250`),
    customers: (offset=0,search=null,filter=null) => rows(`with totals as (
      select c.*, min(o.created_at) as first_order,max(o.created_at) as last_order,count(o.id)::int as order_count,
        coalesce(sum((o.snapshot->>'total')::bigint) filter(where o.status not in ('Pending','Cancelled')),0) as confirmed_total,
        coalesce(sum((o.snapshot->>'total')::bigint) filter(where o.paid),0) as completed_total
      from public.shop_customers c left join public.shop_orders o on o.customer_phone=c.phone
      where $2::text is null or strpos(lower(c.first_name || ' ' || c.last_name),lower($2))>0
        or (regexp_replace($2,'[^0-9]','','g')<>'' and strpos(c.phone,
          nullif(regexp_replace(regexp_replace(regexp_replace($2,'[^0-9]','','g'),'^00',''),'^05','5'),''))>0)
      group by c.phone
    ), page as (
      select * from totals where $3::text is null or ($3='returning' and order_count>1)
        or ($3='outstanding' and confirmed_total>completed_total) or ($3='collected' and completed_total>0)
      order by last_order desc nulls last,phone limit 50 offset $1
    ) select page.*,latest.contact,coalesce(history.orders,'[]'::jsonb) as orders from page
    left join lateral (
      select snapshot->'customer' as contact from public.shop_orders
      where customer_phone=page.phone order by created_at desc,id desc limit 1
    ) latest on true left join lateral (
      select jsonb_agg(jsonb_build_object('reference',o.reference,'status',o.status,'paid',o.paid,'total',o.snapshot->'total',
        'estimatedMin',o.snapshot->'estimatedMin','estimatedMax',o.snapshot->'estimatedMax',
        'referenceFormat',o.snapshot->'customer'->>'referenceFormat','date',o.created_at)
        order by o.created_at desc) as orders from (
          select * from public.shop_orders where customer_phone=page.phone order by created_at desc limit 20
        ) o
    ) history on true order by last_order desc nulls last,phone`,[offset,search,filter]),
    saveCustomerNotes: (phone,notes) => one('update public.shop_customers set admin_notes=$2 where phone=$1 returning phone',[phone,notes]),
    report: (from,to,summary=false) => value(adminReport,[from,to,summary]),
    adminByEmail: email => one('select user_id,email,password_hash from public.admin_members where email=$1 and active',[email]),
    activeAdmin: id => one('select user_id,email from public.admin_members where user_id=$1 and active',[id])
  };
}
