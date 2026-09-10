-- ============================================================
-- Su dealer_users scrive solo il server
-- ============================================================
--
-- **Cosa chiude.** Provato in laboratorio il 10/09/2026, riproducendo lo
-- stato esatto della produzione, un concessionario collegato poteva chiudere
-- fuori dalla propria concessionaria il titolare di un'altra. In due mosse:
--
--   1. inserire l'altro account nella propria concessionaria come 'invited'
--      -- il limite di un utente per piano ignora le righe non attive, e
--      nessun vincolo impediva di scrivere quello stato;
--   2. con un solo comando, sospendere se stesso e attivare l'altro.
--
-- Il secondo passo riesce perche' `current_dealer_id()` e' STABLE -- le
-- regole per riga lo valutano una volta sola e continuano a vedere chi
-- attacca ancora attivo -- mentre il trigger del limite gira riga per riga e,
-- arrivato all'altro, trova chi attacca gia' sospeso.
--
-- La vittima si ritrova con due appartenenze attive, e `current_dealer_id()`
-- restituisce un valore **solo quando ne trova esattamente una**: quindi non
-- vede piu' niente di suo. Non e' un furto di dati, e' una serratura cambiata
-- da fuori. Otto tentativi su otto riusciti.
--
-- **Perche' non e' bastata 20260717000003**, che questa correzione conteneva
-- gia'. Quella migration non e' mai arrivata in produzione, e non poteva:
-- contiene un riempimento dati con `insert ... on conflict`, e Postgres fa
-- scattare il trigger BEFORE INSERT **prima** di accorgersi che la riga
-- esiste gia'. Il limite di un utente per piano -- nato il 27 luglio, dieci
-- giorni dopo -- la respinge su ogni concessionaria che ha gia' un utente
-- attivo. In una ricostruzione da zero l'ordine e' l'inverso e funziona: e'
-- solo la produzione di oggi a non poterla accettare.
--
-- Qui c'e' lo stesso risultato **senza il riempimento dati**, che in
-- produzione non serve: quelle righe ci sono gia'.
--
-- **Sopravvive a una ricostruzione.** Su un database dove 20260717000003 e'
-- gia' passata questa non trova niente da fare e non fallisce: ogni pezzo e'
-- scritto per poter girare due volte.
--
-- **Cosa NON si rompe.** Le tre sole scritture su questa tabella --
-- attivazione demo, approvazione concessionaria, cambio stato dal pannello --
-- passano tutte dalla chiave di servizio, che scavalca regole e permessi. Non
-- esiste nessuna funzione di passaggio di postazione: niente nel prodotto
-- cambia lo stato di un'appartenenza. Verificato file per file.

-- ------------------------------------------------------------
-- 1) I vincoli che mancavano
-- ------------------------------------------------------------
-- Verificati sui dati veri prima di scrivere questa migration: tre righe,
-- tutte 'dealer_member' e 'active', nessun profilo con due concessionarie.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dealer_users_status_check'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_status_check
      check (status in ('invited', 'active', 'suspended', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dealer_users_role_check'
      and conrelid = 'public.dealer_users'::regclass
  ) then
    alter table public.dealer_users
      add constraint dealer_users_role_check
      check (role = 'dealer_member');
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) Il trigger severo
-- ------------------------------------------------------------
-- Aggiunge, rispetto alla versione del 6 luglio ancora in produzione, il
-- controllo che l'appartenenza corrisponda al profilo: e' cio' che impedisce
-- di infilare nella propria concessionaria l'account di un altro.

create or replace function public.enforce_dealer_user_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_dealer_id uuid;
begin
  if new.profile_id is null then
    raise exception 'profile_id obbligatorio per membership.' using errcode = '23502';
  end if;

  select p.dealer_id into v_profile_dealer_id
  from public.profiles p
  where p.id = new.profile_id;

  if v_profile_dealer_id is null then
    raise exception 'profile_id non associato ad alcun dealer.' using errcode = '42501';
  end if;

  if new.dealer_id is null then
    new.dealer_id := v_profile_dealer_id;
  elsif new.dealer_id is distinct from v_profile_dealer_id then
    raise exception 'dealer_id non coerente con profile_id.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.dealer_id is distinct from old.dealer_id then
      raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
    end if;
    if new.profile_id is distinct from old.profile_id then
      raise exception 'profile_id non puo essere modificato.' using errcode = '42501';
    end if;
  end if;

  new.role := coalesce(nullif(trim(new.role), ''), 'dealer_member');
  new.status := coalesce(nullif(trim(new.status), ''), 'active');
  new.updated_at := now();

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) Una regola sola, di sola lettura
-- ------------------------------------------------------------
-- Le quattro larghe venivano da un file rimasto su un ramo mai unito. Chi e'
-- collegato deve poter leggere **la propria** riga, e nient'altro: le due
-- sole letture che girano come utente filtrano entrambe su profile_id.

drop policy if exists dealer_users_select_own_or_tenant on public.dealer_users;
drop policy if exists dealer_users_insert_tenant on public.dealer_users;
drop policy if exists dealer_users_update_tenant on public.dealer_users;
drop policy if exists dealer_users_delete_tenant on public.dealer_users;
drop policy if exists dealer_users_select_own on public.dealer_users;

create policy dealer_users_select_own
on public.dealer_users
for select
to authenticated
using (profile_id = auth.uid());

-- ------------------------------------------------------------
-- 4) Via i permessi di scrittura
-- ------------------------------------------------------------
-- E' questo che ferma l'attacco al primo passo, prima ancora delle regole.

revoke all on public.dealer_users from public;
revoke all on public.dealer_users from anon;
revoke insert, update, delete on public.dealer_users from authenticated;
grant select on public.dealer_users to authenticated;
grant select, insert, update, delete on public.dealer_users to service_role;
