-- ============================================================
-- Le visite agli annunci e alle pagine delle concessionarie
-- ============================================================
--
-- Chiesto dal titolare il 05/09/2026: dal pannello amministrativo vedere il
-- flusso di visitatori di ogni concessionaria e le visualizzazioni dei suoi
-- annunci.
--
-- Prima di oggi la piattaforma non misurava niente: nessuna tabella, e Google
-- Analytics collegato nel codice ma mai configurato in produzione. I numeri
-- cominciano da qui, e non esiste storico da recuperare.
--
-- **Si conta in forma aggregata, non una riga per visita.** Una riga per
-- vettura al giorno: con 248 annunci pubblicati fanno meno di centomila righe
-- l'anno e qualche megabyte. Una riga per visita darebbe analisi piu' fini
-- (orari, provenienza) al prezzo di conservare molti piu' dati su chi
-- naviga, che e' una responsabilita' che non serve a rispondere alla domanda
-- posta.
--
-- **Non si registra nessun dato personale.** Nessun indirizzo IP, nessun
-- identificativo, nessun cookie: solo quante volte una scheda e' stata
-- aperta. E' un numero, non una persona -- ed e' il motivo per cui questa
-- misura non ha bisogno del consenso ai cookie, a differenza di Google
-- Analytics, che conterebbe solo chi accetta.

create table if not exists public.marketplace_views (
  id uuid primary key default gen_random_uuid(),

  dealer_id uuid not null references public.dealers(id) on delete cascade,

  -- Nulla quando la visita e' alla pagina della concessionaria e non a un
  -- annuncio. E' cosi' che una tabella sola risponde a tutte e due le
  -- domande del titolare: il flusso della concessionaria e quello dei suoi
  -- annunci.
  vehicle_id uuid references public.vehicles(id) on delete cascade,

  -- Il giorno italiano, non quello universale: una visita all'una di notte
  -- appartiene alla notte appena passata per chi legge il grafico, e con
  -- l'ora di Greenwich finirebbe nel giorno prima da ottobre a marzo e nel
  -- giorno giusto d'estate -- cioe' sbaglierebbe meta' anno.
  view_day date not null default ((now() at time zone 'Europe/Rome')::date),

  views_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint marketplace_views_conteggio_non_negativo check (views_count >= 0)
);

-- Una riga sola per annuncio al giorno: e' quella che il contatore aggiorna.
create unique index if not exists marketplace_views_annuncio_unico
  on public.marketplace_views (vehicle_id, view_day)
  where vehicle_id is not null;

-- E una sola per concessionaria al giorno, per le visite alla sua pagina.
create unique index if not exists marketplace_views_concessionaria_unico
  on public.marketplace_views (dealer_id, view_day)
  where vehicle_id is null;

-- La domanda del pannello: quante visite ha avuto questa concessionaria negli
-- ultimi giorni.
create index if not exists marketplace_views_dealer_giorno_idx
  on public.marketplace_views (dealer_id, view_day desc);

-- ============================================================
-- Chi puo' leggere e scrivere
-- ============================================================
--
-- Nessuno, a parte il server. Il pannello amministrativo legge con la chiave
-- di servizio; il concessionario per ora non vede questi numeri, ed e' una
-- scelta: si aprono quando saranno assestati.
--
-- La protezione per riga resta accesa anche senza politiche. Senza politiche
-- non passa nessuno, ed e' esattamente cio' che si vuole: e' il modo in cui
-- una tabella si nega per difetto invece che per dimenticanza.

alter table public.marketplace_views enable row level security;

revoke all on public.marketplace_views from anon;
revoke all on public.marketplace_views from authenticated;
grant select, insert, update on public.marketplace_views to service_role;

-- ============================================================
-- Il contatore
-- ============================================================

/**
 * Registra una visita a un annuncio.
 *
 * **La concessionaria la ricava il database dalla vettura.** Se la mandasse
 * il browser, chiunque conoscesse l'indirizzo del punto di raccolta potrebbe
 * attribuire visite alla concessionaria che preferisce, e i numeri del
 * pannello diventerebbero indistinguibili da quelli veri.
 *
 * Una vettura che non esiste o che non e' pubblicata non conta niente e non
 * solleva errori: chi chiama sta servendo una pagina, non deve fallire per
 * un annuncio ritirato un istante prima.
 */
create or replace function public.registra_visita_annuncio(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  select dealer_id into v_dealer_id
  from public.vehicles
  where id = p_vehicle_id
    and (lower(coalesce(status, '')) = 'published' or published is true);

  if v_dealer_id is null then
    return;
  end if;

  insert into public.marketplace_views (dealer_id, vehicle_id, view_day, views_count)
  values (v_dealer_id, p_vehicle_id, ((now() at time zone 'Europe/Rome')::date), 1)
  on conflict (vehicle_id, view_day) where vehicle_id is not null
  do update set
    views_count = public.marketplace_views.views_count + 1,
    updated_at = now();
end;
$$;

/**
 * Registra una visita alla pagina di una concessionaria.
 *
 * Conta solo le concessionarie approvate: le altre non hanno una pagina
 * pubblica, quindi una visita attribuita a loro sarebbe inventata.
 */
create or replace function public.registra_visita_concessionaria(p_dealer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  select id into v_dealer_id
  from public.dealers
  where id = p_dealer_id
    and lower(coalesce(status, '')) = 'approved';

  if v_dealer_id is null then
    return;
  end if;

  insert into public.marketplace_views (dealer_id, vehicle_id, view_day, views_count)
  values (v_dealer_id, null, ((now() at time zone 'Europe/Rome')::date), 1)
  on conflict (dealer_id, view_day) where vehicle_id is null
  do update set
    views_count = public.marketplace_views.views_count + 1,
    updated_at = now();
end;
$$;

-- Le due funzioni le chiama il nostro server con la chiave di servizio, e
-- nessun altro. Una `security definer` lasciata eseguibile da tutti sarebbe
-- una porta aperta: con la sola chiave pubblica del sito si potrebbero
-- gonfiare i numeri di chiunque, un colpo per chiamata.
revoke execute on function public.registra_visita_annuncio(uuid) from public;
revoke execute on function public.registra_visita_annuncio(uuid) from anon;
revoke execute on function public.registra_visita_annuncio(uuid) from authenticated;
grant execute on function public.registra_visita_annuncio(uuid) to service_role;

revoke execute on function public.registra_visita_concessionaria(uuid) from public;
revoke execute on function public.registra_visita_concessionaria(uuid) from anon;
revoke execute on function public.registra_visita_concessionaria(uuid) from authenticated;
grant execute on function public.registra_visita_concessionaria(uuid) to service_role;
