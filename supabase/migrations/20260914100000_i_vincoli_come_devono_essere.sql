-- Undici vincoli: chi ha ragione, deciso uno per uno.
--
-- **Sta separata dagli indici**, cosi' se una delle due va storta non trascina
-- l'altra.
--
-- Tre gruppi.
--
-- **A. Tre che cambiano la produzione, e sono i soli che cambiano un
-- comportamento.**
--
-- 1. `profiles_dealer_id_fkey` era `on delete cascade`: cancellare una
--    concessionaria **cancellava i profili delle persone** collegate. Diventa
--    `on delete set null`: li scollega. I dati di una persona non spariscono
--    come effetto collaterale di un'altra operazione. Al 14/09/2026 in
--    produzione ci sono 5 profili, 4 collegati a una concessionaria: non e'
--    ancora successo perche' nessuno ha mai cancellato una concessionaria.
--
-- 2. `leads_customer_id_fkey` non aveva nessuna azione, quindi cancellare un
--    cliente veniva rifiutato finche' aveva contatti. Diventa `on delete set
--    null`: il contatto resta, e perde il collegamento al cliente. Lo storico
--    di chi ha scritto alla concessionaria non si porta via un cliente.
--
-- 3. `vehicle_images_position_non_negative` non c'era: una fotografia poteva
--    avere posizione -1, e l'ordine delle foto sulla scheda e' proprio quella
--    colonna. Verificato prima di aggiungerlo: **zero fotografie negative su
--    4.779**.
--
-- **B. Cinque che allineano i file a una produzione che ha ragione.**
-- Applicate alla produzione non cambiano niente, perche' rifanno cio' che c'e'
-- gia' con lo stesso identico contenuto.
--
-- 4. `audit_logs_created_by_fkey`: nei file punta a `profiles(id)`, in
--    produzione ad `auth.users(id)`. Ha ragione la produzione, e non e' una
--    questione di gusto: `profiles.id` **non e'** l'identificativo
--    dell'utente -- ha un suo `gen_random_uuid()` -- quindi il vincolo scritto
--    nei file collega due colonne che non parlano della stessa cosa.
-- 5. `dealers_user_id_fkey`: esiste solo in produzione. Si aggiunge ai file.
-- 6-7. `dealer_users_dealer_fkey` e `dealer_users_profile_fkey`: stessa
--    identica regola della produzione, **nome diverso**. Si adottano i nomi
--    della produzione.
-- 8. `dealer_users_status_check`: stessi quattro valori, **ordine diverso**.
--    Si adotta l'ordine della produzione.
--
-- **C. Due che si tolgono dai file e non si mettono da nessuna parte.**
--
-- 9-10. `dealers_subscription_plan_check` e
--    `dealers_subscription_status_check`. Sarebbero passati -- in produzione
--    tutti e cinque i concessionari hanno `piano=base` e
--    `stato=pending_activation`, quindi zero violazioni -- e proprio per
--    questo non si aggiungono:
--
--    * `dealers.subscription_plan` e' **la colonna che non si legge mai**. Il
--      piano in vigore sta su `dealer_demo_subscriptions` e si chiede a
--      `src/lib/dealer-plan.ts`; quella colonna dice "base" per tutti da
--      sempre, perche' la conversione non la aggiorna. Mettere una serratura
--      su una porta murata fa credere che la porta serva;
--    * quel vincolo ammette **solo 'base' e 'pro'**: e' stato scritto prima
--      che esistesse il piano Elite. Il giorno che qualcuno provasse a
--      scrivere il valore giusto, il database lo rifiuterebbe -- e sarebbe un
--      errore incomprensibile su un campo che nessuno guarda.
--
--    Togliendoli dai file, una ricostruzione da zero non li ricrea e il
--    confronto smette di segnalarli. Se un giorno quella colonna tornera' a
--    voler dire qualcosa, il vincolo si riscrive con i piani di allora.

begin;

-- ---------------------------------------------------------------------------
-- A. I tre che cambiano la produzione.
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_dealer_id_fkey;
alter table public.profiles
  add constraint profiles_dealer_id_fkey
  foreign key (dealer_id) references public.dealers(id) on delete set null;

alter table public.leads drop constraint if exists leads_customer_id_fkey;
alter table public.leads
  add constraint leads_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.vehicle_images drop constraint if exists vehicle_images_position_non_negative;
alter table public.vehicle_images
  add constraint vehicle_images_position_non_negative
  check (("position" is null) or ("position" >= 0));

-- ---------------------------------------------------------------------------
-- B. I cinque che allineano i file. In produzione rifanno cio' che c'e' gia'.
-- ---------------------------------------------------------------------------

-- Il registro di controllo punta a chi ha fatto l'accesso, non al suo profilo.
alter table public.audit_logs drop constraint if exists audit_logs_created_by_fkey;
alter table public.audit_logs
  add constraint audit_logs_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- Esiste solo in produzione: entra nei file.
alter table public.dealers drop constraint if exists dealers_user_id_fkey;
alter table public.dealers
  add constraint dealers_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Stessa regola, nome diverso: si adotta quello della produzione.
alter table public.dealer_users drop constraint if exists dealer_users_dealer_fkey;
alter table public.dealer_users drop constraint if exists dealer_users_dealer_id_fkey;
alter table public.dealer_users
  add constraint dealer_users_dealer_id_fkey
  foreign key (dealer_id) references public.dealers(id) on delete cascade;

alter table public.dealer_users drop constraint if exists dealer_users_profile_fkey;
alter table public.dealer_users drop constraint if exists dealer_users_profile_id_fkey;
alter table public.dealer_users
  add constraint dealer_users_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete cascade;

-- Stessi quattro valori, ordine diverso: si adotta quello della produzione.
alter table public.dealer_users drop constraint if exists dealer_users_status_check;
alter table public.dealer_users
  add constraint dealer_users_status_check
  check (status = any (array['active'::text, 'invited'::text, 'suspended'::text, 'disabled'::text]));

-- ---------------------------------------------------------------------------
-- C. I due che si tolgono dai file. In produzione non esistono: non succede
--    niente.
-- ---------------------------------------------------------------------------

alter table public.dealers drop constraint if exists dealers_subscription_plan_check;
alter table public.dealers drop constraint if exists dealers_subscription_status_check;

commit;
