-- Le foto si copiano da noi: ogni foto ricorda da dove viene e com'e' andata la copia.
--
-- Perche': al 25/09/2026 4.825 foto su 4.831 vivono su cdn.dealerk.it, un server
-- non nostro. Se DealerK cambia indirizzi o blocca le richieste esterne, tutte
-- le schede di keyauto.it perdono le foto insieme. Questa migration non copia
-- niente: prepara il posto dove scrivere l'indirizzo d'origine e l'esito della
-- copia, e segna le foto di oggi come "da copiare". La copia la fa poi il
-- programma, a lotti. Le regole della copia stanno in supabase/MIGRAZIONI.md,
-- "Le foto stanno su un server non nostro".
--
-- Rieseguibile: ogni istruzione e' scritta per non fallire la seconda volta.

begin;

alter table public.vehicle_images
  add column if not exists origine_url text,
  add column if not exists copia_esito text,
  add column if not exists copia_tentativi integer not null default 0,
  add column if not exists copia_primo_tentativo timestamptz,
  add column if not exists copia_ultimo_tentativo timestamptz,
  add column if not exists copia_ultimo_motivo text,
  add column if not exists copia_primo_non_esiste timestamptz,
  add column if not exists copia_sha256 text,
  add column if not exists copia_byte integer;
