-- ============================================================
-- Gli stati di contatti e appuntamenti, come li scrive il gestionale
-- ============================================================
--
-- I file dicevano una cosa e la produzione un'altra, e **aveva ragione la
-- produzione**: il gestionale scrive esattamente i valori che la produzione
-- ammette (src/lib/leads.ts, src/lib/appointments.ts). I file erano fermi a
-- un elenco piu' vecchio:
--
--   contatti      file: nuovo, contattato, trattativa, venduto, perso
--                 produzione: nuovo, contattato, appuntamento, proposta_inviata,
--                             chiuso_positivo, chiuso_negativo
--   appuntamenti  file: scheduled, confirmed, completed, cancelled
--                 produzione: programmato, completato, annullato
--
-- Oggi nessuno riceve errori. Ma in una ricostruzione da zero fatta dai file,
-- il CRM Lead avrebbe rifiutato quattro spostamenti su sei e l'Agenda ogni
-- salvataggio. Questa migration porta i file dove sta gia' la produzione:
-- applicata in produzione non cambia niente, perche' riscrive i vincoli con
-- la stessa definizione che c'e' gia'.

begin;

alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
  check (status in ('nuovo', 'contattato', 'appuntamento', 'proposta_inviata', 'chiuso_positivo', 'chiuso_negativo'));

alter table public.appointments
  drop constraint if exists appointments_status_valid;

alter table public.appointments
  add constraint appointments_status_valid
  check (status in ('programmato', 'completato', 'annullato'));

alter table public.appointments
  alter column status set default 'programmato';

commit;
