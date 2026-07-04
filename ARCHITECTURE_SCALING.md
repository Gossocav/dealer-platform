# ARCHITECTURE SCALING - Dealer Platform

## Obiettivo
Definire l architettura target per sostenere in modo affidabile:
- 250 concessionarie attive
- 200.000 veicoli pubblicati
- Milioni di immagini
- Import massivi da CSV e feed esterni
- Ricerca veloce su marketplace pubblico
- SEO su migliaia di pagine veicolo e concessionaria

Vincoli di progetto:
- Multi-tenant rigoroso con isolamento dati per dealer_id
- Evoluzione incrementale senza regressioni funzionali
- Stabilita operativa e osservabilita end-to-end

---

## 1) Architettura generale

Architettura consigliata a livelli:

1. Presentation Layer
- Frontend Next.js App Router
- Pagine pubbliche marketplace (catalogo, ricerca, dettaglio, concessionarie)
- Area autenticata dealer (gestionale)

2. API Layer
- Route API versionate con contratti stabili
- Endpoint search unico per listing pubblici
- Endpoint dedicati per ingestione/import asincrona

3. Domain Layer
- Regole business per veicoli, lead, dealer, import
- Validazione input centralizzata
- Mapping DTO coerente per UI e integrazioni

4. Data Access Layer
- Repository layer con query tipizzate e riusabili
- Nessuna query SQL business-critical dispersa nelle pagine

5. Data Layer
- PostgreSQL/Supabase con RLS e policy multi-tenant
- Indici mirati su filtri e sort critici
- Tabelle operative + tabelle evento/import

6. Async Processing Layer
- Job queue per import feed e processi pesanti
- Worker idempotenti con retry e dead-letter

7. Asset Layer
- Object storage per immagini originali e derivate
- Pipeline di ottimizzazione e varianti responsive

8. Edge and Cache Layer
- CDN per contenuti statici e immagini
- Cache applicativa per query ad alto traffico

9. Observability Layer
- Logging strutturato, metriche, tracing
- Alert su SLA e failure rate

---

## 2) Database target

Database target: PostgreSQL (Supabase managed) con strategia scale-up + ottimizzazione query.

Principi:
- Tutte le tabelle operative tenant-scoped tramite dealer_id, salvo cataloghi di sistema globali
- RLS enforced su tabelle sensibili
- FK e vincoli espliciti per integrita
- Migrazioni additive e retrocompatibili

Partizionamento consigliato (fase avanzata):
- vehicle_images partizionata per created_at o hash(vehicle_id)
- import_runs/import_items partizionati per mese

Indice base richiesti su vehicles:
- idx_vehicles_status_created_at (status, created_at desc)
- idx_vehicles_dealer_status_created_at (dealer_id, status, created_at desc)
- idx_vehicles_brand_model (brand, model)
- idx_vehicles_price (price)
- idx_vehicles_mileage (mileage)
- idx_vehicles_year (year)
- idx_vehicles_fuel_transmission (fuel, transmission)
- idx_vehicles_province_city (province, city)
- idx_vehicles_traction (traction)
- idx_vehicles_color (color)

Ricerca testuale:
- Colonna search_vector (tsvector) su brand, model, version, city, province
- GIN index su search_vector

---

## 3) Tabelle principali

Core anagrafiche:
- dealers
- profiles
- users_to_dealers (se serve supporto multi-utente per dealer)

Core inventario:
- vehicles
- vehicle_images
- vehicle_equipment (opzionale normalizzata)

Core commerciale:
- leads
- customers
- appointments
- notifications

Core import:
- import_sources
- import_runs
- import_items
- import_errors
- import_dedup_keys

Core SEO:
- seo_overrides
- sitemap_jobs
- sitemap_files

Core audit/security:
- audit_events
- api_rate_limits (opzionale)

Schema minimo tabella vehicles (target logico):
- id
- dealer_id
- status
- brand, model, version
- year, registration_date
- mileage, price
- fuel, transmission, traction
- body_type, interior_type, color
- power_kw, power_cv, engine_size
- province, city
- vin (nullable, univoco per dealer quando presente)
- search_vector
- created_at, updated_at

Schema minimo vehicle_images:
- id
- dealer_id
- vehicle_id
- storage_key
- is_cover
- position
- width, height, mime_type, bytes
- variants_json
- created_at, updated_at

