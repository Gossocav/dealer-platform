# KeyAuto — piattaforma per concessionarie

Marketplace pubblico di auto usate e km 0, con il gestionale delle concessionarie
che lo alimenta. Una sola applicazione Next.js serve entrambe le cose:

- **il sito pubblico** (`/`, `/ricerca`, `/auto/...`, `/concessionarie/...`): chi cerca
  un'auto lo vede senza registrarsi, ed e' quello che Google indicizza;
- **il gestionale** (`/dashboard`, `/veicoli`, `/lead`, `/clienti`, `/agenda`, ...):
  ci entra la concessionaria, con i propri dati e nessun altro;
- **il pannello amministrativo** (`/admin`): approvazioni, richieste demo, account.

Il dominio in produzione e' [www.keyauto.it](https://www.keyauto.it), ospitato su
Vercel; i dati stanno su Supabase (Postgres).

## Far girare il progetto

```bash
npm install
npm run dev            # sviluppo, su http://localhost:3000
```

Prima di aprire una modifica, gli stessi quattro controlli della CI:

```bash
npx tsc --noEmit       # i tipi
npm run lint           # le regole di scrittura
npm run test           # l'intera batteria di prove
npm run build          # la compilazione vera
```

**Attenzione a quale database si sta usando.** Next carica `.env.local` con
priorita' su `.env.production`: una prova in locale legge il database di
sviluppo anche quando si crede di guardare la produzione, e risponde "non
trovato" invece di fallire. Per provare davvero contro i dati veri:

```bash
set -a; . ./.env.production; set +a
npm run build && npm start
```

## Dove sta cosa

| Cartella | Cosa contiene |
|---|---|
| `src/app/(marketplace)/` | le pagine pubbliche |
| `src/app/api/` | gli endpoint del server |
| `src/app/admin/` | il pannello amministrativo |
| `src/components/` | i componenti condivisi |
| `src/lib/` | la logica riutilizzabile, e i test accanto ai file che provano |
| `supabase/migrations/` | le modifiche al database, applicate a mano |
| `scripts/` | strumenti di verifica, non fanno parte dell'applicazione |

## Le tre cose da sapere prima di toccare qualcosa

**I dati di una concessionaria non devono mai finire sotto gli occhi di
un'altra.** Non e' un principio astratto: e' successo, il 22 agosto 2026, ed e'
costato una giornata. Ogni interrogazione dichiara di quale concessionaria sono
i dati, e il database lo impone comunque con la protezione per riga. Due
serrature, non una.

**Le modifiche al database si applicano a mano**, dall'editor SQL di Supabase.
Nessuna automazione le esegue: `supabase db push` e' vietato. Un controllo
settimanale segnala quando la produzione e' rimasta indietro.

**Un dato che non c'e' non si finge.** Un numero scritto nel codice, mostrato
accanto a numeri veri, e' peggio di un dato assente: chi guarda lo crede.

## Per approfondire

- [AGENTS.md](AGENTS.md) — come si lavora su questo progetto, in dettaglio
- [ARCHITECTURE.md](ARCHITECTURE.md) — architettura e modello multi-concessionaria
- [PRODUCT_BOOK.md](PRODUCT_BOOK.md) — prodotto e ambito funzionale
- [supabase/MIGRAZIONI.md](supabase/MIGRAZIONI.md) — come si applica una modifica al database
