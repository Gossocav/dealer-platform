-- L'archivio dei documenti di una vettura.
--
-- Chiesto dal titolare il 03/09/2026: libretto, preventivi, contratti,
-- fatture, revisioni. Con due requisiti dichiarati, che decidono quasi tutto
-- il disegno: si deve poter archiviare **in qualunque stato** si trovi la
-- vettura, e i documenti **devono restare anche dopo che e' stata venduta**.
--
-- **Il secondo requisito vale anche per la cancellazione, non solo per la
-- vendita.** Il concessionario puo' cancellare una vettura dall'elenco -- lo fa
-- per fare pulizia -- e con un vincolo a cascata si porterebbe via i contratti.
-- In Italia un contratto di vendita si conserva dieci anni: qui il legame col
-- veicolo si spezza (`on delete set null`) e il documento resta, cercabile per
-- la targa che aveva. Per questo la targa, il telaio e il nome della vettura
-- sono **copiati sulla riga del documento** e non solo raggiunti attraverso il
-- veicolo: quando il veicolo non c'e' piu', quella copia e' tutto quello che
-- resta per ritrovarlo.
--
-- **Nessuna soglia di piano**: e' di tutti, Base compreso. Deciso dal titolare
-- il 03/09/2026: un archivio dei documenti serve a chiunque venda automobili,
-- e chiuderlo nei piani alti farebbe sembrare il Base incompleto.
--
-- I file stanno in un secchio privato, in cartelle intestate alla
-- concessionaria: nessuna politica per `anon`, quindi con la chiave pubblica
-- del sito non si elenca e non si scarica niente. Sono documenti che
-- contengono dati di persone.
--
-- Provata su un Postgres 15 vero prima di spedirla.

begin;

-- ============================================================
-- Il secchio dei file
-- ============================================================
-- Dieci megabyte per file: un libretto fotografato col telefono ne pesa
-- quattro, un contratto in PDF meno di uno. Il limite non serve a fare
-- economia ma a fermare il caricamento sbagliato -- il video, l'archivio zip --
-- prima che occupi lo spazio di trecento documenti veri.
--
-- I tipi ammessi sono quelli che il browser sa mostrare: un documento che si
-- scarica ma non si apre non e' archiviato, e' perso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-documents',
  'vehicle-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- La tabella
-- ============================================================

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,

  -- Il legame con la vettura si spezza, non si porta dietro il documento.
  vehicle_id uuid references public.vehicles(id) on delete set null,

  -- La vettura com'era: quello che resta quando il veicolo non c'e' piu'.
  vehicle_plate text,
  vehicle_vin text,
  vehicle_label text,

  doc_type text not null default 'altro',
  title text,
  notes text,
  document_date date,

  -- Il file
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_documents_percorso_non_vuoto check (btrim(storage_path) <> ''),
  constraint vehicle_documents_dimensione_positiva check (size_bytes is null or size_bytes > 0),

  -- L'elenco dei tipi sta anche in src/lib/archivio-documenti.ts, che e'
  -- quello che disegna la tendina. Sono due, e devono restare uguali: un test
  -- li confronta riga per riga, perche' un tipo accettato dalla schermata e
  -- rifiutato dal database si scoprirebbe solo al momento di salvare.
  constraint vehicle_documents_tipo_valido check (doc_type in (
    'libretto',
    'certificato_proprieta',
    'contratto_acquisto',
    'contratto_vendita',
    'preventivo',
    'fattura',
    'assicurazione',
    'revisione',
    'tagliando',
    'perizia',
    'garanzia',
    'passaggio_proprieta',
    'altro'
  ))
);

-- Lo stesso file non si archivia due volte.
create unique index if not exists vehicle_documents_percorso_unico
  on public.vehicle_documents (storage_path);

create index if not exists vehicle_documents_dealer_idx
  on public.vehicle_documents (dealer_id, created_at desc);

-- I documenti di una vettura, che e' la domanda piu' frequente.
create index if not exists vehicle_documents_veicolo_idx
  on public.vehicle_documents (vehicle_id)
  where vehicle_id is not null;

-- Si cerca per targa, anche quando la vettura non esiste piu'.
create index if not exists vehicle_documents_targa_idx
  on public.vehicle_documents (dealer_id, upper(btrim(vehicle_plate)));

