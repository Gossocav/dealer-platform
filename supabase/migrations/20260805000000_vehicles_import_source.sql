-- Da dove arriva un veicolo importato, e come si chiama la' da dove arriva.
--
-- Senza questo legame l'importazione automatica non puo' funzionare davvero:
-- oggi un veicolo gia' presente si riconosce dal telaio, e se manca da
-- marca+modello+versione+anno -- che su due Panda 1.2 identiche del 2019 non
-- distingue niente e crea un doppione.
--
-- E soprattutto: senza un identificativo stabile non sapremo mai quando una
-- macchina e' stata venduta. Chi sparisce dalla sorgente e' venduto, ma per
-- accorgersene bisogna poter dire "questo veicolo e' quello numero 7699913 del
-- sito di questa concessionaria", e oggi non si puo'.
--
-- Due colonne e non una: l'identificativo da solo non basta, perche' lo stesso
-- numero puo' appartenere a sorgenti diverse.

begin;

alter table public.vehicles add column if not exists import_source text;
alter table public.vehicles add column if not exists import_source_id text;

-- Lo stesso veicolo non puo' entrare due volte per la stessa concessionaria
-- dalla stessa sorgente. L'indice e' parziale: i veicoli inseriti a mano non
-- hanno sorgente, e non devono ostacolarsi a vicenda.
create unique index if not exists vehicles_import_source_unique
  on public.vehicles (dealer_id, import_source, import_source_id)
  where import_source is not null and import_source_id is not null;

-- Serve a ritrovare in fretta tutto lo stock di una sorgente quando si
-- confronta cio' che c'e' con cio' che la sorgente dichiara ancora.
create index if not exists vehicles_import_source_idx
  on public.vehicles (dealer_id, import_source)
  where import_source is not null;

commit;
