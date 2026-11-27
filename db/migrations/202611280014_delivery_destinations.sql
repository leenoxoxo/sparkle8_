create table public.delivery_destinations (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  region text not null check (region in ('west-bank','inside-1948','east-jerusalem','west-jerusalem')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 120),
  active boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 1000000)
);
create unique index delivery_destinations_name_region
  on public.delivery_destinations(region,lower(btrim(name)));
create unique index delivery_destinations_ar_region
  on public.delivery_destinations(region,btrim(name_ar));
alter table public.delivery_destinations enable row level security;
grant select, insert, update on public.delivery_destinations to sparkle_runtime;
create policy delivery_destinations_runtime on public.delivery_destinations to sparkle_runtime
  using (true) with check (true);

create function public.sparkle_submit_destination(submission_id uuid, items jsonb, customer jsonb,
  expected jsonb, language text, destination_code text, destination_region text)
returns public.shop_orders language plpgsql set search_path='' as $$
declare
  prior public.shop_orders;
  destination public.delivery_destinations;
begin
  perform pg_advisory_xact_lock(hashtextextended(submission_id::text, 0));
  select * into prior from public.shop_orders where submission=submission_id;
  if found then return prior; end if;
  select * into destination from public.delivery_destinations
    where code=destination_code and region=destination_region and active for share;
  if not found then raise exception 'invalid_destination'; end if;
  customer := customer || jsonb_build_object(
    'city', destination.name,
    'deliveryDestination', jsonb_build_object('code',destination.code,'region',destination.region,
      'name',destination.name,'nameAr',destination.name_ar));
  return public.sparkle_submit_whatsapp(submission_id,items,customer,expected,language);
end $$;
revoke execute on function public.sparkle_submit_destination(uuid,jsonb,jsonb,jsonb,text,text,text) from public;
grant execute on function public.sparkle_submit_destination(uuid,jsonb,jsonb,jsonb,text,text,text) to sparkle_runtime;


insert into public.delivery_destinations(code,region,name,name_ar,display_order) values
  ('nablus','west-bank','Nablus','نابلس',10),
  ('ramallah','west-bank','Ramallah','رام الله',20),
  ('al-bireh','west-bank','Al-Bireh','البيرة',30),
  ('hebron','west-bank','Hebron','الخليل',40),
  ('jenin','west-bank','Jenin','جنين',50),
  ('tulkarm','west-bank','Tulkarm','طولكرم',60),
  ('qalqilya','west-bank','Qalqilya','قلقيلية',70),
  ('bethlehem','west-bank','Bethlehem','بيت لحم',80),
  ('jericho','west-bank','Jericho','أريحا',90),
  ('salfit','west-bank','Salfit','سلفيت',100),
  ('tubas','west-bank','Tubas','طوباس',110),
  ('haifa','inside-1948','Haifa','حيفا',10),
  ('acre','inside-1948','Acre','عكا',20),
  ('nazareth','inside-1948','Nazareth','الناصرة',30),
  ('umm-al-fahm','inside-1948','Umm al-Fahm','أم الفحم',40),
  ('sakhnin','inside-1948','Sakhnin','سخنين',50),
  ('tayibe','inside-1948','Tayibe','الطيبة',60),
  ('tira','inside-1948','Tira','الطيرة',70),
  ('jaffa','inside-1948','Jaffa','يافا',80),
  ('lod','inside-1948','Lod','اللد',90),
  ('ramla','inside-1948','Ramla','الرملة',100),
  ('tel-aviv','inside-1948','Tel Aviv','تل أبيب',110),
  ('kafr-qasim','inside-1948','Kafr Qasim','كفر قاسم',120),
  ('shefa-amr','inside-1948','Shefa-Amr','شفاعمرو',130),
  ('rahat','inside-1948','Rahat','رهط',140),
  ('beersheba','inside-1948','Beersheba','بئر السبع',150),
  ('tamra','inside-1948','Tamra','طمرة',160),
  ('baqa-al-gharbiya','inside-1948','Baqa al-Gharbiya','باقة الغربية',170),
  ('netanya','inside-1948','Netanya','نتانيا',180),
  ('east-jerusalem','east-jerusalem','East Jerusalem','القدس الشرقية',10),
  ('west-jerusalem','west-jerusalem','West Jerusalem','القدس الغربية',10);