-- copia_tentativi conta solo i tentativi VALIDI: quelli fatti in un giro in cui
-- il server delle foto rispondeva. Un giro fermato perche' il server non
-- risponde non consuma tentativi, altrimenti una settimana di guasto di
-- DealerK farebbe uscire dalla coda proprio le foto che si provano per prime,
-- cioe' le copertine delle auto in vetrina.
--
-- copia_primo_tentativo si scrive al primo tentativo, anche quando riesce.
-- copia_ultimo_tentativo si scrive anche in un giro frenato: e' cio' che fa
-- ruotare la coda (una foto rinviata va dopo quelle mai provate) senza
-- consumare tentativi.
--
-- copia_primo_non_esiste: la prima volta che l'origine ha risposto "non esiste"
-- (404 o 410) in un giro in cui il server era SANO, cioe' confermato dalle
-- sentinelle. Torna vuoto a qualunque altra risposta: due "non esiste" divisi
-- da un 200 o da un 403 non sono lo stesso "non esiste" che dura.
--
-- copia_byte arriva a 2 GB: per una foto (l'archivio ne accetta fino a 10 MB)
-- basta. Se un giorno in questa tabella entrassero video, va portato a bigint.

-- Cinque stati, e il primo e' il vuoto: "nessun esito ancora". Una foto con
-- esito vuoto e' MAI PROVATA se copia_ultimo_tentativo e' vuoto, RINVIATA da
-- un giro frenato se e' pieno.
--   copiata             la foto sta nel nostro archivio, image_url e' il suo percorso
--   non-riuscita        tentata e fallita: resta in coda e si riprova
--   sorgente-morta      l'origine ha risposto "non esiste" in due giri
--                       consecutivi, con il server sano, a 24 ore di distanza:
--                       esce dalla galleria pubblica e NON si cancella
--   tentativi-esauriti  "non lo so": troppi tentativi senza arrivare a una
--                       risposta certa. Esce dalla coda, RESTA visibile come
--                       oggi (dall'origine), e si vede nel gestionale. E' la
--                       fine del ciclo che altrimenti non finirebbe mai.
-- Morte ed esaurite tornano in coda con il "riprova", che azzera TUTTI i
-- contatori, o con il controllo settimanale descritto in MIGRAZIONI.md.
alter table public.vehicle_images drop constraint if exists vehicle_images_copia_esito_valido;
alter table public.vehicle_images add constraint vehicle_images_copia_esito_valido
  check (copia_esito is null
         or copia_esito in ('copiata', 'non-riuscita', 'sorgente-morta', 'tentativi-esauriti'));

-- Una foto dichiarata copiata porta con se' la prova: impronta e peso,
-- l'indirizzo da cui e' stata presa, e soprattutto e' SERVITA DA NOI: image_url
-- e' un percorso del nostro archivio, nella forma che il proxy sa servire
-- (<concessionaria>/<id dell'auto di questa riga>/<file>: il proxy legge l'id
-- dell'auto dal secondo pezzo, src/lib/marketplace-foto-firmate.ts). Senza,
-- "copiata" sarebbe una parola: una riga con impronta e peso ma ancora servita
-- da DealerK passerebbe per al sicuro.
alter table public.vehicle_images drop constraint if exists vehicle_images_copia_verificabile;
alter table public.vehicle_images add constraint vehicle_images_copia_verificabile
  check (
    copia_esito is distinct from 'copiata'
    or coalesce(
         origine_url is not null
         and copia_sha256 is not null and copia_sha256 ~ '^[0-9a-f]{64}$'
         and copia_byte is not null and copia_byte > 0
         and image_url is not null
         and image_url !~* '^https?://'
         and split_part(image_url, '/', 2) = vehicle_id::text
         and split_part(image_url, '/', 3) <> '',
         false)
  );
-- Il coalesce non e' un vezzo: in SQL "vuoto ~ modello" non da' ne' vero ne'
-- falso, e un vincolo che riceve "non lo so" lascia passare. Senza, una foto
-- senza impronta risultava copiata: provato su Postgres 17 il 25/09/2026.

-- Per una foto che viene da fuori, "copiata" e "servita dal nostro archivio"
-- sono la stessa cosa, nei due versi: una copiata non e' servita da fuori, e
-- una foto servita dal nostro archivio non puo' tornare in coda senza che
-- image_url torni all'origine. Il "is not distinct from" e il coalesce
-- servono per la stessa ragione di sopra: con "=" un esito vuoto rende il
-- confronto vuoto, e il vincolo lascia passare.
alter table public.vehicle_images drop constraint if exists vehicle_images_copia_e_servita_da_noi;
alter table public.vehicle_images add constraint vehicle_images_copia_e_servita_da_noi
  check (
    origine_url is null
    or coalesce(
         (copia_esito is not distinct from 'copiata') = (image_url !~* '^https?://'),
         false)
  );

-- Un esito di fallimento dice quando e' stato tentato e quante volte. I numeri
-- della regola (quanti tentativi, quanti giorni) NON stanno qui: un vincolo che
-- ripete un valore di prodotto rifiuta la scrittura il giorno che il valore
-- cambia (AGENTS.md, la durata della prova). Qui c'e' solo il buonsenso.
alter table public.vehicle_images drop constraint if exists vehicle_images_copia_tentata;
alter table public.vehicle_images add constraint vehicle_images_copia_tentata
  check (
    copia_esito is null
    or copia_esito = 'copiata'
    or coalesce(
         copia_tentativi > 0
         and copia_primo_tentativo is not null
         and copia_ultimo_tentativo is not null
         and copia_ultimo_tentativo >= copia_primo_tentativo,
         false)
  );

-- Morta vuol dire che l'origine ha detto "non esiste" almeno una volta.
alter table public.vehicle_images drop constraint if exists vehicle_images_copia_morta_con_prova;
alter table public.vehicle_images add constraint vehicle_images_copia_morta_con_prova
  check (copia_esito is distinct from 'sorgente-morta' or copia_primo_non_esiste is not null);

alter table public.vehicle_images drop constraint if exists vehicle_images_copia_tentativi_non_negativi;
alter table public.vehicle_images add constraint vehicle_images_copia_tentativi_non_negativi
  check (copia_tentativi >= 0);

-- Le foto di oggi che stanno su un indirizzo esterno ricordano da dove vengono.
-- Le foto caricate dal gestionale sono gia' nostre e restano senza origine:
-- l'editor le salva come percorso nell'archivio, senza http.
--
-- Contato sulla produzione il 25/09/2026: 4.831 righe, 4.825 cominciano per
-- http e sono tutte su cdn.dealerk.it; le altre 6 sono percorsi; zero
-- indirizzi completi del nostro archivio. Le due esclusioni qui sotto quindi
-- oggi non tolgono niente, ma il codice sa ancora leggere un indirizzo intero
-- di Supabase (mapVehicleImageUrlForDisplay, extractVehicleImagePath): se un
-- giorno qualcuno ne scrivesse uno, senza di esse il programma proverebbe a
-- copiare le nostre foto da se stesse.
update public.vehicle_images
   set origine_url = image_url
 where origine_url is null
   and image_url ~* '^https?://'
   and image_url !~* '^https?://[^/]*supabase\.co/'
   and image_url !~* '^https?://([^/]*\.)?keyauto\.it/';

-- Nessun indice su origine_url, apposta: il confronto foto per foto della
-- sincronizzazione lavora su un veicolo alla volta (poche decine di righe,
-- gia' trovate per vehicle_id). Con 4.831 righe non serve; se la tabella
-- arriva a centinaia di migliaia e compare una ricerca per origine_url su
-- tutte, un indice (vehicle_id, origine_url) e' la prima cosa da aggiungere.

-- La coda di chi copia: solo le righe che hanno ancora qualcosa da fare.
-- Morte ed esaurite ne restano fuori: il ciclo finisce.
create index if not exists vehicle_images_da_copiare
  on public.vehicle_images (vehicle_id, position)
  where origine_url is not null and (copia_esito is null or copia_esito = 'non-riuscita');

commit;
