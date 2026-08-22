-- =============================================================================
-- L'archivio delle fotografie: non piu' percorribile da chiunque.
-- =============================================================================
--
-- Con la sola chiave pubblica del sito si potevano elencare le cartelle del
-- secchio "vehicle-images" e leggerne la struttura: una cartella per
-- concessionaria, dentro una per veicolo, dentro i nomi dei file. I file non
-- si scaricavano -- il secchio e' privato e servono indirizzi firmati -- ma
-- l'impianto era in chiaro, e i nomi delle cartelle sono identificativi veri.
--
-- Il permesso non si poteva togliere e basta: era lo stesso che serviva al
-- marketplace per **firmare** gli indirizzi delle foto pubbliche. Prima di
-- applicare questa migration, il codice e' stato cambiato in modo che a
-- firmare sia la chiave di servizio, sul server
-- (storageSigner in src/lib/public-marketplace.ts).
--
-- Si tocca solo il secchio delle foto veicolo: le politiche degli altri --
-- fra cui le visure camerali delle richieste demo -- restano dove sono.

begin;

-- Via le politiche esistenti che riguardano questo secchio, qualunque nome
-- abbiano: e' l'unico modo per sapere cosa resta in piedi.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%vehicle-images%'
        or coalesce(with_check, '') like '%vehicle-images%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end;
$$;

-- Nessuna politica per "anon": senza, un visitatore non vede nulla
-- dell'archivio. Le foto del marketplace continuano a comparire perche'
-- l'indirizzo firmato glielo prepara il server.

-- Chi ha fatto login vede le fotografie della propria concessionaria, e
-- quelle appena caricate che ancora non hanno una riga nel database.
create policy foto_veicolo_lettura_propria
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vehicle-images'
  and (
    -- Il caricamento del gestionale scrive in una cartella intestata
    -- all'utente: e' il caso della fotografia appena caricata, prima che la
    -- riga corrispondente esista.
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.vehicle_images vi
      where vi.image_url = storage.objects.name
        and vi.dealer_id = public.current_dealer_id()
    )
  )
);

create policy foto_veicolo_caricamento_proprio
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy foto_veicolo_sostituzione_propria
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy foto_veicolo_cancellazione_propria
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-images'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.vehicle_images vi
      where vi.image_url = storage.objects.name
        and vi.dealer_id = public.current_dealer_id()
    )
  )
);

commit;
