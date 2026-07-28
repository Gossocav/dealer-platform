begin;

-- schema.sql dichiara profiles.id come
--   id uuid primary key references auth.users(id) on delete cascade
-- ma in produzione quel vincolo non esiste: la tabella preesisteva e
-- `create table if not exists` non aggiunge vincoli a una tabella gia' creata.
--
-- Effetto: cancellare un account lasciava il suo profilo orfano per sempre.
-- Il 2026-07-27 la produzione aveva 46 profili a fronte di 2 account, e il
-- riquadro "Utenti registrati" del pannello admin li contava.

-- 1) I profili senza account. Vanno rimossi prima, altrimenti il vincolo non
--    puo' essere creato: Postgres verifica le righe esistenti.
delete from public.profiles p
where not exists (
  select 1 from auth.users u where u.id = p.id
);

-- 2) Il vincolo, cercato per struttura e non per nome: se in passato e' stato
--    creato con un nome diverso non va duplicato.
do $$
declare
  v_esistente text;
begin
  select c.conname
  into v_esistente
  from pg_constraint c
  where c.conrelid = 'public.profiles'::regclass
    and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
  limit 1;

  if v_esistente is not null then
    raise notice 'Vincolo gia presente (%): nulla da fare.', v_esistente;
    return;
  end if;

  alter table public.profiles
    add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

  raise notice 'Vincolo profiles_id_fkey creato: da ora cancellare un account cancella il suo profilo.';
end
$$;

commit;
