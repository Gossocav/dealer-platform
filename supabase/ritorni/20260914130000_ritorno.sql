-- Ritorno di 20260914130000_le_notifiche_dicono_la_verita_e_non_allagano.sql.
--
-- Rimette le due funzioni **com'erano in produzione il 14/09/2026**, con
-- l'impronta verificata: `sync_stale_notifications` torna a
-- 2f49969f437a2c07cde2f5b410977804.
--
-- **Attenzione a cosa si rimette.** Tornando indietro si riportano in vita
-- tutti e tre i difetti:
--
-- * l'avviso "Lead non contattato da 24 ore" **smette di nuovo di arrivare a
--   chiunque**, perche' torna a cercare uno stato che il database vieta;
-- * le auto che il tetto del piano tiene fuori tornano a essere annunciate
--   come **bozze dimenticate**, che e' falso;
-- * una sincronizzazione da 140 auto torna a scrivere **140 notifiche**.
--
-- Si torna qui solo se qualcosa si rompesse davvero, e in quel caso il difetto
-- va guardato subito, non lasciato.
--
-- **Il vincolo sui tipi e la colonna `conteggio` non si toccano.** Toglierli
-- renderebbe illegali le notifiche gia' scritte con i tipi nuovi, e una
-- colonna con un valore predefinito non da' fastidio a nessuno.

begin;

create or replace function public.create_notification_for_new_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_label text;
begin
  v_vehicle_label := trim(concat_ws(' ', new.brand, new.model, new.version));

  perform public.notify_dealer_users(
    new.dealer_id,
    'vehicle_new',
    'Nuovo Veicolo',
    coalesce(v_vehicle_label, 'Veicolo') || ' appena inserito nel parco auto.',
    'vehicle',
    new.id
  );

  return new;
end;
$$;

create or replace function public.sync_stale_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid := public.current_dealer_id();
  v_inserted integer := 0;
  v_last_inserted integer := 0;
begin
  if v_dealer_id is null then
    return 0;
  end if;

  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_leads as (
    select l.id, l.first_name, l.last_name, l.vehicle_id
    from public.leads l
    where l.dealer_id = v_dealer_id
      and coalesce(lower(l.status), 'created') = 'created'
      and l.created_at <= now() - interval '24 hours'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Lead non contattato da 24 ore',
    trim(concat_ws(' ', coalesce(sl.first_name, ''), coalesce(sl.last_name, ''))) ||
      case
        when sl.vehicle_id is null then ''
        else ' - lead ancora in attesa di contatto'
      end,
    'lead_stale',
    false,
    'lead',
    sl.id
  from stale_leads sl
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  with dealer_users as (
    select p.id as user_id
    from public.profiles p
    where p.dealer_id = v_dealer_id
  ),
  stale_vehicles as (
    select v.id, v.brand, v.model, v.version
    from public.vehicles v
    where v.dealer_id = v_dealer_id
      and coalesce(v.published, false) = false
      and coalesce(lower(v.status), 'draft') <> 'published'
      and v.created_at <= now() - interval '7 days'
  )
  insert into public.notifications (dealer_id, user_id, title, message, type, read, source_type, source_id)
  select
    v_dealer_id,
    du.user_id,
    'Veicolo in bozza da oltre 7 giorni',
    trim(concat_ws(' ', sv.brand, sv.model, sv.version)) || ' non è ancora stato pubblicato.',
    'vehicle_draft_stale',
    false,
    'vehicle',
    sv.id
  from stale_vehicles sv
  cross join dealer_users du
  on conflict (dealer_id, user_id, type, source_type, source_id) do nothing;

  get diagnostics v_last_inserted = row_count;
  v_inserted := v_inserted + v_last_inserted;

  return v_inserted;
end;
$$;

commit;
