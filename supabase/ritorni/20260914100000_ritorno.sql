-- Ritorno di 20260914100000_i_vincoli_come_devono_essere.sql.
--
-- Rimette i vincoli com'erano in produzione il 14/09/2026.
--
-- **Attenzione al primo.** Rimettere `on delete cascade` su
-- `profiles_dealer_id_fkey` vuol dire tornare a **cancellare i profili delle
-- persone** quando si cancella la concessionaria. Si torna qui solo se
-- scollegarli rompesse qualcosa, e in quel caso la cosa da guardare e' chi
-- pretende che quel collegamento non sia mai vuoto.
--
-- I due vincoli sull'abbonamento **non si rimettono**: in produzione non
-- c'erano nemmeno prima. Toglierli era una modifica ai soli file.

begin;

alter table public.profiles drop constraint if exists profiles_dealer_id_fkey;
alter table public.profiles
  add constraint profiles_dealer_id_fkey
  foreign key (dealer_id) references public.dealers(id) on delete cascade;

alter table public.leads drop constraint if exists leads_customer_id_fkey;
alter table public.leads
  add constraint leads_customer_id_fkey
  foreign key (customer_id) references public.customers(id);

alter table public.vehicle_images drop constraint if exists vehicle_images_position_non_negative;

commit;
