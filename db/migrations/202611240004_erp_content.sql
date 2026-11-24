create table public.shop_content (
  section text not null check (section in ('workshops','website')),
  key text not null,
  body jsonb not null,
  primary key(section,key)
);
alter table public.shop_content enable row level security;
grant select,insert,update on public.shop_content to sparkle_runtime;
create policy sparkle_content on public.shop_content to sparkle_runtime using (true) with check (true);

create table public.workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  workshop text not null,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);
alter table public.workshop_registrations enable row level security;
grant select,insert on public.workshop_registrations to sparkle_runtime;
create policy sparkle_registrations on public.workshop_registrations to sparkle_runtime using (true) with check (true);

create function public.sparkle_register_workshop(workshop_key text, customer_name text, customer_phone text)
returns uuid language plpgsql set search_path = '' as $$
declare registration_id uuid;
begin
  update public.shop_content set body=jsonb_set(body,'{seats}',to_jsonb((body->>'seats')::integer-1))
    where section='workshops' and key=workshop_key and (body->>'seats')::integer > 0 and body->>'published'='true';
  if not found then raise exception 'stock_unavailable'; end if;
  insert into public.workshop_registrations(workshop,name,phone)
    values(workshop_key,customer_name,customer_phone) returning id into registration_id;
  return registration_id;
end $$;
revoke execute on function public.sparkle_register_workshop(text,text,text) from public;
grant execute on function public.sparkle_register_workshop(text,text,text) to sparkle_runtime;
