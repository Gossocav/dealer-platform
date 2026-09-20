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
docker run -d --name prova -e POSTGRES_PASSWORD=postgres postgres:17   # la stessa versione della produzione
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
| `dealers.subscription_plan` | la colonna murata. Dice "base" per tutti da sempre. Il 14/09/2026 due vincoli che la limitavano a `('base','pro')` sono stati **tolti dai file** invece di essere messi in produzione: una serratura su una porta murata fa credere che la porta serva, e quell'elenco avrebbe rifiutato `elite` il giorno che qualcuno avesse provato a scrivere il valore giusto |
| `src/lib/vehicle-body-types.ts` | l'unico elenco delle carrozzerie: i valori sono anche quelli scritti nel database |
| `src/lib/tetto-del-piano.ts` | la regola del tetto del piano: quali auto stanno in vetrina quando sono piu' del consentito. **Una funzione sola** per sincronizzazione, importazione e pubblicazione a mano |
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

**Il tetto del piano si applica con una regola, non con un rifiuto.** Quando
una concessionaria ha sul suo sito piu' auto di quante il piano ne consente
(Ponginibbi, 10/09/2026: 81 auto, piano Base da 50), KeyAuto ne pubblica
esattamente quante il piano permette, scelte cosi': **prima le usate**, poi le
altre; a parita' di tipo prima quelle **gia' pubblicate** (la scelta non deve
cambiare a ogni sincronizzazione), poi le piu' recenti. Il limite vale sul
**totale** delle pubblicate, comprese quelle inserite a mano, e si legge sempre
dal piano in vigore (`resolve_dealer_listing_cap`): **mai un numero nel
codice**. Le auto oltre il tetto restano nell'archivio *in revisione*, con
l'origine e senza data di sparizione, e salgono da sole quando si libera un
posto; se il piano scende, escono nello stesso ordine, le usate per ultime. Il
concessionario legge nel gestionale quante ne restano fuori e cosa fare, e se
prova a pubblicare quando il posto non c'e' il clic viene **rifiutato subito**,
non a meta' di un'operazione di gruppo con la frase del database.

La regola sta in `src/lib/tetto-del-piano.ts` ed e' **una sola**. Le porte da
cui un'auto entra in vetrina pero' sono **dodici**, non tre, e chi ne aggiunge
una tredicesima deve passare di li': i tre bottoni di Gestione Veicoli
(singola, selezione, "pubblica tutte"), la scheda in modifica, il dettaglio
veicolo, l'importazione da file, quella da feed e quella dal sito con le loro
rotte, la sincronizzazione notturna, e `applicaTettoDelPiano` stessa. **Due di
queste scrivono con la chiave di servizio** (`/api/vehicles/feed` e la
sincronizzazione): li' il trigger del database non e' nemmeno l'ultima
serratura, perche' non scatta.

Due trappole nel contarli, tutte e due gia' pagate: i posti liberi si contano
**dal database** con la stessa definizione del trigger (`published` vero **e**
`status` "published") -- in giro ce ne sono altre due che contano cose diverse,
e l'elenco a video e' una pagina di nove righe gia' filtrata; e un'auto
portata in vetrina occupa un posto **anche quando e' un aggiornamento** di una
gia' in archivio, non solo quando e' nuova.

**E una terza, trovata il 19/09/2026: un controllo preventivo che di fronte a
una richiesta fallita rispondeva "c'e' posto per tutto".** `contaPubblicate`
finiva con `count ?? 0`. Quel `count` e' nullo in due casi che non si
somigliano per niente: quando le auto pubblicate sono davvero zero, e quando
**la richiesta al database non e' riuscita**. Nel secondo caso il controllo
concludeva "nessuna pubblicata", quindi `postiLiberi` restituiva l'intero
piano, quindi il clic passava -- per essere respinto a meta' dal trigger, con
la frase del database e senza dire cosa fare. Cioe' **esattamente lo scenario
che quel controllo esiste per evitare**, e che sta scritto tre paragrafi piu'
sopra.

La regola generale, e vale per qualunque controllo preventivo: **un controllo
che non sa non deve rispondere "si'".** Le tre risposte sono "puoi", "non
puoi" e "non lo so", e la terza non si appiattisce su nessuna delle altre due
per comodita'. Oggi i due conteggi rispondono `null`, e chi li chiama lo
tratta come "tetto non leggibile" -- che e' la risposta prudente gia'
prevista.

**Un sito che frena perde il turno, non il lavoro.** Quando il sito di una
concessionaria risponde "troppe richieste" (429), insistere e' esattamente
quello che ci ha chiesto di non fare: si passa la mano e il tempo va agli
altri. Ma il turno perso vale **solo per il passo che ha trovato il no**.

Il difetto, misurato l'11/09/2026 su autogepy.it: sul sito c'erano 17 auto mai
entrate in KeyAuto perche' le loro pagine non si leggevano. Ogni chiamata
provava prima quelle, prendeva il 429 alla prima, e passava la mano
all'**intero sito** -- senza mai arrivare alle 138 schede che c'erano gia' e
andavano solo ripassate. E siccome quelle 17 non entravano mai, restavano 17
per sempre. Quattro giorni con **zero** schede aggiornate, mentre l'indice del
sito si leggeva benissimo e le singole pagine, a ritmo lento, pure.

Due regole da tenere insieme: l'importazione delle nuove e il ripasso delle
esistenti **si alternano** (il cursore ricorda quale passo ha trovato il
freno), e un sito che ha appena frenato si legge con una **pausa lunga**
(`PAUSA_DOPO_IL_FRENO_MS`). Quel numero si corregge guardando quante schede
passano davvero: le risposte di un sito che limita non sono una soglia netta.

**Un contatto senza `dealer_id` non lo vede nessuno.** Oggi i contatti nascono
in un posto solo -- `/api/marketplace/lead`, che imposta sempre la
concessionaria -- e **il gestionale non ne crea a mano**. Il giorno che si
aggiunge "nuovo contatto" al pannello, quel modulo **deve impostare
`dealer_id`**: il trigger `enforce_lead_dealer_id` riempie quel campo solo per
i contatti di origine `marketplace`, quindi un contatto creato a mano senza
concessionaria resta orfano e non compare nell'elenco di nessuno. Non da'
errore: si perde in silenzio. Verificato su Postgres vero il 10/09/2026.

**Aggiornamento del 14/09/2026, e la nota qui sopra andava corretta.** Quella
protezione in produzione **non c'era**: `enforce_lead_dealer_id()` era fermo
alla versione del 28/06 -- identificata per confronto di impronte, non a
memoria -- che rifiuta un `dealer_id` sbagliato ma **non riempie** quello
vuoto. La versione che riempie stava solo nei file dal 22/08.
`20260914040000_il_contatto_senza_concessionaria_non_nasce_piu.sql` la porta
in produzione.