create index if not exists vehicle_documents_tipo_idx
  on public.vehicle_documents (dealer_id, doc_type);

-- ============================================================
-- La concessionaria la mette il database, e la vettura si fotografa
-- ============================================================

create or replace function public.enforce_vehicle_document_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
  v_veicolo record;
begin
  v_dealer_id := public.current_dealer_id();

  if new.dealer_id is null then
    if v_dealer_id is null then
      raise exception 'Nessuna concessionaria in sessione: il documento non si puo'' attribuire'
        using errcode = '42501';
    end if;
    new.dealer_id := v_dealer_id;
  elsif v_dealer_id is not null and new.dealer_id <> v_dealer_id then
    raise exception 'Il documento non appartiene alla concessionaria collegata'
      using errcode = '42501';
  end if;

  if new.vehicle_id is not null then
    select v.dealer_id, v.plate, v.vin, v.brand, v.model, v.version
      into v_veicolo
      from public.vehicles v
     where v.id = new.vehicle_id;

    if not found or v_veicolo.dealer_id <> new.dealer_id then
      raise exception 'Il veicolo non e'' di questa concessionaria'
        using errcode = '42501';
    end if;

    -- La copia si prende dal veicolo, non da chi scrive: e' la fotografia di
    -- come stavano le cose, e deve essere vera.
    new.vehicle_plate := coalesce(nullif(btrim(v_veicolo.plate), ''), new.vehicle_plate);
    new.vehicle_vin := coalesce(nullif(btrim(v_veicolo.vin), ''), new.vehicle_vin);
    new.vehicle_label := nullif(btrim(concat_ws(' ', v_veicolo.brand, v_veicolo.model, v_veicolo.version)), '');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_document_dealer_id on public.vehicle_documents;

create trigger trg_enforce_vehicle_document_dealer_id
  before insert or update on public.vehicle_documents
  for each row
  execute function public.enforce_vehicle_document_dealer_id();

-- ============================================================
-- Chi li vede
-- ============================================================
-- Solo chi ha fatto login, e solo la propria concessionaria. Nessuna soglia di
-- piano: e' una funzione di tutti. Per `anon` non c'e' nessuna politica.

alter table public.vehicle_documents enable row level security;
alter table public.vehicle_documents force row level security;

drop policy if exists vehicle_documents_select_own on public.vehicle_documents;
drop policy if exists vehicle_documents_insert_own on public.vehicle_documents;
drop policy if exists vehicle_documents_update_own on public.vehicle_documents;
drop policy if exists vehicle_documents_delete_own on public.vehicle_documents;

create policy vehicle_documents_select_own
on public.vehicle_documents
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy vehicle_documents_insert_own
on public.vehicle_documents
for insert
to authenticated
with check (dealer_id = public.current_dealer_id());

create policy vehicle_documents_update_own
on public.vehicle_documents
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (dealer_id = public.current_dealer_id());

create policy vehicle_documents_delete_own
on public.vehicle_documents
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

revoke all on public.vehicle_documents from anon;
grant select, insert, update, delete on public.vehicle_documents to authenticated;
grant select, insert, update, delete on public.vehicle_documents to service_role;

-- ============================================================
-- Chi tocca i file
-- ============================================================
-- La cartella e' intestata alla concessionaria, quindi il confronto e' diretto
-- sul confine che conta. Nell'archivio delle fotografie la prima cartella e'
-- l'utente (20260822010000) perche' li' il file esiste prima della riga che lo
-- descrive; qui la riga si scrive subito dopo, e non serve quel giro.

do $$
declare
  r record;
begin
  for r in
    select policyname
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and (coalesce(qual, '') like '%vehicle-documents%' or coalesce(with_check, '') like '%vehicle-documents%')
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end;
$$;

create policy documenti_veicolo_lettura_propria
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vehicle-documents'
  and split_part(name, '/', 1) = public.current_dealer_id()::text
);

create policy documenti_veicolo_caricamento_proprio
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-documents'
  and split_part(name, '/', 1) = public.current_dealer_id()::text
);

create policy documenti_veicolo_cancellazione_propria
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-documents'
  and split_part(name, '/', 1) = public.current_dealer_id()::text
);

commit;
