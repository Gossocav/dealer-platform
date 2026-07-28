begin;

-- Chi compila la richiesta demo arriva quasi sempre da una pagina piano
-- (Base, Pro o Elite), ma quella scelta non veniva registrata: all'admin
-- arrivavano richieste identiche e indistinguibili, e l'unico modo per sapere
-- cosa volesse il concessionario era leggerlo nel campo note, se lo scriveva.
--
-- Il campo e' facoltativo: e' un'indicazione commerciale, non un impegno, e
-- chi arriva dalla pagina Demo generica non ha nessun piano da indicare.
alter table public.demo_requests
  add column if not exists interested_plan_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'demo_requests_interested_plan_code_check'
      and conrelid = 'public.demo_requests'::regclass
  ) then
    alter table public.demo_requests
      add constraint demo_requests_interested_plan_code_check
      check (interested_plan_code is null or interested_plan_code in ('base', 'pro', 'elite'));
  end if;
end
$$;

commit;