**Ma chiude solo il percorso `marketplace`.** Il trigger entra in azione
soltanto quando `source` vale `marketplace` (o e' vuoto): un contatto con
un'origine diversa **non e' protetto dal database, ne' prima ne' dopo**. E'
esattamente il caso di "nuovo contatto" dal gestionale il giorno che lo si
aggiungera': quel modulo **deve** impostare `dealer_id` da se', oppure il
trigger va esteso alla sua origine. Verificato in laboratorio su Postgres 17
il 14/09/2026, sette casi: il contatto con origine diversa esce con
`dealer_id` vuoto e nessun errore.

Un piano piu' sotto la stessa protezione c'e' ed e' scritta bene:
`enforce_lead_activity_dealer_id()` sulle **attivita'** dei contatti riempie
il campo e rifiuta la concessionaria altrui. Girava in produzione e non stava
in nessun file: se il database fosse stato ricostruito da zero si sarebbe
persa. Messa nei file il 14/09/2026.

**Un ripiego non inventa dati.** Quando un dato non c'e' -- la tabella non
esiste, la sessione e' scaduta, il database non risponde -- la tentazione e'
rispondere con qualcosa di plausibile per non lasciare la pagina vuota. E' il
difetto piu' ripetuto di questo progetto: la barra del pannello (PR #146), le
"Visualizzazioni" ferme a zero (PR #172), e le "Ultime sincronizzazioni" della
pagina Importazione, che per due mesi e mezzo hanno mostrato a ogni
concessionaria due importazioni mai avvenute -- 27 auto un'ora fa, 19 ieri --
perche' le tre tabelle interrogate non erano mai esistite.

Le regole, in ordine di importanza:

1. **Niente dati di esempio sul percorso vero.** Se servono a un test, stanno
   nel file di test e da nessun'altra parte.
2. **Un elenco vuoto e un errore non sono la stessa cosa.** "Non c'e' niente"
   e' un fatto e si dice; "non sono riuscito a leggerlo" e' un guasto e si
   dice diversamente. Un errore non diventa mai una lista vuota consegnata
   come successo.
3. **Un segnale `mock: true` nella risposta non salva niente**, perche' chi
   disegna la pagina non lo guarda: era li' anche stavolta.
4. Il suggerimento dentro una casella vuota (`placeholder`) e' un'altra cosa e
   va bene: non e' un dato mostrato come vero.

Il guardiano e' `src/lib/sincronizzazioni-veicoli.test.ts`.

**Un dato mancante non vale zero, in nessun calcolo.** E' la stessa famiglia
della trappola qui sopra, ma dentro i conti invece che dentro gli elenchi, e
in questo progetto e' gia' costata tre volte:

1. le "Ultime sincronizzazioni", due importazioni mai avvenute (PR #146, #172);
2. il **margine**, che valeva il prezzo di vendita intero quando l'acquisto non
   era scritto -- una vettura venduta a 11.500 senza acquisto risultava con
   11.500 di margine, visto su una riga vera in produzione (31/08/2026);
3. il **costo totale**, che sommava le altre voci ignorando l'acquisto
   mancante: 500 euro di trasporto su una vettura pagata 14.000 rispondevano
   "costo totale 500 euro" (14/09/2026);
4. il **prezzo d'acquisto scritto a zero**, che il modulo del conto economico
   rilegge come **vuoto** (`vehicle-economics-card.tsx`: un importo pari a
   zero diventa stringa vuota, e la stringa vuota torna `null`). A schermo
   compare "manca il prezzo di acquisto" su una vettura il cui prezzo
   d'acquisto c'e' ed e' zero -- una permuta a saldo, un'auto della casa
   madre. E' la stessa famiglia al contrario: qui non e' il vuoto che diventa
   zero, e' lo zero che diventa vuoto, e la regola che li distingue e' la
   stessa. **Trovato leggendo il 18/09/2026, non ancora provato su una riga
   vera: si prova prima di correggere.**

La forma e' sempre la stessa: **un numero plausibile al posto di "non lo so"**.
Chi guarda lo schermo non ha nessun modo di distinguerli, e ci crede. Le
regole:

- una somma a cui manca una voce **non e' un totale parziale, e' un totale
  sbagliato**: si restituisce `null`, non la somma del resto;
- il trattino non va mai da solo: accanto si scrive **perche'** manca, come fa
  `percheIlCosto`. Un trattino muto si legge come zero o come un guasto;
- il campo scritto a **zero** e' un dato e il conto si fa. La differenza fra
  `null` e `0` e' la differenza fra "non lo so" e "non e' costata niente", e
  nel database esiste gia': non va appiattita;
- se la stessa formula vive anche come **colonna calcolata** nel database,
  vanno cambiate tutte e due insieme. Due formule che dicono cose diverse sono
  peggio di una sola, e nel conto economico le schermate leggono l'una e le
  statistiche l'altra.

I guardiani sono in `src/lib/conto-economico.test.ts`, sotto "un dato mancante
non vale zero".

**La passata del 19/09/2026, e cosa e' rimasto fuori.** Cercando ovunque il
vuoto che diventa zero **e** lo zero che diventa vuoto ne sono usciti nove,
tutti chiusi in una volta con `src/lib/lo-zero-e-il-vuoto.test.ts` come
guardiano. Due cose vanno sapute prima di toccare quella zona.

**Nessuno dei nove era visibile quel giorno**, ed e' il motivo per cui erano
li' da mesi: in produzione **372 auto su 372 hanno un prezzo**, e delle dieci
righe di conto economico **nessuna ha l'acquisto a zero** (nove vuote, una da
4.000 €). Erano tutti carichi, non incendi.

**E qui sta la risposta a "ma quanto e' urgente".** Questi difetti **non si
misurano da quante righe toccano oggi, ma da cosa succede il giorno che una
riga ci finisce dentro.** "Zero righe coinvolte" non vuol dire "nessun
danno": vuol dire che nessuno li ha ancora incontrati, e che quando
qualcuno li incontrera' saremo altrove a fare altro. Il conteggio a zero e'
la misura dell'esposizione di oggi, non della gravita'.

Vale al contrario di come suona: **zero righe e' anche il momento migliore
per correggerli.** Non c'e' niente da riparare, nessun dato gia' sbagliato da
rintracciare, nessuna concessionaria a cui spiegare perche' un numero era
diverso la settimana scorsa. Il giorno che le righe non sono piu' zero, alla
correzione si aggiunge la bonifica -- e la bonifica di un dato cancellato,
come quello del conto economico qui sotto, **non si puo' fare**.

**E due sono rimasti fuori apposta:**

1. **Le dieci colonne `cost_*` del conto economico sono obbligatorie con
   valore predefinito zero.** Li' "non l'ho registrato" e "non e' costato
   niente" **non si possono distinguere**, e non e' un difetto del codice: e'
   lo schema che non ha il posto dove scrivere la differenza. Per questo il
   modulo mostra la casella vuota quando una `cost_*` vale zero, mentre
   mostra "0" per `purchase_price` e `sale_price`, che il vuoto lo ammettono.

   **Va risolta, e serve una migration**, quindi non adesso: e' in elenco fra
   le cose interne in [MIGRAZIONI.md](supabase/MIGRAZIONI.md). Il motivo per
   cui non e' cosmetica: finche' zero e "non registrato" sono
   indistinguibili, **il margine di un'auto a cui il concessionario non ha
   ancora messo i costi sembra completo e non lo e'**. Il conto torna, tutte
   le voci hanno un numero, e il margine e' piu' alto del vero di tutto
   quello che non e' stato ancora scritto -- ed e' il numero su cui si
   decide un prezzo.
2. **La perizia scrive "0 €" su ogni voce non compilata**
   (`perizia-page.tsx`, la funzione `numero()`), e **non va corretta**.
   Deciso dal titolare il 20/09/2026, dopo averla guardata.

   Sembra il decimo caso della passata e non lo e', e la differenza vale la
   pena capirla perche' e' l'unica cosa che impedisce a qualcuno di
   "correggerla" fra sei mesi. Negli altri nove il vuoto voleva dire **"non
   lo so"**: un'auto senza prezzo in archivio e' un'auto di cui il prezzo
   nessuno l'ha scritto. Qui il vuoto vuol dire **"non c'e' niente da
   fare"**: una perizia si compila con l'auto davanti, voce per voce, e una
   riga lasciata in bianco e' una riga che il perito **ha guardato** e ha
   giudicato a posto. Zero e' la risposta giusta, e un trattino direbbe una
   cosa falsa -- che quella voce non e' stata valutata.

   La prova che non e' una svista sta nello stesso file: `offered_price`
   distingue gia' `null` e lo mostra come "-". Chi l'ha scritto sapeva fare
   la differenza, e l'ha fatta dove serviva.

   **La regola che ne esce, ed e' la cosa da portarsi via:** prima di
   trasformare uno zero in un trattino si guarda **chi riempie quel campo e
   in che condizioni**. Un campo che si compila una volta sola davanti
   all'oggetto, con l'obbligo implicito di guardarlo tutto, non ha vuoti che
   vogliono dire "non lo so": ha vuoti che vogliono dire zero. Un campo che
   si riempie quando capita, ce l'ha eccome.

**E la terza forma che prende questa famiglia: il ripiego silenzioso.** Le
prime due si riconoscono perche' il numero e' **inventato** (le due
importazioni mai avvenute) o **incompleto** (il costo totale che ignora
l'acquisto mancante). Questa no: il numero e' **vero**, contato bene -- solo
che e' il conto di un'altra cosa.

Il caso, 19/09/2026, in home. I quattro riquadri in cima al marketplace
aprono con "Veicoli pubblicati", e il codice diceva
`totalVehicleCount ?? vehicles.length`. A sinistra il conteggio vero, chiesto
al database con `count: "exact"`. A destra le **ventiquattro** auto delle
"ultime arrivate", cioe' la finestra che la home carica per mostrarle piu' in
basso nella pagina.

Il giorno in cui quel conteggio non fosse riuscito -- una richiesta in piu'
che non torna, niente di raro -- il sito avrebbe annunciato **"24 veicoli
pubblicati"** come totale dell'intero marketplace: le ultime arrivate
mostrate come se fossero tutto. Non un numero impreciso. **Un numero di
un'altra cosa, con la stessa faccia.** Ventiquattro e' esatto; e' la risposta
a una domanda che nessuno ha fatto.

E' la piu' difficile da vedere delle tre, per due motivi che si sommano:

- **il ripiego si scrive mentre si fa la cosa giusta.** Chi ha aggiunto il
  conteggio vero ha aggiunto anche il `??`, in buona fede, per non lasciare
  un buco nella pagina. Nel diff sembra prudenza;
- **non si manifesta finche' tutto funziona.** Un difetto che compare solo
  quando qualcos'altro e' gia' andato storto non lo trova nessuno guardando
  lo schermo, e non lo trova nemmeno chi prova la pagina: si trova solo
  leggendo la riga e chiedendosi cosa succede quando il primo valore manca.

La regola, e **non vale solo per i numeri**: **`??` e `||` su un valore
mostrato sono sempre sospetti, perche' il valore a destra deve rispondere
alla stessa domanda di quello a sinistra.** Quasi sempre non ci risponde --
se ci rispondesse non servirebbero due strade per ottenerlo. Quando non
risponde, il ripiego giusto e' **non mostrare niente**: in home il riquadro
che non si sa adesso non compare, e restano tre numeri veri invece di quattro
di cui uno inventato.

**Fuori dai numeri fa gli stessi danni, e su cose piu' difficili da
smentire.** Un nome, una data, una **provenienza**: un ripiego li rende
indistinguibili da un dato dichiarato. Nella cronologia del veicolo
(`src/lib/vehicle-timeline.ts`) la riga di un contatto ricevuto si scrive
`String(metadata.source ?? "marketplace")` e stampa *"Nuovo lead ricevuto
(marketplace)."*: se l'origine non era stata registrata, la cronologia la
**dichiara** marketplace. Oggi non dice il falso, ma per combinazione -- i
contatti nascono in un posto solo -- non per costruzione; il giorno che si
aggiunge "nuovo contatto" dal gestionale comincia a mentire da sola, e
nessuno la smentira' perche' una cronologia si legge e non si controlla.
**Trovato il 19/09/2026 cercando un esempio per questa regola, segnalato e
non corretto.**

Il modo giusto sta due file piu' in la', e vale la pena tenerlo accanto:
`nomeCliente` ripiega su `"Cliente senza nome"` (`src/lib/compratore.ts`).
Anche quello e' un `??` su un valore mostrato, ma il valore a destra risponde
alla domanda giusta: **dice che il nome non c'e'**, invece di inventarne uno
plausibile.

**E un si'/no che ammette il vuoto e' un terzo stato che nessuno gestisce.**
E' la stessa famiglia, sulle colonne invece che sui conti. Misurato il
14/09/2026: in produzione `vehicles.published` ammetteva il vuoto. Il tetto del
piano conta `published = true`, il marketplace filtra `published = true`, la
scheda mostra "in vetrina" o "no": una riga con quel campo vuoto **non sta ne'
di qua ne' di la'**, e nessuna parte del codice sa cosa farne. Non e' un errore
che si vede: e' un'auto che sparisce da tutti e due gli elenchi.

Prima di allineare una colonna cosi' si contano le righe vuote: se sono zero --
e lo erano, su tutte e quindici le colonne trovate quel giorno -- il dato c'e'
sempre e manca solo la regola che lo pretende. Chiuse in
`20260914080000_le_ultime_colonne_come_in_produzione.sql`.

**Una scelta documentata non e' una scelta giusta.** Il terzo caso non era una
svista: era una decisione, fissata da un test che la spiegava -- *"e' una
risposta onesta anche senza acquisto: dice quanto si e' speso finora"*. Letta
da sola suonava ragionevole. Era sbagliata di quattordicimila euro.

Il commento che motiva una scelta dice **perche' fu presa**, non che regga
ancora: chi l'ha scritta aveva in testa un caso, e il caso che la rompe e'
quasi sempre un altro. Quando un difetto porta a una riga che sembra voluta,
si legge la motivazione e la si mette alla prova con un numero vero, invece di
fermarsi davanti al commento. Se cade, si cambia la riga **e** si riscrive la
motivazione con la data e il caso che l'ha fatta cadere.

**E una regola scritta giusta puo' essere applicata a meta'.** E' il caso
gemello, e in questo progetto e' capitato quattro volte. L'ultima, il
14/09/2026: l'inventario dello schema ha una famiglia per i permessi **colonna
per colonna**, e il commento che la introduce spiega benissimo il pericolo --
*"un grant di troppo aprirebbe subscription_plan, e il confronto resterebbe
verde"*. La regola pero' guardava solo `INSERT` e `UPDATE`. I sessantuno
permessi di **lettura** colonna per colonna -- quelli che decidono cosa il
mondo vede di `vehicles` e `dealers` con la sola chiave pubblica, e che
tengono chiusi targa, telaio, codice fiscale e piano dell'abbonamento -- erano
fuori dalla sorveglianza. Un `grant select (plate) on public.vehicles to anon`
avrebbe aperto la targa di ogni vettura **lasciando verde il controllo
settimanale**.

Le altre tre: la protezione per riga accesa ma senza `force` (chi possiede la
tabella la scavalcava); `revoke ... from public` che non toglie il permesso
che Supabase concede ad `anon` (sette funzioni `security definer` restavano
eseguibili dal sito, per due mesi); e `dealer_users`, dove si toglievano
`insert/update/delete` ma non `all`.

**E una frase del titolare non e' piu' vera di una mia solo perche' l'ha
detta lui.** E' la stessa forma delle due regole qui sopra -- un commento che
motiva una scelta, una regola scritta bene -- spostata su **chi parla**
invece che su cosa e' scritto: l'autorita' di una fonte non e' una verifica.

Il caso, 19/09/2026. Il prezzo minimo sbagliato sulla scheda della
concessionaria e' stato raccontato cosi': *"quelle auto sotto gli 8.000 €
esistevano, erano pubblicate, e chi cercava in quella fascia non le
trovava"*. Era una frase del titolare, in un messaggio che chiedeva di
metterla agli atti. Copiarla era la cosa piu' naturale del mondo, e sarebbe
stata una riga falsa dentro il documento in cui si raccolgono le lezioni
vere.

**Si trovavano.** La ricerca del marketplace filtra il prezzo nel database,
non sull'elenco caricato, e le cinque auto sotto quella soglia -- 5.800,
6.475, 7.500, 7.800, 7.900 -- sono state ritrovate una per una interrogando
la produzione con la sola chiave pubblica. Quello che era falso era il
**biglietto da visita**: "a partire da 7.500 €" su una vetrina che partiva da
5.800, e chi apriva quella pagina poteva chiuderla li'. Meno grave, stesso
difetto.

La regola vale in tutte e due le direzioni, ed e' la ragione per cui sta
scritta qui: **una premessa si verifica prima di scriverla, da chiunque
arrivi**. Quando la verifica la corregge, si scrive la forma giusta **e si
dice al titolare cosa e' stato cambiato e perche'** -- non si corregge in
silenzio, e non si riporta la sua versione per cortesia. Una lezione
sbagliata in questo file e' peggio di una lezione mancante: verra' riletta
come vera per mesi, e nessuno avra' motivo di dubitarne.

**Come si evita la quinta volta.** Quando una regola nomina un elenco --
comandi, ruoli, tabelle, tipi di oggetto -- la domanda non e' "l'elenco e'
giusto?" ma **"cosa resta fuori dall'elenco, e perche'?"**. Se la risposta non
sta in una riga, l'elenco e' incompleto. E davanti a un controllo che dice
"nessuna differenza", la frase da tenere in mente e' quella con cui il difetto
e' stato trovato:

> **"Zero differenze li' vuol dire non guardato, non tutto a posto."**

Un conteggio a zero e' una risposta solo se si sa **cosa** e' stato contato.
Prima di riportarlo come rassicurazione si apre la regola e si guarda il suo
filtro: una famiglia che non viene interrogata risponde zero esattamente come
una famiglia sana. Il giro completo di quali serrature
l'inventario sorveglia e quali no sta in
`supabase/migrations/20260914020000_il_guardiano_vede_anche_la_lettura.sql`.

**L'importazione da file non sa cosa sia una targa.** In
`src/lib/vehicle-import.ts` i campi riconosciuti sono ventisette e comprendono il
telaio (`vin`, con gli alias "telaio" e "chassis"), ma **la targa non c'e'**.
Una colonna "Targa" in un CSV oggi non viene agganciata a niente: **si perde in
silenzio**, senza un avviso, e il concessionario crede di averla importata.

Non e' ancora costato niente perche' nessuno ha importato un file con le
targhe, ma e' una bomba a orologeria: il giorno che un cliente arriva con il
suo listino, la chiave piu' importante che possiede sparisce durante il
caricamento. E' il primo lavoro della fase che riempie i dati gestionali.

Quando si aggiunge, la targa passa **sempre** da `src/lib/targa.ts`: una targa
che non ha una forma italiana valida non si salva come targa, si segnala nel
riepilogo dell'importazione insieme alle righe ambigue.

**Una targa sbagliata e' peggio di una targa mancante.** Leggendo le schede
dei tre siti collegati il 14/09/2026, su **62 targhe pubblicate due valevano
`XXX` e `XXXX`**: segnaposto lasciati nel gestionale del concessionario.
Scritte nel nostro archivio sarebbero indistinguibili da una targa vera, e la
targa e' una chiave: con quella una vettura si segna venduta
(`auto-da-chiudere.ts`), si raggruppano i suoi documenti
(`archivio-documenti.ts`), e si interroga la ricerca a pagamento, **che si paga
a interrogazione anche quando la targa non esiste**.

La forma sta in `src/lib/targa.ts`, **un posto solo**, e vale sia per
l'inserimento a mano sia per qualunque importazione. Due cose da sapere prima
di toccarla:

- **le targhe moderne non usano I, O, Q, U** (si confondono con 1, 0 e fra
  loro), ma **le sigle delle province si'**: Milano, Bologna, L'Aquila. Il
  primo tentativo di quel file escludeva quelle lettere dappertutto e
  rifiutava `MI123456`;
- **un campo vuoto non e' un errore.** Una vettura importata dal sito non ha
  quasi mai la targa, e nessuno deve inventarsene una per salvare la scheda.
  Quello che non si fa e' salvare come targa qualcosa che targa non e'.

**Una regola messa in un posto solo non chiude le porte che non la
chiamano.** "Un posto solo" e' dove la regola **vive**, non quante porte la
usano: il lavoro e' finito solo quando **ogni** scrittura di quella colonna
passa di li'. Il 15/09/2026 la forma della targa e' entrata in `targa.ts` ed
e' stata agganciata alla scheda in modifica; **"Segna venduta"** continuava a
scrivere la targa com'era digitata -- proprio nel momento in cui diventa
l'unica cosa che identifica l'auto venduta. Trovato il 16/09/2026 facendo la
stessa cosa per il telaio. E' lo stesso schema del guardiano che guardava le
schermate sbagliate e del tetto del piano corretto in un posto e aggirato in
dodici.

Come si evita: quando una regola entra in una libreria, si cerca **chi scrive
quella colonna** (`grep -rn "plate:" src`, non "chi nomina la targa"), si
elenca ogni porta trovata, e ognuna passa dalla libreria o finisce in un
elenco esplicito con il perche'. Poi un test sul testo dei sorgenti fissa
l'elenco, come `il telaio ha una casa sola` in `src/lib/telaio.test.ts`: il
difetto arrivera' dalla porta che nessuno ha contato.

**La verifica di sicurezza sulle targhe lette dai siti** (14/09/2026, 126
pagine): la targa si prende **solo** dal blocco dati il cui identificativo
coincide con quello della scheda che si sta leggendo. Misurato: 62 targhe
lette, **62 distinte**, **zero** pagine contenenti i dati di un'altra vettura,
**mai piu' di un blocco veicolo per pagina**. Il controllo resta scritto anche
se su questi tre siti non ha trovato niente: il giorno che un sito mettera' due
vetture nella stessa pagina e' l'unica cosa che impedisce di attribuire la
targa dell'una all'altra.

**Le notifiche non distinguono gli utenti della stessa concessionaria.** Dal
22/08/2026 le quattro regole di accesso su `notifications` chiedono soltanto
la concessionaria (`dealer_id = current_dealer_id()`), non l'utente: al
livello del database chiunque abbia una sessione attiva su una concessionaria
puo' leggere -- e segnare come lette -- le notifiche di un suo collega. Le
regole precedenti chiedevano `user_id = auth.uid()`; la migration
dell'isolamento le ha sostituite tutte.

**Oggi non fa danni perche' ogni piano ha un utente solo.** E' la stessa
condizione della correzione descritta piu' sopra in
[MIGRAZIONI.md](supabase/MIGRAZIONI.md): **va risolto prima di vendere un
piano con piu' di un utente**, Elite compreso. Sono due voci della stessa
lista, e vanno guardate insieme il giorno che quella lista si apre.

**Scrivere una regola nei file non chiude una differenza.** La chiude solo
quando la regola arriva nel database vero. Sono due numeri diversi e vanno
tenuti separati in ogni resoconto: *"le differenze scendono a N scrivendo i
file"* e *"scendono a M quando il titolare applica la migration"*. Confonderli
fa sembrare risolto qualcosa che nel database che gira e' ancora com'era.

La prova che la distinzione conta: il 14/09/2026 quindici colonne erano
dichiarate obbligatorie **nei file** e libere in produzione. Scriverle
nuovamente nei file non cambiava niente -- li' lo erano gia'. Il conteggio si
muove solo con l'`alter table` sulla produzione.

**I valori di un tipo enumerato si leggono senza chiedere niente al titolare.**
L'inventario dice soltanto `USER-DEFINED`, e il nome del tipo e i suoi valori
sembrano richiedere una query sulla produzione. Non e' cosi': PostgREST
pubblica la descrizione dello schema, e li' ci sono per esteso.

```bash
set -a; . ./.env.production; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Accept: application/openapi+json" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  | jq '.definitions.audit_logs.properties.actor_type'
```

Risponde `{"enum": ["user","system","api"], "format": "public.audit_actor_type_t"}`.
E' cosi' che si e' saputo com'era fatto `audit_logs.actor_type` senza
indovinarlo.

**Una colonna nominata da una regola di accesso non cambia tipo.** Postgres
rifiuta con *"cannot alter type of a column used in a policy definition"*, e
lo rifiuta **a meta' della transazione**: se quella riga sta dentro una
migration che il titolare incolla nell'editor SQL, si ferma li'. Successo il
14/09/2026 convertendo `demo_requests.vehicle_count` da testo a numero, perche'
`demo_requests_insert_public` pretende `vehicle_count is not null`.

Si toglie la regola, si cambia il tipo, si rimette la regola **identica** --
stesso nome, stesso comando, stesso ruolo, stesso controllo -- e si verifica
dopo la ricostruzione che sia tornata bit per bit quella di prima.

**Provare invece di dedurre ha gia' evitato quattro guasti nell'editor SQL del
titolare**, e tutte e quattro le volte il difetto era invisibile leggendo il
codice:

1. **l'ordine di cancellazione delle tabelle**: `drop table import_sources`
   viene rifiutato, perche' quattro tabelle dipendono da lei;
2. **il primo `src/lib/targa.ts`**, che escludeva le lettere I, O, Q, U anche
   dalle sigle delle province e rifiutava `MI123456`;
3. **il tipo di una colonna nominata da una regola di accesso**, qui sopra;
4. **`notifications_type_check`**: quel vincolo elenca i tipi di notifica
   ammessi, e aggiungerne uno nuovo senza toccarlo fa **rifiutare
   l'inserimento a meta' della transazione**. Trovato il 14/09/2026
   aggiungendo `vehicle_import` e `piano_pieno`. Il contrario e' altrettanto
   vero: un tipo vecchio **non si toglie** dall'elenco finche' esistono righe
   che lo portano, o le si rende illegali.

La forma comune: **un vincolo, un permesso o una dipendenza che il codice non
nomina**, e che si scopre solo quando il database dice di no. Una migration si
prova su Postgres vero **prima** di consegnarla, sempre -- ricostruendo lo
schema da zero, non su una tabella finta scritta a mano, perche' meta' di
queste quattro non sarebbero comparse.

**Il ritorno di una migration non si manda mai insieme alla migration.** E'
l'unica cosa che non deve essere eseguita per sbaglio, e due blocchi di SQL
uno sotto l'altro in uno stesso messaggio si somigliano abbastanza da
scambiarli.

Successo il 18/09/2026: il titolare ha eseguito il ritorno al posto della
migration. E il motivo per cui questa regola esiste e' tutto qui:

> **Non ha fatto danni per un caso.** Il ritorno non trovava niente da
> annullare, perche' la migration non era ancora passata. Con l'ordine
> inverso avrebbe disfatto il lavoro appena fatto, **e il conteggio finale
> avrebbe detto zero senza nessun errore**.

Quest'ultima riga e' la parte che conta: non ci sarebbe stato niente da
vedere. Nessun messaggio rosso, nessuna eccezione, solo un numero a zero che
somiglia moltissimo a "non c'era niente da fare".

La regola: **prima si manda solo la migration**. Il ritorno si manda dopo, in
un messaggio separato, e solo se serve davvero o se il titolare lo chiede; in
cima ci va scritto cosa annulla.

**E una precauzione che esiste nel progetto va rispettata anche in chat.** I
due file stanno gia' in cartelle diverse -- `supabase/migrations/` e
`supabase/ritorni/` -- proprio perche' non si confondano. Quella separazione
e' stata buttata via nel modo di presentarli, incollandoli uno sotto l'altro
in un messaggio. Vale in generale, non solo per le migration: se il progetto
tiene due cose lontane, tenerle vicine nel messaggio che le consegna e' come
non averle mai separate.

**E i numeri attesi si scrivono solo per cio' che la migration fa.** Nello
stesso giorno, il riepilogo di quella migration dichiarava un valore atteso
anche per tre colonne che contano righe scritte **da altro** -- dalla
sincronizzazione notturna, che gira ogni tre ore. Fra la scrittura e
l'esecuzione erano cambiati, e il titolare ha letto tre numeri che non
tornavano accanto a tre che tornavano. **Un numero atteso che non torna fa
dubitare di tutto il resto**: un valore atteso si scrive solo dove nessun
altro puo' muoverlo, e per il resto si dice "si legge, non si verifica".

**Ogni migration ha la data nel nome, e un file che non ce l'ha gira per
ultimo.** In una ricostruzione le migration si applicano in ordine
**alfabetico** (`scripts/ricostruisci-schema.sh`), e nell'alfabeto del computer
**le cifre vengono prima delle lettere**: un file che comincia per lettera
finisce dopo **tutti** quelli datati, comprese le migration scritte mesi dopo.
Qualunque cosa ridefinisca, vince -- e nessuna correzione futura potra' avere
la meglio, perche' arrivera' sempre prima.

Il 14/09/2026 `supabase/migrations/rls_vehicles_policies.sql`, senza data nel
nome, ridefiniva `enforce_vehicle_dealer_id()` ed
`enforce_vehicle_image_dealer_id()` -- due protezioni dell'isolamento fra
concessionarie -- con una versione piu' vecchia di quella in produzione, e
girando per ultimo era quella a sopravvivere. Questa volta le due versioni si
comportavano allo stesso modo (un `if` annidato invece di un `and`); la
prossima potrebbe non essere cosi'.

**I due file esistenti non si rinominano** -- cambierebbe l'ordine in modi che
nessuno ha verificato -- e il loro contenuto si tiene allineato alla
produzione. Il guardiano e' `src/lib/migrazioni-in-ordine.test.ts`, che
fallisce se ne compare un terzo.

**Le notifiche: tre difetti corretti il 14/09/2026, e uno lasciato apposta.**

I tre corretti, trovati leggendo il testo delle funzioni in produzione:

1. **Meta' di `sync_stale_notifications` non trovava mai niente.** Cercava i
   contatti con `status = 'created'`, il vecchio nome inglese. Gli stati di
   questo progetto sono italiani (`src/lib/leads.ts`), e `leads_status_check`
   -- in produzione -- ammette **solo** quei sei: scrivere `created` viene
   rifiutato dal database. La condizione era morta due volte, e **l'avviso
   "Lead non contattato da 24 ore" non e' mai arrivato a nessuno**.
2. **Diceva una cosa falsa.** Annunciava *"Veicolo in bozza da oltre 7 giorni"*
   per ogni vettura non pubblicata, comprese le **76 in `in_review`** che il
   **tetto del piano** aveva messo da parte. Ora le bozze vere e le auto
   fermate dal tetto si distinguono, e le seconde producono **una sola**
   notifica per concessionaria: *"Il tuo piano include 50 auto: 76 del tuo
   sito non sono pubblicate."*
3. **Una sincronizzazione allagava la campanella.** Un trigger per riga
   scriveva una notifica per ogni auto importata: delle 411 in produzione,
   **373 erano `vehicle_new`**. Ora si raggruppano per sito e per giorno
   (`vehicle_import`, con la colonna `conteggio`), e **un'auto inserita a mano
   non produce piu' niente**: annunciare al concessionario una cosa che ha
   appena fatto lui e' rumore.

**Il quarto e' ancora li', ed e' voluto.** Le due interrogazioni fanno
`cross join` sugli utenti della concessionaria: **un inserimento per ogni cosa
per ogni utente**. Oggi ogni piano ha un utente solo e non si vede. Va risolto
**prima di vendere un piano multiutente**, ed e' la **terza voce** di quella
lista, insieme alle notifiche leggibili fra colleghi e alla correzione su
`dealer_users` descritta in [MIGRAZIONI.md](supabase/MIGRAZIONI.md). Il
raggruppamento lo rende molto meno grave: tre utenti moltiplicano **una**
notifica per sito, non centoquaranta.

**Due cose da sapere prima di aggiungere un tipo di notifica.**
`notifications_type_check` elenca i tipi ammessi: un tipo nuovo va aggiunto li'
o l'inserimento viene rifiutato **a meta' della transazione**. E i tipi vecchi
non si tolgono dall'elenco finche' esistono righe che li portano. Le due cose
insieme sono state trovate provando la migration su Postgres vero, non
leggendola.

Il guardiano e' `src/lib/notifiche.test.ts`.

**E una quarta cosa, minore:** `set_updated_at()` in produzione non ha
`set search_path`, mentre i file ce l'avevano. I file erano piu' prudenti. La
funzione **non e' `security definer`**, quindi gira con i permessi di chi la
chiama e un `search_path` non fissato non permette di scavalcare niente: e'
un'imprudenza, non un buco. Da sistemare dopo la pulizia, insieme ai tre difetti
qui sopra.

**Un controllo che non e' mai diventato rosso non e' un controllo, e' una
decorazione.** E' la sorella di "zero differenze li' vuol dire non guardato".
Il 15/09/2026 il guardiano della provenienza (`src/lib/provenienza-dati.test.ts`)
elencava tre schermate "da collegare" -- ed erano **tre falsi allarmi**: la
pagina delle perizie scrive su `vehicle_appraisals`, le altre due cambiano
solo stato e pubblicazione. Il controllo guardava chi **nominava**
`registration_date` da qualche parte nel file, non chi lo **scriveva** su
`vehicles`; e proteggeva tre campi invece dei ventidue che il sito manda.
Intanto le porte vere -- il feed, il file, la duplicazione -- passavano verdi.

Un controllo cosi' rassicura esattamente come uno che funziona, e per un
giorno l'ha fatto. Le due regole:

1. **prima di fidarsi del verde, si produce il rosso**: si mette una porta
   finta -- un `.from("vehicles").update({ price: 1 })` in un file qualsiasi
   -- e si guarda che il test la trovi. Se non la trova, il test non guarda
   quello che dice di guardare. Rifatto il 16/09/2026 seguendo la catena da
   `.from("vehicles")` alla scrittura, provato rosso, e da allora ha un caso
   dentro (`il guardiano vede una porta nuova`) che lo tiene rosso per
   costruzione;
2. **un elenco di eccezioni si rilegge quando cambia il controllo.** Le tre
   di ieri non "si sono accorciate": erano sbagliate, e l'elenco vero ne ha
   cinque. Un elenco che cambia contenuto va riscritto con la data e il
   motivo, non aggiustato in silenzio per far tornare il conto.

**E c'e' un terzo modo in cui un controllo puo' essere sbagliato: guardare
una cosa diversa da quella che dice di guardare.** I primi due si scoprono
perche' restano **verdi** quando dovrebbero accendersi. Questo si scopre al
contrario -- diventa **rosso quando non dovrebbe** -- e per questo e' piu'
insidioso: sembra che il codice sia sbagliato, e la tentazione e' rimettere
le cose com'erano.

Il 19/09/2026, togliendo il taglio dal nome del venditore sulla scheda in
elenco, e' caduto `vehicle-card-clickable.test.ts`. Il suo commento diceva:
*"Il nome del venditore resta testo semplice accanto al prezzo: reso
toccabile aveva bisogno di spazio sopra e sotto, e la scheda cresceva di 12
px"*. Giustissimo -- ma l'asserzione fissava la **riga intera**, classe
`truncate` compresa, che con quella ragione non c'entra niente. Il controllo
diceva "non deve diventare un collegamento" e in realta' guardava "non deve
cambiare".

**Come si riconosce:** un test cade e la sua spiegazione non parla di quello
che hai cambiato. Allora non si "aggiusta" e non si rimette indietro il
codice: si rilegge il commento, si capisce cosa voleva davvero impedire, e
si riscrive l'asserzione perche' guardi quello. Poi la si prova rossa sul
difetto vero -- qui, rimettendo un collegamento intorno al nome.

**Come si evita scrivendolo:** un'asserzione che copia una riga di codice
per intero fissa tutto quello che c'e' dentro, comprese le cose che a chi
l'ha scritta non interessavano. Si fissa **la proprieta'**, non il testo:
"l'elemento che contiene il nome e' uno `span`", non `<span
className="truncate">{dealerName}</span>`.

**Un guardiano si rilegge quando una tabella comincia a essere usata, non
solo quando viene creata.** E' la terza faccia di "zero differenze li' vuol
dire non guardato", e si presenta sempre allo stesso modo: un controllo che
risponde **zero** perche' non c'e' niente da controllare, e che resta cosi'
anche il giorno in cui qualcosa da controllare c'e'.

Il 18/09/2026 `vehicle_acquisitions` non era fra le tabelle sorvegliate da
`src/lib/tenant-scoped-queries.test.ts`. Non era una svista: quando la tabella
e' nata, il 15/09, **nessuna schermata la leggeva** -- la scriveva soltanto la
sincronizzazione -- e un elenco di tabelle da sorvegliare non serviva a
niente. Tre giorni dopo la scheda del veicolo ha cominciato a leggerla, e da
quel momento una interrogazione senza `dealer_id` sarebbe passata **verde**:
non perche' fosse giusta, ma perche' nessuno la stava guardando.

Il momento in cui rileggere un guardiano non e' quello in cui si crea la
tabella: e' quello in cui **la prima schermata la apre**. Nella stessa
modifica che la legge si aggiunge il suo nome all'elenco, e si produce il
rosso prima di fidarsi del verde (una interrogazione finta senza `dealer_id`).
Vale per le tabelle, e per qualunque famiglia che un controllo enumera:
colonne, ruoli, tipi di notifica, cartelle.

**E quando un controllo legge il codice con un'espressione, l'espressione e'
parte del controllo.** Un guardiano che scandisce i sorgenti con una regex
non guarda i file: guarda **quello che la regex cattura**, e cio' che le
sfugge risponde "tutto a posto" esattamente come cio' che e' sano.

Il 18/09/2026: il guardiano che verifica che ogni campo scritto da
`payloadDatiVeicolo` sia elencato in `CAMPI_DAL_SITO` leggeva i nomi con
`[a-z_]+`. **Le cifre non ci sono dentro**, quindi saltava in silenzio ogni
campo con un numero nel nome. Ce n'era uno solo, `co2_emissions`, e per
fortuna era gia' in elenco: il difetto non e' costato niente, ma il controllo
non lo stava guardando da quando esiste. Trovato scrivendo un altro test che
usava la stessa espressione e che non tornava il conto.

La prova che serve e' sempre la stessa: **si pianta un caso finto che la
regex dovrebbe trovare** -- qui un campo nuovo chiamato `euro6_ready` -- e si
guarda che il test diventi rosso. Se resta verde, non e' il codice a essere
sano: e' il controllo a non guardare.

**E vale anche per il verde di GitHub: un verde si legge sempre insieme al
commit a cui si riferisce.** Il 18/09/2026, cinque minuti dopo aver scritto la
regola qui sopra, la CI di una PR e' stata letta come "passata" mentre quel
risultato era del commit **precedente**: il push appena fatto ne aveva avviato
un altro, ancora in corso. La fusione e' stata rifiutata da GitHub, che
guardava la cosa giusta.

Il giro dopo e' andata peggio, e per la stessa ragione: `git push` ha
risposto *"Everything up-to-date"* -- il commit era finito su `main` invece
che sul ramo -- ma quella risposta era **filtrata via** da un `grep`, e al suo
posto compariva un rassicurante "spinto". Il verde letto subito dopo era di
nuovo quello del commit di prima, e GitHub rispondeva *"No commit found for
SHA"* a chi glielo chiedeva per nome.

Le due regole che ne escono, e sono la stessa: **si confronta sempre la testa
del ramo con il commit su cui il controllo ha girato**
(`git rev-parse HEAD` contro `.head_sha` del run), e **l'esito di un comando
non si filtra mai**. `gh pr checks` dice anche `pending`, e un controllo che
non ha finito non e' un controllo che ha detto di si'.

**E c'e' un rosso che non e' un guasto, ed e' il piu' pericoloso di tutti:
quello che nessun evento cancella.** Il controllo *"Lo schema di produzione
combacia con i file"* gira su `main` **solo** quando cambiano i file sotto
`supabase/migrations/`, piu' il cron del lunedi'. In questo progetto la
migration entra nei file **prima** di essere applicata a mano: quindi il
controllo, appena il file arriva, trova la differenza e diventa rosso --
giustissimo -- e quando il titolare applica e la differenza sparisce **non
succede niente**, perche' nessun evento lo rilancia.

Il 19/09/2026: verde alle 08:37, rosso alle 09:17 su cinque righe (la vista
`vetrina_per_concessionaria`, nei file e non ancora in produzione), vista
applicata pochi minuti dopo, **e il rosso e' rimasto appeso per ore** su una
produzione che nel frattempo combaciava. Verificato ricostruendo lo schema in
Docker e rilanciando lo stesso confronto della CI: zero differenze su tutte e
tredici le famiglie.

Il punto non e' il rosso: e' che **fra il merge e l'applicazione il rosso e'
lo stato normale del progetto, e un allarme che e' normale non e' un
allarme**. E' la stessa famiglia di *"un controllo che non e' mai diventato
rosso"*, girata al contrario -- li' era il verde a non voler dire niente, qui
e' il rosso.

La prova che il meccanismo funziona, e funziona contro di noi: quel rosso, in
questo stesso file, era stato liquidato in una nota di servizio con *"e'
quello vecchio, non riguarda questo lavoro"* -- **da chi aveva appena
scritto la regola**. Il titolare non se l'e' bevuta e ha chiesto quale dei
due esiti dicesse. Era il terzo: differenze vere.

Le due regole, finche' il controllo non distingue da solo lo stato "in
attesa":

1. **davanti a un rosso si legge quale dei tre esiti ha risposto** --
   *"mancano i segreti"*, *"non sono riuscito a leggere la produzione"*,
   *"non dicono la stessa cosa"* -- e sono tre cose diverse. "Non riguarda
   questo lavoro" non e' nessuna delle tre;
2. **dopo ogni migration applicata a mano si rilancia il controllo**
   (*Actions* → *Lo schema di produzione combacia con i file* → *Run
   workflow*). Lo fa il titolare: un agente riceve 403 sia sul lancio sia
   sulla riesecuzione.

**Una procedura senza il perche' si legge come una cortesia e si salta.** E'
la regola generale che esce dal caso qui sopra, e vale ben oltre le
migration.

Il passo *"rilancia il controllo"* **era gia' scritto** nella procedura di
`supabase/MIGRAZIONI.md`, punto 5, con lo stesso percorso di clic. Il
19/09/2026 non e' stato fatto lo stesso. La diagnosi sbagliata -- data qui,
in questo file, prima di andare a guardare -- e' stata *"quel passo non e'
scritto da nessuna parte"*, e la proposta che ne seguiva era di scriverlo.
Sarebbe stata **una seconda copia di una riga che gia' c'era**, e non avrebbe
cambiato niente.

Quello che mancava non era il passo: era **la ragione**. Un elenco numerato
dice cosa fare e non dice cosa succede se non lo fai, quindi l'ultimo punto
sembra sempre quello facoltativo -- la pulizia dopo il lavoro vero. Con
accanto *"finche' non lo rilanci, il rosso resta appeso anche se la
produzione e' gia' allineata"* non e' piu' pulizia: e' la differenza fra un
allarme spento e uno acceso su una cosa a posto.

**La conseguenza, ed e' la parte operativa: quando una procedura scritta
viene saltata, la risposta non e' riscriverla, e' capire cosa la rendeva
saltabile.** Le cause si somigliano tutte -- manca il perche', il passo sta
dopo la parola "fine", il costo di farlo e' immediato e il costo di non farlo
arriva dopo, oppure nessuno vede mai la conseguenza. Riscrivere piu' forte
("**importante**", "**non dimenticare**") e' la risposta istintiva ed e' la
meno efficace: alza il volume di una frase che gia' nessuno collegava a
niente.

E vale anche per chi la diagnosi la fa: **prima di dire che una cosa non e'
scritta, si apre il file.** Qui non e' stato fatto, e la raccomandazione che
ne e' uscita era costruita su una premessa falsa -- lo stesso difetto
descritto poco sopra, *"una frase non e' piu' vera perche' l'ha detta
qualcuno"*, applicato a se stessi.

**Il modulo che porta i clienti era la parte meno curata del sito.** E' la
lezione del 19/09/2026, e vale piu' dei due difetti che l'hanno prodotta.

Guardando le pagine pubbliche da un telefono, il punto peggiore di tutto il
marketplace e' risultato essere **l'unico che produce contatti veri**:

- chi inviava **non vedeva nessuna conferma**. Il messaggio nasceva in cima
  al riquadro, il bottone stava in fondo: su un telefono settecento pixel,
  piu' di una schermata. I campi si svuotavano e basta, quindi chi non
  vedeva niente **rimandava** -- e la concessionaria riceveva due contatti
  che sembrano due persone diverse;
- chi aveva la rete debole **restava bloccato per sempre**. Nessun
  `try/catch` intorno all'invio: la promessa veniva rifiutata, il bottone
  restava disabilitato con scritto "Invio in corso...", e si usciva solo
  ricaricando e ridigitando tutto.

Sono i due modi piu' stupidi di perdere un contatto, e succedevano **al
cento per cento degli invii**. Per giunta il modulo gemello della
registrazione -- che porta concessionari, non compratori -- aveva gia' tutte
e due le protezioni: `catch` con un messaggio utile, `autoComplete` sui
campi, l'errore che si cancella mentre correggi. La buona pratica esisteva
nel progetto e mancava proprio dove conta di piu'.

**La regola che ne esce:** il punto in cui il sito guadagna -- un modulo di
contatto, un carrello, un'iscrizione -- si guarda **per primo** e si prova
nelle condizioni peggiori, non in quelle buone: rete che cade, schermo
stretto, tastiera aperta. Un difetto li' non fa rumore e non lascia traccia:
non c'e' nessun errore da leggere, c'e' solo un cliente che non ha scritto.

**Le funzioni che oggi nessuno tocca sono quelle dove aspettarsi le
sorprese.** "Duplica" e' rimasto rotto **dieci giorni** (dal 06/09 al
16/09/2026) senza che nessuno se ne accorgesse. Non e' colpa di nessuno: e'
la conseguenza di non avere clienti. Nessuno lo usa, quindi nessuno lo
segnala, e un test che non c'era non poteva dirlo. Vale come promemoria per il
giorno del primo cliente vero: le funzioni che oggi non passano mai sotto un
clic -- duplicazione, foglio di consegna, perizie, importazione da file,
archivio documenti -- sono quelle da provare **prima** che le provi lui, e
per ognuna la prova migliore e' un test comportamentale che le chiami davvero.

**"Vuoto" non e' una prova: il criterio per cancellare e' che nessuna riga di
codice la usi.** I tre account in produzione sono **di prova**, creati dal
titolare, e non esiste ancora nessun cliente pagante. Quindi *"oggi non lo usa
nessuno"* non e' mai un argomento: **non c'e' nessuno che possa usarlo**. Una
tabella vuota oggi puo' essere un guscio mai costruito, oppure una cosa che
aspetta il primo cliente vero -- e le due si assomigliano moltissimo.

Vale per **tabelle, colonne, funzioni e trigger**. Prima di proporre una
cancellazione:

1. **si cerca in tutto il progetto** -- `src/`, `scripts/`, `.github/`,
   `supabase/`, test compresi -- chi la nomina, e si riporta **il risultato
   grezzo della ricerca**, non la conclusione. Chi legge deve poter vedere le
   righe trovate e giudicare da se';
2. **se il codice la usa ma e' vuota, NON si cancella**: si annota come "in
   attesa del primo cliente";
3. **se non la usa nessuno, si dice anche a cosa doveva servire**, cosi' il
   titolare decide se e' un disegno mai costruito o un disegno da costruire;
4. **nel dubbio non si cancella.** Ricreare una tabella e' facile; ricostruire
   un'idea persa no.

**Sono due domande diverse e si riportano separate.**

| la domanda | a cosa si risponde | cosa la risponde |
|---|---|---|
| **serve a qualcuno?** | se si cancella, qualcosa smette di funzionare | **la ricerca nel codice** |
| **si perdono dati?** | se si cancella, qualcosa sparisce per sempre | **il conteggio delle righe** |

Riportarle insieme, come se pesassero uguale, fa sembrare che due prove deboli
ne facciano una forte. Non e' cosi': **solo la prima autorizza a cancellare**,
la seconda dice se serve un travaso prima di farlo. Il 14/09/2026 le dieci
tabelle senza codice sono state raccontate con le due prove appaiate, ed era
un modo sbagliato di dirlo anche se la conclusione reggeva.

**Un passo obbligatorio della ricerca: controllare che nessuno usi `select *`.**
Se una sola interrogazione chiede tutte le colonne, cercare il nome di una
colonna non prova niente -- quella colonna arriva lo stesso a chi legge, e
toglierla puo' rompere qualcosa che non la nomina mai. Si guarda quindi ogni
`select` sulla tabella, non solo quelli che contengono il nome cercato. Il
15/09/2026 su `vehicle_images` sono stati controllati tutti e nove: nessuno usa
`*`, e nessuno chiede `updated_at`.

**E un `select *` che poi si riscrive copia anche cio' che non si puo'
scrivere.** Stesso costrutto, danno diverso: nelle ricerche rende inutile una
verifica, in una copia rompe l'inserimento. "Duplica" leggeva la scheda con
`select("*")` e la reinseriva intera: da quando `ricerca_testo` e' una colonna
**generata** (06/09/2026), Postgres rifiutava ogni copia -- *"cannot insert a
non-DEFAULT value into column ricerca_testo"* -- e portava con se' anche
targa, telaio, cliente e l'aggancio al sito dell'originale. Una copia dichiara
cosa **non** porta, in un posto solo (`src/lib/duplica-veicolo.ts`), e non
parte mai da "tutto".

**Difetti trovati leggendo il 18/09/2026, annotati e non corretti.** Sono
usciti preparando la fetta che mostra i dati, e nessuno si corregge dentro una
modifica che parla d'altro. In ordine di quanto gia' fanno danno:

1. **Lo zero riletto come vuoto nel conto economico** -- vedi il punto 4 qui
   sopra. E' un numero falso **gia' a video**, non un difetto latente: si
   prova su una riga vera e si corregge **subito dopo la fetta che mostra**.
2. **Il prezzo assente mostrato come "0 €"** sulla scheda del veicolo e in
   Gestione Veicoli (`formatCurrency(Number(vehicle.price ?? 0))`): un'auto
   senza prezzo dichiara zero euro. Anche questo e' gia' a video, e si
   corregge **dentro** la fetta che mostra, perche' mettergli accanto "dal tuo
   sito" lo trasformerebbe in un numero falso **firmato**.
3. **"Invia al cliente" e l'email rispondono in due modi allo stesso vuoto**:
   la finestra scrive "Su richiesta" per un prezzo assente, l'email scrive
   "-". "Su richiesta" e' per giunta una frase che il concessionario non ha
   detto.
4. **La "Completezza" della Salute veicolo conta un dato proposto** come se
   fosse acquisito (conta `registration_date` senza guardare se e'
   confermato). Va sistemata **quando esistera' la conferma**, non prima:
   oggi, senza un modo per confermare, escluderla farebbe scendere il
   punteggio di tutti senza che nessuno possa farci niente.

5. **Il tipo veicolo dice "dal tuo sito" e dal sito non arriva.**
   `payloadDatiVeicolo` scrive `vehicle_category: "Auto"` come **costante
   nostra**, ma passa dallo stesso giro degli altri campi e quindi il ripasso
   lo segna `sito`. Sulla scheda si legge "dal tuo sito · da confermare" su
   un valore che il sito non ha mai dichiarato: e' la provenienza sbagliata,
   in piccolo. Si corregge nel ripasso -- o lasciandolo senza segno, o dandogli
   la sua dicitura -- non replicandola altrove. Si puo' correggere quando si
   vuole: la migration del 18/09/2026 e il suo ritorno **non ci si
   appoggiano** (una prima versione lo faceva, ed e' stata rifatta proprio per
   questo: un ritorno che si rompe il giorno in cui si corregge un difetto e'
   una trappola con la miccia lunga).

E una nota sul guardiano dei nomi dei fornitori: cerca soltanto la parola
"Supabase". "MotorK" o "DealerK" in una dicitura non verrebbero fermati. La
forma resta "deciso dal tuo sito", per disciplina e non per guardiano.

**Un numero e la sua forma scritta non sono la stessa cosa.** Confrontare due
numeri **come stringhe** produce differenze che non esistono: il database
restituisce un prezzo come `"9500.00"`, il modulo lo rimanda come `9500`, e
`"9500.00" !== "9500"`. E' la stessa cifra.

Il 18/09/2026 quel confronto decideva due cose insieme: quali campi il
concessionario aveva davvero cambiato salvando una scheda, e se il sito era
in disaccordo con lui. Le schede si sarebbero riempite di disaccordi falsi su
prezzi **identici** -- *"il tuo sito ora dice 9.500 €, tu avevi scritto
9.500 €"* -- e nessuno avrebbe capito perche'.

**Il rovescio vale altrettanto, ed e' la parte che si sbaglia correggendo:**
per i campi di testo il confronto resta testuale. `GA123BC` e `GA123BD` sono
targhe davvero diverse, e un confronto che le "normalizzasse" a numero le
farebbe diventare la stessa cosa. La regola e' una sola riga: **si confronta
come numeri solo quando tutti e due i lati si leggono come numeri**, e il
vuoto non e' mai un numero.

**Come si e' trovata: lavorando su altro.** Non l'ha segnalata nessuno e
nessuna schermata la mostrava ancora. Le prossime si troveranno allo stesso
modo, quindi **vale la pena guardare i confronti anche dove nessuno si
lamenta**: un confronto sbagliato non fa rumore, fa dati sbagliati.

**Chi non conosce il valore in archivio non dichiara nessun disaccordo -- e
non ne cancella uno.** E' il principio generale, e vale per **qualsiasi**
confronto, non solo per i tre campi che l'hanno prodotto.

Il caso: il ripasso **proponeva** tre campi letti dal blocco ricco e ne
**rileggeva** dall'archivio soltanto ventidue. Per un campo che il
concessionario aveva scritto, il confronto era fra il valore del sito e il
**vuoto**: sempre diverso, quindi un disaccordo anche fra due date identiche.
Il vuoto li' non voleva dire "il concessionario non ha scritto niente",
voleva dire **"non ho guardato"**, ed e' la stessa distinzione fra `null` e
`0` che questo progetto ha gia' pagato.

Quindi: prima di dire che due valori sono diversi, si guarda se si ha
davvero il secondo. Non sapere non e' un disaccordo, e nemmeno un accordo:
il segno resta **com'era**.

**E il guardiano non elenca i nomi, controlla la regola.** Quello scritto per
questo difetto non dice "immatricolazione, regime IVA, data d'ingresso": dice
**"ogni campo che il blocco ricco propone deve essere anche riletto
dall'archivio"**. Un quarto campo aggiunto domani lo fa fallire da solo. Un
elenco si dimentica di aggiornare, una regola no -- ed e' la stessa
differenza fra `CAMPI_DAL_SITO` ricavato dal payload e un elenco scritto a
mano da qualche altra parte.

**Un controllo si dimentica, un campo che non arriva non si puo' scrivere.**
Quando una regola dice "questo dato non si tocca", non la si affida a chi
scrive: **non gli si consegna il dato protetto**. Chi sincronizza passa a
`scriviDalSito` cio' che il sito dichiara e riceve indietro **solo cio' che
puo' scrivere** -- i campi del concessionario non compaiono nel risultato,
quindi non c'e' niente da saltare e niente da dimenticare.

Non e' una questione di stile. Un controllo **dentro** chi scrive si aggira
aprendo una porta nuova che non lo fa: e' esattamente quello che e' successo al
tetto del piano, corretto in un posto e aggirato in **dodici**. Una funzione
che **non restituisce** il campo protetto non si aggira, perche' chi la usa non
ha in mano niente da scrivere. La regola sta in `src/lib/provenienza-dati.ts`.

**I due test servono a cose diverse, e servono tutti e due.** Il primo --
comportamentale -- dice che la funzione fa la cosa giusta. Il secondo -- sul
testo dei sorgenti -- dice che **nessuno puo' farla per conto suo**: nessun
file, fuori da quella funzione, scrive un campo protetto. Il difetto arrivera'
da una porta nuova, non da quella gia' scritta, e il primo test non la vedrebbe
mai.

Quando il secondo trova qualcosa che non si puo' correggere subito, il nome del
file si scrive in un **elenco esplicito** dentro il test, con il perche' e la
regola che quell'elenco puo' solo accorciarsi -- come
`SENZA_DATA_CONOSCIUTI` per le migration senza data. Un elenco di eccezioni che
cresce e' il modo in cui un controllo diventa rumore.

**E c'e' una categoria peggiore della sovrascrittura: il difetto che
cancella.** La regola "un dato del concessionario non si sovrascrive mai"
nasce da un difetto che **scrive il valore sbagliato**. Esiste un parente
stretto, e fa piu' danni: quello che **non scrive niente e cancella quello
che c'era**.

Il caso, 19/09/2026, ed e' il piu' serio dell'intera passata sullo zero e il
vuoto -- **e non lo stavamo cercando**. Nel conto economico un prezzo
d'acquisto pari a **zero** tornava dal database come casella vuota
(`scrivi()` aveva `valore !== 0`). Fin qui e' un messaggio sbagliato a video:
la scheda diceva "manca il prezzo di acquisto" su un prezzo che c'e'. Ma il
modulo salva quello che ha nelle caselle, e la casella vuota si rilegge
`null`: quindi **al primo salvataggio successivo -- di qualunque altro campo
-- lo zero nel database diventava `null`**. Il concessionario correggeva la
data di vendita e perdeva il prezzo d'acquisto, senza toccarlo e senza
saperlo.

Le due cose che rendono questa famiglia diversa da tutte le altre:

- **non lascia traccia.** Un valore sbagliato si puo' notare e correggere;
  un valore cancellato non si distingue da un valore mai scritto. Dopo il
  salvataggio nessuna schermata, nessun log e nessun controllo puo' piu'
  dire che quello zero c'era;
- **il danno cresce a ogni uso corretto del prodotto.** Non serve sbagliare
  niente: basta usare il modulo come si deve, e ogni salvataggio distrugge
  un dato in piu'.

**La domanda da farsi ogni volta che un modulo rilegge e riscrive un
archivio: cosa succede al dato che il modulo non sa rappresentare?** Se la
risposta e' "sparisce", non e' un difetto di visualizzazione travestito: e'
una perdita di dati, e va trattata come tale anche quando a video sembra
solo una frase sbagliata.

**Un dato che il sito dichiara e noi scartiamo senza lasciare traccia e'
indistinguibile da un dato che il sito non ha mai detto.** Vale oltre il caso
che l'ha prodotto: ogni volta che si sceglie di **non** usare
un'informazione arrivata, la scelta va registrata da qualche parte, altrimenti
fra sei mesi nessuno sapra' se quell'informazione non c'era o se c'era e
l'abbiamo buttata. Sul disaccordo fra sito e concessionario si scrive in
`origine_dati` sotto `il_sito_dice`, senza toccare il valore.

**Cio' che si scrive e non si mostra ancora va in
[SCRITTE_NON_MOSTRATE.md](SCRITTE_NON_MOSTRATE.md)**, nello stesso momento in
cui si scrive il codice che lo salva -- non dopo. Costruire prima il posto dove
mettere i dati e poi la schermata che li racconta e' l'ordine giusto, ma
lascia per un po' informazioni che il database ha e lo schermo no: quell'elenco
esiste perche' nessuna si perda per strada.

**Una scelta consapevole fra due cose giuste va scritta con la condizione
che la farebbe cambiare**, altrimenti fra sei mesi qualcuno la legge come un
errore e la "corregge".

Il caso, 19/09/2026, sulla descrizione della scheda auto pubblica. Il testo
si accorcia a cinque righe con "Mostra tutta la descrizione", e sta dentro
`<summary>` invece che nel corpo di `<details>`. Sembra sbagliato e non lo
e':

- **perche' cosi'**: `<summary>` si vede **sempre**, aperto o chiuso. Quello
  che cambia aprendo e' solo il taglio delle righe, che e' CSS. Il testo non
  finisce mai dentro una parte nascosta della pagina, e la descrizione e'
  anche cio' che porta le persone sulla scheda dai motori di ricerca. Nel
  corpo di `<details>` sarebbe indicizzata lo stesso, ma "lo stesso" e' una
  cosa che si crede, non che si verifica;
- **cosa costa**: un lettore di schermo annuncia il contenuto di `<summary>`
  come etichetta del comando che apre, quindi legge tutta la descrizione
  insieme a "Mostra tutta la descrizione". Chi usa quegli strumenti il testo
  lo riceve intero, ma in una forma meno pulita;
- **cosa la farebbe cambiare**: il giorno in cui si potesse verificare -- non
  supporre -- che il testo nel corpo di `<details>` vale quanto quello
  visibile per chi indicizza la pagina, allora il corpo e' il posto giusto e
  il costo sui lettori di schermo sparisce.

La forma vale oltre il caso: **perche' cosi', cosa costa, cosa la farebbe
cambiare**. Le prime due si scrivono sempre; e' la terza che impedisce a una
scelta di diventare un dogma.

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

**Ogni vista nasce con `security_invoker`, e un test lo pretende.** Una vista
in Postgres gira con i permessi di **chi l'ha creata**, non di chi la
interroga: le protezioni per riga delle tabelle che legge non si applicano.
Una vista e' quindi il modo piu' silenzioso di scavalcare l'isolamento fra
concessionarie -- non tocca nessuna politica, non rompe niente, e nessun
controllo diventa rosso. `with (security_invoker = on)` la fa girare con i
permessi di chi la chiama, e `current_dealer_id()` torna a valere.

La prima vista del progetto (`vetrina_per_concessionaria`, 19/09/2026) calcola
tre numeri pubblici e innocui; la vista che li calcola non sarebbe stata
innocua per niente. Il guardiano e'
`src/lib/viste-con-security-invoker.test.ts`, e riconosce anche il caso piu'
probabile: una vista con **un'altra** opzione fra parentesi e non quella.

Nota utile quando si e' tentati di evitare la vista: **i conteggi di PostgREST
su questo progetto sono spenti**. Chiedere `min(price)` o `count` dentro
l'interrogazione risponde `PGRST123: "Use of aggregate functions is not
allowed"`. E' una difesa voluta e non si tocca.

**Il punto in cui il sito guadagna si guarda per primo.** Questo progetto ha
due moduli da cui entra il denaro: la richiesta informazioni su un'auto (porta
i clienti alle concessionarie) e la richiesta di demo (porta le concessionarie
a noi). Tutto il resto -- le schede, la ricerca, la home -- serve a portare
qualcuno **fino a li'**.

Il 19/09/2026 quei due moduli erano la parte **meno curata** del sito
pubblico. Sul modulo della scheda auto: la conferma nasceva settecento pixel
sopra il bottone e non si vedeva, quindi si inviava due volte e la
concessionaria riceveva due persone dove ce n'era una; se cadeva la rete il
bottone restava su "Invio in corso..." per sempre; nessun campo diceva al
telefono cosa suggerire. Sul modulo della demo mancava la stessa protezione
sulla rete, e li' chi arriva in fondo ha anche caricato la visura camerale.

**La parte piu' utile della lezione e' dove quelle protezioni c'erano gia'.**
Il modulo gemello della registrazione -- stesso progetto, stesse mani -- aveva
il `try/catch` sulla rete **e** tutti e cinque gli `autoComplete`, dal primo
giorno. Non mancava la competenza: mancava di averla applicata **dove porta i
clienti**. Quando si cerca un difetto, la domanda non e' "sappiamo farlo?" ma
**"lo abbiamo fatto nel punto che conta?"** -- ed e' quasi sempre il punto che
nessuno di noi usa mai, perche' il modulo di contatto lo compila il cliente,
non chi costruisce.

**Il giro a mano sulle cinque pagine pubbliche.** Una volta al mese, e **prima
di ogni cliente nuovo**, le pagine pubbliche si aprono da un telefono vero e
si guardano una per una. Non e' un di piu': le pagine del gestionale chiedono
credenziali che un agente non ha, ma le pagine pubbliche no -- e sono quelle
che vede chi compra.

L'ordine non e' casuale, segue il punto in cui il sito guadagna:

1. **il modulo di contatto di una scheda auto** -- si compila davvero, fino
   alla conferma, e si guarda che la conferma si veda senza scorrere;
2. **la scheda auto** che lo contiene (dati tecnici, descrizione, foto);
3. **la pagina di una concessionaria** (i numeri in cima, i filtri);
4. **la ricerca** e le sue tendine;
5. **la home**.

Quello che un test non puo' vedere e per cui serve l'occhio: il contrasto di
un grigio su fondo scuro, un menu che non si chiude, una foto che non si
capisce, un bersaglio troppo piccolo per un pollice, una frase che suona
sbagliata. Quello che invece un test vede da solo sta in
`src/lib/pagine-pubbliche-si-guardano-da-sole.test.ts`: testo sotto i dodici
pixel, campi sotto i sedici (Safari su iPhone ingrandisce la pagina da solo e
non torna piu' indietro), campi email e telefono senza `autoComplete`, invii
senza `catch`, e numeri contati su un elenco che ha un tetto.

**Quattro di quei cinque controlli nascono con un debito**, scritto in un
elenco esplicito dentro il test con il perche'. E' voluto: il debito e' vero e
noto, e l'elenco **puo' solo accorciarsi**. Un controllo che non nasce perche'
oggi troverebbe qualcosa e' un controllo che non nascera' mai.

**Il blocco unico sull'usabilita', e quanto e' grande.** Il resto di quello
che si vede usando il prodotto non si fa a pezzi: si affronta in una volta
sola, perche' sono tutte cose che si giudicano con l'occhio e conviene averle
davanti insieme. Deciso il 19/09/2026. Cosa comprende, con le misure prese
quel giorno:

| cosa | quanto |
|---|---|
| testo sotto i dodici pixel | 6 punti, elencati in `pagine-pubbliche-si-guardano-da-sole.test.ts` |
| campi dei moduli a quattordici pixel (Safari ingrandisce la pagina) | 7 file, stesso elenco |
| **il trattino muto** (`?? "-"`) | **50 righe** |
| filtri, bersagli troppo piccoli per un pollice, contrasto, un menu che non si chiude | da misurare quando ci si arriva |

Il trattino muto merita una riga in piu', perche' il numero da solo
ingannerebbe: delle cinquanta, **2** stanno sulle pagine pubbliche, **19**
dentro **email che partono verso persone vere** (fra cui quella che la
concessionaria riceve a ogni contatto e quella che il concessionario manda al
cliente), **22** nelle schermate del gestionale e **7** nel pannello
amministrativo. Non e' quindi un lavoro "da telefono": e' la stessa regola --
*il trattino non va mai da solo, accanto si scrive perche' manca* -- sparsa
su quattro superfici diverse. Sta in questo blocco perche' si trova usando il
prodotto, non perche' riguardi lo schermo piccolo.

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
- [supabase/MIGRAZIONI.md](supabase/MIGRAZIONI.md) — come si applica una modifica al database, e in cima **da dove si riprende**: l'ordine dei lavori aperti, deciso dal titolare e non da ricostruire ogni volta
- `.github/instructions/` — regole valide per percorsi specifici

## Variabili d'ambiente

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`APP_BASE_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `CRON_SECRET`.

Le `NEXT_PUBLIC_*` sono visibili a chiunque apra il sito: non ci si mette mai
niente che debba restare riservato.
