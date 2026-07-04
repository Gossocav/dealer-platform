begin;

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