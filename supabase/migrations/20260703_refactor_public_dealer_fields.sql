begin;

alter table public.dealers
  add column if not exists whatsapp_phone text;

alter table public.profiles
  alter column email drop not null,
  drop column if exists phone,
  drop column if exists email,
  drop column if exists contact_name;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id
  ) values (
    new.id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;