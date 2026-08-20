-- Le note interne su un lead.
--
-- La scheda del lead mostra da sempre un riquadro "Note interne" con dentro un
-- campo di testo, e sotto la frase "Le note saranno salvate nel database nel
-- prossimo aggiornamento". Quel campo non ha mai salvato niente: il
-- concessionario scriveva "richiamare giovedi'", cambiava pagina, e la nota
-- spariva.
--
-- Le tabelle customers e appointments hanno gia' la loro colonna notes: questa
-- e' l'unica che mancava.

begin;

alter table public.leads add column if not exists notes text;

commit;
