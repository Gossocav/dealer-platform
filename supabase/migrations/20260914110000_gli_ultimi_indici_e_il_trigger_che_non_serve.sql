-- Cinque indici che la produzione ha, e un trigger che non ha mai avuto.
--
-- **I cinque indici** esistono in produzione e non nei file: qualcuno li ha
-- creati a mano, e in una ricostruzione da zero non tornerebbero. Tre servono
-- al pannello amministrativo (il registro di controllo, cercato per
-- concessionaria, per richiesta e per sessione), uno all'agenda e uno impedisce
-- che due concessionarie finiscano sullo stesso utente.
--
-- Applicati alla produzione non cambiano niente: ci sono gia'.
--
-- **Il trigger che si toglie.** `set_demo_requests_updated_at()` e il suo
-- trigger `trg_demo_requests_updated_at` stanno nei file e **non in
-- produzione**. Tengono aggiornata `demo_requests.updated_at`, che pero'
-- **nessuna riga di codice legge**: verificato il 14/09/2026 su tutto `src/`.
--
-- Fra le due strade -- aggiungere un trigger alla produzione per mantenere un
-- campo che nessuno guarda, oppure toglierlo dai file -- si sceglie la seconda,
-- per la stessa ragione per cui si e' tolta `vehicle_images.updated_at`: una
-- cosa che non serve a nessuno non si porta in produzione solo per far
-- combaciare un conteggio. Il giorno che quel campo servira', il trigger si
-- riscrive.

begin;

-- Il registro di controllo: per concessionaria e data, per richiesta, per sessione.
create index if not exists audit_logs_dealer_created_desc_idx on public.audit_logs using btree (dealer_id, created_at desc);
create index if not exists audit_logs_request_id_idx          on public.audit_logs using btree (request_id);
create index if not exists audit_logs_session_id_idx          on public.audit_logs using btree (session_id);

-- L'agenda: gli appuntamenti di una concessionaria per un contatto, dal piu' recente.
create index if not exists appointments_dealer_lead_start_desc_idx on public.appointments using btree (dealer_id, lead_id, start_at desc);

-- Una sola concessionaria per utente. E' un indice unico, quindi e' anche una
-- regola: senza, lo stesso utente potrebbe risultare titolare di due.
create unique index if not exists dealers_user_id_unique on public.dealers using btree (user_id) where (user_id is not null);

-- Il trigger che tiene aggiornato un campo che nessuno legge.
drop trigger if exists trg_demo_requests_updated_at on public.demo_requests;
drop function if exists public.set_demo_requests_updated_at();

commit;
