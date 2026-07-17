# Dealer Platform

Piattaforma SaaS multi-concessionario basata su Next.js, React, TypeScript e Supabase.

Il progetto include:
- marketplace pubblico per veicoli e concessionarie
- area dealer autenticata per gestione veicoli, lead, clienti e agenda
- integrazione Supabase per auth, database PostgreSQL, realtime e storage

## Stack

- Next.js 16.2.9
- React 19.2.4
- TypeScript 5
- Supabase JS 2.x
- Tailwind CSS 4
- Resend per email operative

## Comandi

Installazione dipendenze:

```bash
npm install
```

Sviluppo locale:

```bash
npm run dev
```

Build produzione:

```bash
npm run build
```

Avvio applicazione buildata:

```bash
npm run start
```

Lint:

```bash
npm run lint
```

Type check:

```bash
npx tsc --noEmit
```

## Variabili ambiente richieste

Applicazione web / client:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (fallback opzionale per metadata/SEO)
- `NEXT_PUBLIC_APP_ENV` (opzionale)
- `NEXT_PUBLIC_APP_VERSION` (opzionale)
- `NEXT_PUBLIC_BUILD_ID` (opzionale)

API server-side:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_BASE_URL`
- `OPENAPI_AUTOMOTIVE_BASE_URL` (lookup targa)
- `OPENAPI_AUTOMOTIVE_TOKEN` (lookup targa)

Note:

- `APP_BASE_URL` deve puntare al dominio pubblico reale in produzione.
- `RESEND_FROM_EMAIL` deve essere coerente con il dominio autorizzato attualmente usato dalle API email.
- `SUPABASE_SERVICE_ROLE_KEY` deve essere usata solo lato server.

## Email produzione (Resend)

Checklist operativa:

1. Verificare il dominio su Resend (Domains).
2. Configurare i record DNS richiesti da Resend (SPF, DKIM, eventuale tracking).
3. Impostare `RESEND_API_KEY` in ambiente server (mai lato client).
4. Impostare `RESEND_FROM_EMAIL` con mittente del dominio verificato (es. `no-reply@dominio-verificato.it`).
5. Eseguire un test reale verso email esterna (non solo inbox interna di test).
6. Verificare deliverability base: arrivo, spam score, SPF/DKIM pass.
7. Se compare errore testing-mode/verify-domain: completare la verifica dominio e rieseguire il test.

Regole applicative:

- In production non deve essere usato `onboarding@resend.dev`.
- In development/test e consentito `onboarding@resend.dev` solo per test controllati.
- Le API email usano `RESEND_API_KEY` e `RESEND_FROM_EMAIL` solo lato server.

## Struttura operativa

Codice applicativo:

- `src/app` route App Router e API route
- `src/components` componenti UI e pagine client
- `src/lib` utility condivise, Supabase client e mapping dominio

Database e sicurezza:

- `supabase/schema.sql` baseline schema
- `supabase/migrations` migrazioni incrementali
- `supabase/config.toml` configurazione Supabase locale

Documenti di riferimento:

- `ARCHITECTURE.md`
- `PRODUCT_BOOK.md`
- `AGENTS.md`

## Supabase e RLS

Regole operative correnti:

- le tabelle operative sono tenant-scoped tramite `dealer_id`
- la separazione dati è demandata a RLS + trigger/constraint applicativi
- le API pubbliche devono restare minime, esplicite e non privilegiate
- le API server-side che usano service role devono limitare in modo esplicito l’accesso ai record

Tabelle sensibili già coperte da policy/misure nel repository:

- `vehicles`
- `vehicle_images`
- `leads`
- `customers`
- `appointments`
- `dealer_users`
- `import_sources`
- `import_profiles`
- `import_runs`
- `import_items`
- `import_errors`
- `import_dedup_keys`
- `storage_objects`
- `audit_logs`

Workflow consigliato DB:

1. aggiungere una nuova migration per ogni modifica schema/policy
2. evitare di riscrivere migration storiche già applicate
3. mantenere allineati trigger, RLS e API
4. evitare `db push` cieco se il database remoto è stato toccato manualmente

## Flusso deploy

Target previsto:

- frontend/app: Vercel
- database/auth/storage/realtime: Supabase

Flusso consigliato:

1. validare localmente `npx tsc --noEmit`
2. validare localmente `npm run build`
3. validare localmente `npm run lint`
4. verificare env production in Vercel e Supabase
5. verificare migrazioni presenti e ordine applicazione
6. deploy applicazione su Vercel
7. validare route pubbliche, route private e API sensibili post-deploy

## Checklist pre-produzione

- env richieste presenti in production
- `APP_BASE_URL` valorizzato con dominio reale
- build, lint e typecheck verdi
- route API sensibili verificate con auth valida/non valida
- route pubbliche marketplace accessibili anonimamente
- route private non accessibili senza sessione
- policy RLS allineate alle tabelle operative
- migrazioni Supabase verificate e versionate
- nessun log di debug sensibile rimasto nel client
- header HTTP/CSP attivi e compatibili con production
- `robots.txt` e `sitemap.xml` generati correttamente

## Rischi residui noti

- la protezione delle pagine private è ancora principalmente client-side; per hardening completo serve auth server-side basata su cookie/sessione leggibile lato server
- alcune pagine pubbliche e operative usano limiti conservativi o filtri in memoria; la soluzione enterprise completa richiede paginazione server-side e query aggregate
- i fallback di risoluzione `dealer_id` restano multipli per compatibilità storica (`dealer_users`, `profiles`, `dealers.user_id`)
- il logging non è ancora centralizzato con request id/correlation id
- il README era inizialmente template; questa documentazione va mantenuta allineata ai prossimi step reali di deploy e runbook

## Validazione rapida consigliata

```bash
npx tsc --noEmit
npm run build
npm run lint
```