---

## 4) Regole dealer_id e multi-tenant

Regole obbligatorie:
1. Ogni riga tenant data deve avere dealer_id non nullo
2. Ogni query dealer-side deve includere dealer_id lato server
3. RLS deve impedire cross-tenant read/write anche in caso di bug applicativo
4. API pubbliche marketplace possono leggere solo record pubblicati e solo campi pubblici
5. Service role usato solo in contesti controllati server-side e mai esposto al client

Pattern accesso:
- Public API: read-only su vista safe marketplace
- Dealer API: accesso limitato al dealer_id risolto da sessione
- Platform admin API: scope esplicito con audit obbligatorio

Raccomandazione:
- Introdurre helper unico resolveDealerScope(request) per evitare logiche duplicate

---

## 5) API Search unica

Endpoint target:
- GET /api/marketplace/search

Responsabilita:
- Validare e normalizzare filtri
- Applicare filtri server-side
- Applicare sort whitelist
- Applicare paginazione server-side
- Restituire payload minimale per card/listing

Parametri principali:
- q
- brand
- model
- interiorType
- province
- color
- fuel
- transmission
- traction
- yearFrom, yearTo
- kmFrom, kmTo
- minPrice, maxPrice
- dealerSlug
- sort
- page
- pageSize
- includeFacets

Sort whitelist:
- created_at_desc
- created_at_asc
- price_asc
- price_desc
- mileage_asc
- mileage_desc
- year_desc
- year_asc

Response proposta:
- data: array di vehicle card dto
- meta: total, page, pageSize, totalPages, hasNext, hasPrev
- filtersApplied
- sortApplied
- facets opzionali
- warnings opzionali

SLO target:
- p95 <= 250ms lato API su query comuni
- p99 <= 500ms

---

## 6) Repository layer

Obiettivo:
- Centralizzare accesso dati e logica query per ridurre duplicazioni e regressioni

Struttura suggerita:
- src/lib/repositories/marketplace-repository.ts
- src/lib/repositories/dealer-vehicles-repository.ts
- src/lib/repositories/import-repository.ts
- src/lib/repositories/leads-repository.ts

Principi:
1. Input tipizzati, output DTO tipizzati
2. Niente logica UI nel repository
3. Nessuna query raw non tracciata
4. Funzioni piccole e composte

Esempi funzioni repository marketplace:
- searchVehicles(filters, pagination, sort)
- countVehicles(filters)
- getVehicleByIdPublic(id)
- getDealerBySlug(slug)
- getDealerVehicles(slug, pagination)

---

## 7) Import engine

Target:
- Gestire feed CSV/XML/JSON e import batch elevati senza timeout HTTP

Architettura:
1. Ingestion API
- Riceve richiesta import
- Valida sorgente
- Crea import_run in stato queued
- Enqueue job e risponde subito

2. Worker import
- Scarica sorgente
- Parsifica stream (non tutto in memoria)
- Normalizza record
- Dedup su chiave forte (VIN) o chiave composta
- Upsert bulk a blocchi
- Pubblica metriche e progress

3. Stato e audit
- import_runs: stato globale
- import_items: esito per record
- import_errors: errori dettagliati

Policy idempotenza:
- Hash sorgente + watermark + dedup key
- Retry safe senza duplicare veicoli

Controlli qualitativi:
- Rate limit import per dealer
- Validazione schema feed
- Limiti massimi per run

---

## 8) Gestione immagini

Obiettivo:
- Servire milioni di immagini con costo e latenza controllati

Pipeline consigliata:
1. Upload/Ingest originale
- Salvataggio object storage con storage_key stabile

2. Image processing async
- Generazione varianti: thumb, card, detail, full
- Compressione moderna (WebP/AVIF quando possibile)

3. Delivery
- URL CDN pubblici firmati dove necessario
- Cache-Control aggressivo su varianti immutabili

4. Data model
- Salvare metadati tecnici (dimensioni, bytes, mime)
- Salvare variants_json per evitare ricalcolo

Best practice:
- Evitare signed URL per ogni card render lato server quando non necessario
- Prevedere fallback immagine placeholder

---

## 9) Sicurezza e permessi

