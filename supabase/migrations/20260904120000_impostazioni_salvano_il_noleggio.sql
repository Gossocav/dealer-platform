-- Le Impostazioni tornano a salvare: mancava il permesso su `rental_url`.
--
-- Il difetto, visto dal titolare il 04/09/2026 premendo Salva: "permission
-- denied for table dealers". E non riguardava solo l'indirizzo dei noleggi --
-- **non si salvava piu' niente**, perche' PostgreSQL rifiuta l'intera
-- scrittura se una sola delle colonne non e' permessa.
--
-- La causa: su `dealers` il permesso di scrittura per chi ha una sessione non
-- e' sull'intera tabella, e' **colonna per colonna**
-- (20260717000015_dealers_protect_lifecycle_columns). E' la protezione nata
-- dall'analisi di sicurezza del 20/07/2026: senza, un concessionario poteva
-- scriversi da solo lo stato dell'abbonamento, il piano o la scadenza della
-- prova. La colonna `rental_url`, aggiunta il 03/09, e' finita nell'elenco
-- delle colonne leggibili dal pubblico ma non in quello delle colonne che il
-- concessionario puo' scrivere.
--
-- **Il messaggio del database consiglia la cura sbagliata.** Suggerisce
-- `GRANT UPDATE ON public.dealers TO authenticated`, che e' il permesso
-- sull'intera tabella: riaprirebbe esattamente il buco chiuso a luglio. Qui si
-- aggiunge la sola colonna che manca.
--
-- L'elenco si riscrive per intero: `grant update (...)` non sostituisce quello
-- di prima, lo affianca, e un elenco parziale lascerebbe fuori tutto il resto.
-- E' la stessa trappola dei permessi di lettura, dall'altro lato.

begin;

revoke update on public.dealers from authenticated;

grant update (
  name,
  legal_name,
  vat_number,
  contact_person,
  email,
  phone,
  whatsapp_phone,
  address,
  city,
  province,
  zip_code,
  postal_code,
  website,
  rental_url,
  logo_url,
  description,
  opening_hours,
  facebook_url,
  instagram_url,
  linkedin_url,
  social_links,
  updated_at
) on public.dealers to authenticated;

commit;
