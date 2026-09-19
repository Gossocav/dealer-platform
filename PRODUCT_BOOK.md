# PRODUCT BOOK

## Nome progetto
Marketplace Concessionari (nome provvisorio)

---

# Visione

Realizzare la piattaforma italiana di riferimento per la pubblicazione e la gestione dei veicoli usati delle concessionarie.

La piattaforma sarà composta da:

- Marketplace pubblico
- Area riservata concessionari
- Pannello Super Admin

---

# Obiettivo

Consentire alle concessionarie di pubblicare e gestire il proprio parco auto da un unico pannello.

Il software rimane di proprietà del fondatore.

Le concessionarie pagano un abbonamento mensile.

---

# MVP Versione 1

## Area Pubblica

- Homepage
- Ricerca veicoli
- Scheda veicolo
- Contatto concessionaria — **dichiarato qui, mai costruito** (vedi sotto)

### Contatto concessionaria: la voce che manca (19/09/2026)

E' scritta qui sopra dal principio, e **non esiste**. La pagina di una
concessionaria oggi non ha nessun modo per contattarla: telefono ed email
finiscono solo nei dati strutturati per Google, a schermo non compaiono, e
gli unici collegamenti portano al catalogo. Chi arriva su quella pagina ha in
mente **un venditore, non un'automobile**: se non trova un pulsante se ne va.

Non e' un dettaglio grafico, e' una mancanza di prodotto. La decisione del
titolare (19/09/2026): **telefono e WhatsApp in evidenza**, piu' un modulo
"contatta la concessionaria" uguale a quello della scheda auto ma senza
vettura, cosi' il contatto entra comunque nel gestionale e non si perde la
tracciatura.

**Due cose da sapere prima di costruirlo**, verificate il 19/09/2026:

1. **Il modulo non esiste in forma riusabile.** Quello che c'e' --
   `src/app/(marketplace)/auto/[id]/request-information-form.tsx`, 204 righe --
   vive dentro la rotta del veicolo e prende `vehicleId` e `vehicleLabel`
   come dati obbligatori: li manda all'endpoint, li mostra nell'intestazione
   e li usa per la misurazione. Serve tirarne fuori la parte comune, non
   copiarlo: due moduli di contatto che divergono sono peggio di uno solo.
2. **Il database rifiuta un contatto senza automobile**, e lo fa in modo
   asimmetrico. `enforce_lead_dealer_id()` dice, testualmente: se l'origine
   e' `marketplace` e `vehicle_id` e' vuoto -> *"vehicle_id obbligatorio per
   lead marketplace"*. Ma con **un'origine diversa il trigger non entra
   nemmeno in azione**, quindi il contatto viene salvato con la
   concessionaria vuota e **non lo vede nessuno** -- il difetto dei contatti
   orfani gia' descritto in [AGENTS.md](AGENTS.md).

   Quindi le due strade sbagliate sono entrambe pronte: una rifiuta, l'altra
   perde in silenzio. La strada giusta e' **estendere il trigger alla nuova
   origine** -- se `source = 'concessionaria'` allora `dealer_id` e'
   obbligatorio -- cosi' la regola sta nel database e non nella memoria di
   chi scrive il modulo. E la colonna `leads.vehicle_id` e' gia' facoltativa
   (non e' fra le obbligatorie), quindi non serve toccarla.

   *La lettura del trigger viene dai file della migration del 14/09/2026, che
   il titolare ha applicato. Il testo della funzione che gira davvero non e'
   verificabile da qui: prima di costruire, si rilegge dall'editor SQL.*

## Area Concessionario

- Login
- Dashboard
- Inserimento veicolo
- Gestione veicoli
- Gestione lead
- Profilo concessionaria

## Area Admin

- Gestione concessionarie
- Gestione utenti
- Gestione abbonamenti
- Dashboard statistiche

---

# Regole del progetto

1. Il software è multi-concessionario (multi-tenant).
2. Ogni concessionaria vede solo i propri dati.
3. Tutto il codice appartiene al proprietario della piattaforma.
4. Ogni nuova funzione deve aiutare il concessionario a vendere più veicoli o lavorare più velocemente.
5. Prima si aggiorna il Product Book, poi si sviluppa il codice.
