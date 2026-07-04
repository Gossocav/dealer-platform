begin;

alter table public.profiles
  alter column email drop not null;

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists role text,
  add column if not exists status text,
  add column if not exists preferences jsonb;

update public.profiles
set role = coalesce(nullif(trim(role), ''), 'seller')
where role is null or trim(role) = '';

update public.profiles
set status = coalesce(nullif(trim(status), ''), 'active')
where status is null or trim(status) = '';

update public.profiles
set preferences = coalesce(preferences, '{}'::jsonb)
where preferences is null;

alter table public.profiles
  alter column role set default 'seller',
  alter column status set default 'active',
  alter column preferences set default '{}'::jsonb;

alter table public.profiles
  alter column role set not null,
  alter column status set not null,
  alter column preferences set not null;

alter table public.profiles
  drop column if exists email,
  drop column if exists phone,
  drop column if exists contact_name;

alter table public.dealers
  add column if not exists contact_person text,
  add column if not exists legal_name text,
  add column if not exists vat_number text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists whatsapp_phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists zip_code text,
  add column if not exists website text,
  add column if not exists logo_url text,
  add column if not exists description text;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;
