-- =============================================================================
-- La versione non ripete piu' marca e modello, anche sui veicoli gia' dentro.
-- =============================================================================
--
-- L'importazione da sito non trovava una versione separata: trovava un titolo
-- intero ("Hyundai Tucson 1.6 CRDi Xline") e lo scriveva tal quale nel campo
-- Versione, mentre marca e modello stavano gia' in due campi a parte. Ogni
-- veicolo importato nasceva percio' con l'intestazione doppia -- "Hyundai
-- Tucson Hyundai Tucson" -- sull'annuncio pubblico e nel gestionale.
--
-- Il codice adesso scrive solo quello che il titolo aggiunge davvero
-- (src/lib/vehicle-label.ts, usato da import-site e dalla scheda pubblica), ma
-- i veicoli importati prima quel doppione ce l'hanno gia' salvato dentro: fino
-- a qui restava visibile nella pagina di modifica, e sarebbe tornato a galla
-- ovunque si legga il campo senza passare dalla pulizia a video.
--
-- Questa migration lo toglie una volta sola, con la stessa regola del codice.
--
-- Cosa NON fa, di proposito:
--
--   * non tocca marca e modello: li' il dato arriva gia' separato dalla
--     sorgente, e riscriverli sarebbe indovinare;
--   * non tocca le righe che non hanno il difetto -- la condizione finale
--     confronta il valore nuovo con quello vecchio e aggiorna solo se
--     cambierebbe davvero;
--   * non taglia a lunghezza fissa: toglie soltanto cio' che e' gia' scritto
--     nei campi accanto, e solo se sta in testa.
--
-- Non e' ristretta ai veicoli con import_source valorizzato: la stessa
-- ripetizione esiste sui veicoli importati prima che quella colonna esistesse
-- (20260805000000_vehicles_import_source.sql) e su quelli scritti a mano
-- copiando il titolo dal sito. La condizione e' gia' la garanzia: si tocca
-- solo cio' che e' dimostrabilmente ripetuto.

begin;

-- La stessa regola di stripLeadingRepeat in src/lib/vehicle-label.ts: toglie
-- la ripetizione solo se sta in testa e solo a parola intera.
--
-- Il confronto usa left() e non like: marca e modello sono testo scritto da
-- altri e possono contenere '%' o '_', che dentro un like non sarebbero
-- caratteri ma jolly.
create or replace function public.togli_ripetizione_iniziale(valore text, ripetuto text)
returns text
language sql
immutable
as $$
  select case
    when valore is null or ripetuto is null then valore
    when btrim(valore) = '' or btrim(ripetuto) = '' then valore
    when lower(btrim(valore)) = lower(btrim(ripetuto)) then ''
    when left(lower(btrim(valore)), length(btrim(ripetuto)) + 1) = lower(btrim(ripetuto)) || ' '
      then btrim(substr(btrim(valore), length(btrim(ripetuto)) + 1))
    else valore
  end;
$$;

do $$
declare
  righe_pulite integer;
begin
  with pulito as (
    select
      id,
      -- Prima "Marca Modello" insieme, poi il solo modello: un titolo che
      -- ripete entrambi perde entrambe le ripetizioni, non solo la prima.
      nullif(
        btrim(
          public.togli_ripetizione_iniziale(
            public.togli_ripetizione_iniziale(
              version,
              btrim(concat_ws(' ', nullif(btrim(coalesce(brand, '')), ''), nullif(btrim(coalesce(model, '')), '')))
            ),
            btrim(coalesce(model, ''))
          )
        ),
        ''
      ) as versione_nuova
    from public.vehicles
    where version is not null
      and btrim(version) <> ''
  ),
  aggiornati as (
    update public.vehicles v
    set version = p.versione_nuova
    from pulito p
    where v.id = p.id
      -- Solo le righe che cambierebbero davvero: chi ha gia' la versione
      -- pulita non viene riscritto, e updated_at resta quello vero.
      and v.version is distinct from p.versione_nuova
    returning 1
  )
  select count(*) into righe_pulite from aggiornati;

  raise notice 'Versione ripulita su % veicoli.', righe_pulite;
end;
$$;

-- Serviva solo qui: non resta in giro una funzione che nessuno chiama.
drop function if exists public.togli_ripetizione_iniziale(text, text);

commit;
