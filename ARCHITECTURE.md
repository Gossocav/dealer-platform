# ARCHITECTURE

## Obiettivo tecnico

Costruire una piattaforma SaaS multi-concessionario per la gestione e pubblicazione di veicoli.

Il software è di proprietà del gestore della piattaforma.
Le concessionarie accedono tramite abbonamento.

---

# Architettura generale

La piattaforma è composta da tre aree principali:

## 1. Marketplace pubblico

Area visibile ai clienti finali.

Funzioni MVP:
- homepage
- ricerca veicoli
- scheda veicolo
- richiesta informazioni
- contatto concessionaria

## 2. Area concessionario

Area riservata alle concessionarie.

Funzioni MVP:
- login
- dashboard
- gestione veicoli
- inserimento veicolo
- modifica veicolo
- gestione lead
- profilo concessionaria

## 3. Area Super Admin

Area riservata al proprietario della piattaforma.

Funzioni MVP:
- gestione concessionarie
- gestione utenti
- controllo annunci
- gestione abbonamenti
- statistiche generali

---

# Stack tecnico

## Frontend
Next.js

## Database
Supabase PostgreSQL

## Autenticazione
Supabase Auth

## Storage immagini
Supabase Storage

## Hosting
Vercel

## Repository codice
GitHub

---

# Principio multi-tenant

Ogni concessionaria è un tenant separato.

Ogni dato operativo deve appartenere a una concessionaria tramite il campo:

dealer_id

Questo campo sarà presente nelle tabelle principali:

- users
- branches
- vehicles
- vehicle_images
- leads
- appointments
- documents
- subscriptions

Regola fondamentale:

Una concessionaria non può mai vedere, modificare o cancellare dati appartenenti a un'altra concessionaria.

---

# Tabelle principali MVP

## dealers

Contiene le concessionarie registrate.

Campi principali:
- id
- name
- legal_name
- vat_number
- fiscal_code
- email
- phone
- website
- status
- plan
- created_at
- updated_at

## profiles

Contiene i profili utenti collegati a Supabase Auth.

Campi principali:
- id
- dealer_id
- full_name
- email
- role
- status
- created_at
- updated_at

## branches

Contiene le sedi/filiali delle concessionarie.

Campi principali:
- id
- dealer_id
- name
- address
- city
- province
- postal_code
- phone
- email
- created_at
- updated_at

## vehicles

Contiene i veicoli pubblicati dalle concessionarie.

Campi principali:
- id
- dealer_id
- branch_id
- brand
- model
- version
- trim
- year
- month
- mileage
- fuel
- transmission
- body_type
- color
- price
- previous_price
- vat_included
- status
- published
- created_at
- updated_at

## vehicle_images

Contiene le immagini dei veicoli.

Campi principali:
- id
- dealer_id
- vehicle_id
- image_url
- position
- is_cover
- created_at

## leads

Contiene le richieste dei clienti.

Campi principali:
- id
- dealer_id
- vehicle_id
- customer_name
- customer_email
- customer_phone
- message
- status
- source
- created_at
- updated_at

## appointments

Contiene appuntamenti e test drive.

Campi principali:
- id
- dealer_id
- vehicle_id
- lead_id
- appointment_date
- appointment_type
- status
- notes
- created_at
- updated_at

## subscriptions

Contiene gli abbonamenti delle concessionarie.

Campi principali:
- id
- dealer_id
- plan_name
- price_monthly
- status
- started_at
- expires_at
- created_at
- updated_at

---

# Ruoli utenti

## platform_admin
Proprietario della piattaforma.
Può vedere e gestire tutto.

## dealer_owner
Titolare della concessionaria.
Può gestire la propria concessionaria.

## dealer_manager
Responsabile vendite.
Può gestire veicoli, lead e utenti operativi.

## dealer_sales
Venditore.
Può gestire veicoli e lead assegnati.

## dealer_viewer
Utente in sola lettura.

---

# Regole di sicurezza

- Row Level Security attiva su tutte le tabelle operative.
- Ogni query deve filtrare per dealer_id.
- Solo platform_admin può vedere dati di tutte le concessionarie.
- Gli utenti dealer possono vedere solo dati del proprio dealer_id.
- Le immagini dei veicoli pubblicati possono essere visibili pubblicamente.
- I dati interni della concessionaria non devono mai essere pubblici.

---

# MVP tecnico

La prima versione deve permettere:

1. registrazione concessionaria
2. login utente
3. creazione profilo concessionaria
4. inserimento veicolo
5. upload immagini
6. pubblicazione veicolo
7. visualizzazione marketplace pubblico
8. invio richiesta informazioni
9. ricezione lead da parte del concessionario

---

# Regola di sviluppo

Ogni nuova funzionalità deve rispettare questo ordine:

1. aggiornare Product Book
2. aggiornare Architecture
3. progettare database
4. sviluppare interfaccia
5. testare
6. fare commit su GitHub