Modello RBAC minimo:
- platform_admin
- dealer_admin
- dealer_staff
- public_user (anon)

Controlli richiesti:
1. Auth forte su endpoint dealer
2. Authorization per ruolo e dealer scope
3. RLS su tabelle tenant
4. Validazione input e sanitizzazione output
5. Rate limiting endpoint pubblici e import
6. Audit trail su azioni amministrative

Hardening extra:
- Protezione SSRF sugli endpoint proxy esterni
- Limiti timeout e body size
- Secret management centralizzato

---

## 10) SEO

Obiettivo:
- Indicizzazione robusta di migliaia di pagine

Strategia:
1. Metadata dinamica per:
- pagina veicolo
- pagina concessionaria
- listing ricerca con canonical

2. Sitemap:
- sitemap index
- sitemap veicoli chunked
- sitemap concessionarie
- job periodico di refresh

3. Robots:
- Policy pulita per aree private

4. Structured data:
- Vehicle
- Organization/AutoDealer
- BreadcrumbList

5. Qualita URL:
- slug stabili
- canonical coerenti
- gestione redirect su slug cambiato

---

## 11) Performance

Target iniziali:
- LCP pubblico <= 2.5s su rete 4G buona
- INP <= 200ms
- API search p95 <= 250ms

Interventi principali:
1. Eliminare full scan vehicles nelle pagine pubbliche
2. Spostare filtri in DB/server
3. Ridurre payload campi non necessari
4. Evitare N+1 su immagini/dealer
5. Introdurre paginazione cursor/offset con cap

Osservabilita performance:
- Dashboard p95/p99 per endpoint
- Slow query log con threshold
- Alert su error rate > soglia

---

## 12) Caching

Livelli di cache:
1. CDN cache
- Asset statici e immagini varianti

2. Application cache
- Risultati search comuni con TTL breve
- Facets con TTL separato

3. Data cache
- Query readonly ad alto riuso

Policy invalidazione:
- Evento publish/unpublish veicolo invalida chiavi marketplace correlate
- Aggiornamento dealer invalida pagine dealer correlate

TTL suggeriti:
- Search listing pubblico: 30-120 secondi
- Facets: 5-15 minuti
- Dettaglio veicolo pubblicato: 60-300 secondi

---

## 13) Roadmap tecnica sprint 0-7

Sprint 0 - Baseline e metriche
- Definire SLO tecnici
- Attivare logging strutturato e dashboard metriche
- Censire query critiche e tempi medi

Sprint 1 - Search foundation
- Creare API search unica marketplace
- Migrare catalogo e ricerca a filtri server-side
- Introdurre paginazione server-side

Sprint 2 - Dealer pages scalability
- Migrare pagina dealer slug a query server-side filtrata
- Migrare lista concessionarie a pipeline query ottimizzata
- Ridurre overfetch campi

Sprint 3 - Repository layer
- Introdurre repository per marketplace e dealer inventory
- Rimuovere query duplicate nelle pagine
- Stabilizzare contratti DTO

Sprint 4 - Import engine v1
- Trasformare import in job asincroni
- Aggiungere import_runs/import_items/import_errors
- Dedup idempotente e retry policy

Sprint 5 - Image platform
- Pipeline varianti immagini
- Caching CDN e metadata immagini
- Riduzione costo signed URL runtime

Sprint 6 - Security e RBAC hardening
- Matrice ruoli completa
- Enforcement API + RLS + audit
- Rate limiting endpoint pubblici/import

Sprint 7 - SEO e ottimizzazione finale
- Sitemap chunked e metadata dinamica completa
- Structured data estesa
- Load test su 200.000 veicoli e tuning finale

---

## Criteri di accettazione architetturale

La piattaforma puo essere considerata pronta per scala target quando:
1. Nessuna pagina pubblica usa full scan in memoria per filtrare
2. Tutti i listing pubblici usano API search unica con paginazione
3. Tutte le query principali hanno indice adeguato
4. Import massivo non dipende da request sincrona lunga
5. Asset immagini serviti da pipeline ottimizzata e CDN
6. RLS e RBAC impediscono accesso cross-tenant
7. SEO tecnica produce sitemap e metadata coerenti su larga scala
8. SLO p95 e error budget rispettati in produzione
