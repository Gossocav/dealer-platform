<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Come si lavora su questo progetto

## Prima di tutto

**Si risponde in italiano.** Chi legge non e' un tecnico: e' il titolare della
piattaforma. Niente gergo dove si puo' evitarlo, e i passaggi che deve fare lui
si scrivono come clic da fare, non come comandi da capire.

**Niente si dichiara fatto senza averlo verificato.** Non "dovrebbe funzionare":
provato, con il risultato sotto gli occhi. Se una cosa non e' stata verificata,
si dice quale e perche'.

**Un dato che non c'e' non si finge.** Un numero scritto nel codice e mostrato
accanto a numeri veri e' peggio di un dato assente, perche' chi guarda lo crede.
E' successo due volte: la barra del pannello (PR #146) e le "Visualizzazioni"
sulle schede veicolo, ferme a zero per mesi (PR #172).

## Prima di aprire una modifica

La CI e' bloccante ed esegue quattro controlli, su Node 22. Vanno eseguiti
tutti, in quest'ordine, **prima** di spedire:

```bash
npx tsc --noEmit    # i tipi: "npm run lint" NON li controlla
npm run lint
npm run test
npm run build
```

`npx tsc --noEmit` e' quello che sfugge piu' spesso e quello che rompe la CI
piu' spesso.

## Commit e pull request

Il messaggio descrive **l'effetto per chi usa la piattaforma**, in italiano,
minuscolo dopo i due punti, con gli apostrofi ASCII:

```
fix(veicoli): l'elenco si ordina per prezzo e per chilometri
feat(importazione): il prezzo si legge anche dai siti che non lo dichiarano
```

Ambiti in uso: `veicoli`, `marketplace`, `importazione`, `ricerca`, `home`,
`demo`, `admin`, `gestionale`, `seo`, `sicurezza`, `anteprime`, `lead`,
`privacy`, `misurazione`, `email`, `impostazioni`, `registrazione`, `accesso`,
`ci`, `chore`.

Nel corpo si spiega **perche'**, non cosa: il diff dice gia' cosa. Se una
scelta ha un'alternativa scartata, si scrive quale e per quale ragione. Il
numero della PR lo aggiunge GitHub da solo con lo squash.

Si lavora su un ramo, si apre la PR, si aspetta la CI verde, si unisce con
squash. Il repository ha un solo collaboratore: non c'e' nessuno a cui
chiedere una revisione. Dopo uno squash `git branch` puo' dire "non unito" a
torto: si verifica con `gh pr list --state merged`.

## Il database

**Le modifiche si applicano a mano**, dall'editor SQL di Supabase, e le applica
il titolare. `supabase db push` e' vietato. Il motivo sta scritto in
`.github/workflows/db-migrations.yml`: diverse migration di questo progetto
toccano i dati, e una cancella righe da `profiles` -- riapplicare tutto alla
cieca su una produzione con lo storico incompleto le rieseguirebbe.

**Una migration si prova su un Postgres vero prima di spedirla.** I test di
questo progetto leggono il *testo* dei file SQL: dicono che la regola e'
scritta, non che il database la applichi. Docker c'e':

```bash
docker run -d --name prova -e POSTGRES_PASSWORD=postgres postgres:15
# ricostruire i ruoli anon/authenticated/service_role, auth.uid() da
# request.jwt.claim.sub, le tabelle coinvolte, poi applicare la migration e
# interrogare come ciascun ruolo
```

E' cosi' che si e' verificato l'isolamento fra concessionarie prima di toccare
la produzione, ed e' l'unico modo per sapere davvero cosa fa una politica.

**Lo schema di produzione e' andato alla deriva rispetto alle migration**, piu'
di una volta. Prima di dare per scontato che una colonna o una politica esista,
si guarda la produzione.

## Isolamento fra concessionarie

E' la regola che non si infrange mai. Il 22 agosto 2026, alla prima prova con
due concessionarie, la seconda vedeva i dati della prima -- e con la sola
chiave pubblica del sito si leggevano nome, email e telefono dei clienti.

Da allora, **due serrature**:

1. **il database.** Protezione per riga accesa su ogni tabella di
   concessionaria, con `public.current_dealer_id()` come unico fondamento. Il
   permesso di lettura pubblica vale solo per `anon`, mai per `authenticated`:
   il marketplace legge sempre senza sessione (`publicSupabase`), quindi chi ha
   fatto login non ha nessun motivo di vedere i veicoli altrui.
2. **il codice.** Ogni interrogazione dichiara `dealer_id`, anche se il
   database lo impone comunque. Un test
   (`src/lib/tenant-scoped-queries.test.ts`) ripercorre il gestionale e
   fallisce se ne ricompare una senza.

Per verificare la produzione dall'esterno, come farebbe un estraneo:

```bash
set -a; . ./.env.production; set +a
node scripts/verifica-isolamento.mjs
```

La chiave di servizio si usa solo dove la chiave pubblica non puo' arrivare, e
solo sul server: mai in un componente del browser.

## Struttura e punti fissi

| Dove | Cosa |
|---|---|
| `src/proxy.ts` | Next 16 ha sostituito il Middleware con il Proxy. Qui vivono la Content-Security-Policy e `X-Robots-Tag`, **sorgente unica**: non duplicarle in `next.config.ts` |
| `src/lib/private-areas.ts` | l'elenco delle sezioni fuori dai motori di ricerca, letto sia da `robots.txt` sia dal proxy |
| `src/lib/dealer-id-resolution.ts` | da utente a concessionaria, con il controllo di appartenenza |
| `src/lib/active-tenant.ts` | `resolveDealerIdForCurrentUser`: l'aggancio che le pagine del gestionale usano per sapere di chi sono i dati |
| `src/lib/carica-tutto.ts` | legge un elenco per intero: il database ne consegna mille per volta e non lo dice |
| `src/lib/dealer-plan.ts` | il piano in vigore. **Mai** leggerlo da `dealers.subscription_plan`: e' una colonna vecchia che la conversione non aggiorna |
| `src/lib/vehicle-body-types.ts` | l'unico elenco delle carrozzerie: i valori sono anche quelli scritti nel database |
| `src/lib/dealer-site-import.ts` | legge lo stock dal sito della concessionaria; non parla col database, quindi si puo' provare su dati veri senza rischi |

Gli endpoint stanno in `src/app/api/**/route.ts` e seguono sempre lo stesso
ordine: normalizza, valida (400), variabili d'ambiente (500), scrittura
principale, effetti collaterali come "meglio se riesce", errore stabile (500).
Un effetto collaterale fallito non fa fallire una scrittura riuscita.
Riferimento: `src/app/api/marketplace/lead/route.ts`.

## I test

Vitest, con l'alias `@/` configurato in `vitest.config.ts`. Due stili
convivono, e servono a cose diverse:

- **comportamentali**: si chiama una funzione e si guarda cosa restituisce. E'
  la prova vera.
- **sul testo del sorgente**: si legge un file e si controlla che una riga ci
  sia. Servono a fissare decisioni che il tipo non puo' esprimere -- che una
  pagina usi l'involucro comune, che una politica sia scritta -- ma **non
  provano che il codice funzioni**. Un test cosi' su una migration dice solo
  che la regola e' scritta.

Un test spiega nel commento **quale difetto impedisce**, con il caso reale che
lo ha prodotto. Serve a chi un giorno lo vedra' fallire.

## Trappole gia' pagate

**`.env.local` batte `.env.production`.** Una prova in locale legge il database
di sviluppo anche quando si crede di guardare la produzione: la pagina risponde
"non trovato" e sembra che tutto funzioni. Per provare sui dati veri si
esportano le variabili nella shell **prima di compilare**, perche' le
`NEXT_PUBLIC_*` finiscono dentro la compilazione.

**Un inserimento che rilegge la riga appena scritta.** Con la protezione per
riga attiva, `.insert().select()` fallisce se manca il permesso di lettura -- e
Postgres lo segnala come *violazione della regola di scrittura*, indicando la
regola sbagliata. Si distingue cosi': senza rilettura 201, con rilettura 401.

**Il limite delle mille righe.** Il database consegna mille righe per richiesta
e non lo dice. Per gli elenchi si usa `caricaTutto`, che avvisa quando tocca il
tetto.

**I valori mancanti in coda.** Postgres considera un valore assente come il piu'
grande: in ordine decrescente le auto senza prezzo aprirebbero l'elenco. Si
ordina sempre con `nullsFirst: false`.

**Il nome di un filtro non e' un dato.** Leggendo le pagine dei siti delle
concessionarie, `"price"` e `"bodyType"` compaiono anche come etichette dei
filtri di ricerca ("Qualsiasi prezzo"). Un valore si prende solo se e'
agganciato all'identificativo della vettura, o se sulla pagina compare una
volta sola.

**La cache di Turbopack** si corrompe se si cancella `.next` mentre `next dev`
sta ancora chiudendo. Si spegne il processo, si controlla che la porta sia
libera, poi si cancella.

## Come si lavora

Modifica minima, sullo scopo richiesto. Se serve toccare altro, lo si dice
invece di farlo di nascosto. Non si commetta ne' si spinga niente senza che sia
stato chiesto.

Quando si trova un difetto mentre se ne corregge un altro, lo si segnala con la
prova; non lo si corregge in silenzio dentro una modifica che parlava d'altro.

Le pagine del gestionale e il pannello amministrativo chiedono credenziali che
un agente non ha: la resa a video non e' verificabile da qui, e va detto invece
di lasciarlo intendere.

## Dove sta scritto il resto

- [README.md](README.md) — cos'e' il progetto e come si fa girare
- [ARCHITECTURE.md](ARCHITECTURE.md) — architettura e modello multi-concessionaria
- [PRODUCT_BOOK.md](PRODUCT_BOOK.md) — prodotto e ambito funzionale
- [supabase/MIGRAZIONI.md](supabase/MIGRAZIONI.md) — come si applica una modifica al database
- `.github/instructions/` — regole valide per percorsi specifici

## Variabili d'ambiente

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`APP_BASE_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `CRON_SECRET`.

Le `NEXT_PUBLIC_*` sono visibili a chiunque apra il sito: non ci si mette mai
niente che debba restare riservato.
