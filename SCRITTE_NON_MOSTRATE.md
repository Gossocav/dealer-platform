# Cose scritte e non ancora mostrate

Informazioni che KeyAuto **salva nel database** e che **nessuna schermata
mostra ancora**. Non sono difetti: sono il risultato di costruire prima il
posto dove mettere i dati e poi la schermata che li racconta -- che e' l'ordine
giusto, perche' una schermata costruita prima direbbe "manca tutto" su ogni
scheda.

Questo elenco esiste perche' **nessuna di queste si perda per strada**: il
giorno che si costruisce la fetta che mostra i dati, si apre questo file e si
guarda cosa c'e' rimasto da mostrare.

**La regola per aggiungerne una:** si scrive qui **nello stesso momento** in
cui si scrive il codice che la salva, non dopo. E si toglie da qui solo quando
qualcosa a schermo la mostra davvero.

---

## `vehicles.origine_dati` -> `il_sito_dice`

**Dal 15/09/2026.** Quando il sito della concessionaria dichiara un valore
**diverso** da quello che il concessionario ha scritto a mano, il valore non si
tocca e il disaccordo si registra accanto:

```json
"entered_on": {
  "fonte": "dealer",
  "confermato_il": "2026-09-16",
  "il_sito_dice": { "valore": "2022-03-01", "visto_il": "2026-09-20" }
}
```

**Cosa dovra' mostrare la scheda:**

> Il tuo sito ora dice **03/2022**, tu avevi scritto **01/2022**.
> [ Adotta quello del sito ]   [ Tieni il mio ]

Non e' un errore e non si presenta come tale: il concessionario ha il libretto
in mano, il sito ha quello che qualcuno ci ha scritto dentro.

**Perche' si registra gia' adesso:** un dato che il sito dichiara e noi
scartiamo senza lasciare traccia e' indistinguibile da un dato che il sito non
ha mai detto. Aspettare la schermata vorrebbe dire perdere tutti i disaccordi
accumulati nel frattempo.

---

## La provenienza di ogni campo

**Dal 15/09/2026.** `vehicles.origine_dati` sa per ogni campo se il valore
arriva dal sito, se il fornitore l'ha dedotto, o se l'ha scritto il
concessionario -- e se lui l'ha confermato.

**Cosa dovra' mostrare la scheda:** la dicitura accanto a ogni valore, mai un
numero nudo.

```
Immatricolazione   01/2022        dal tuo sito · da confermare
Regime IVA         esposta 22%    dal tuo sito
In piazzale da     12.02.2026     deciso dal tuo sito · da confermare
Chilometri         118.000        dal tuo feed
Prezzo d'acquisto  14.500 €       scritto da te
```

La funzione che le scrive c'e' gia': `etichettaProvenienza` in
`src/lib/provenienza-dati.ts`. **Dal 16/09/2026** c'e' la quarta fonte,
`feed`, con la sua dicitura: un dato arrivato dal feed non viene "dal tuo
sito", e mostrarlo cosi' sarebbe peggio che non mostrare niente. Il disaccordo
si registra nella stessa chiave `il_sito_dice` anche per il feed: la scheda
dovra' scegliere la frase in base alla fonte ("il tuo feed ora dice").

*Da sistemare con la prossima migration:* il commento sulla colonna
`vehicles.origine_dati` elenca tre fonti; ora sono quattro. E' un commento,
non un vincolo: il database accetta gia' `feed`.

---

## `vehicles.vat_regime`

**Dal 15/09/2026.** Il regime IVA letto dal sito: `esposta`, `margine`, oppure
vuoto quando il sito non lo dice.

**Cosa dovra' mostrare:**

- sulla **scheda del gestionale**, con la sua dicitura di provenienza;
- sull'**annuncio pubblico**, accanto al prezzo -- "35.000 € + IVA" -- perche'
  per un compratore con partita IVA sono settemila euro di differenza. Il
  permesso pubblico c'e' gia' (`grant select (vat_regime) ... to anon`).

**Da sapere:** nemmeno la colonna che ha sostituito (`vat_exposed`) era mai
stata mostrata da nessuna parte. Non si sta riprendendo una cosa che si
vedeva: si sta costruendo per la prima volta.

**Una domanda da fare quando si guarderanno le schede di Autogepy da vicino
(18/09/2026).** Dopo tre giri del lettore, Autogepy ha il regime IVA su **5
auto su 122** rilette; Ponginibbi su 78 su 78. Letta una delle 117 senza: il
blocco ricco c'e' (343 campi) e il campo IVA **non c'e'**. Oggi resta vuoto,
che e' la risposta onesta. Ma se per quel fornitore "assente" volesse dire
*margine* -- e non "non dichiarato" -- sarebbero **117 auto** che potremmo
etichettare. Non si decide su un campione di una pagina: si decide guardando
le schede, e chiedendo al concessionario.

---

## `vehicle_acquisitions.entered_on` e la sua qualita'

**Dal 15/09/2026.** La data d'ingresso in piazzale, e se il sito la
**dichiara** o il suo fornitore l'ha **dedotta**.

**Cosa dovra' mostrare la scheda**, e sono due frasi diverse:

| | |
|---|---|
| dichiarata | "In piazzale da **214 giorni**" |
| dedotta | "In vetrina sul tuo sito da **88 giorni** -- la data d'ingresso vera non ce l'ho" |

Le due non si confondono mai: una dedotta e' un limite inferiore, non una
misura.

E su **tutti i piani**, non solo il Pro: oggi un concessionario Base non ha
nessun modo di sapere da quanto tempo ha un'auto in piazzale.

---

## Il prezzo: comanda quello che scrive il concessionario

**Dal 16/09/2026.** Il prezzo e' uno dei ventidue campi che il sito manda e
che la sincronizzazione **non riscrive piu'** se il concessionario l'ha
corretto a mano. Da quel momento, sul marketplace vale **il suo**; se il sito
cambia, il nuovo valore finisce in `il_sito_dice` e il suo non si tocca.

La conseguenza che nessuna schermata dice ancora: **il marketplace e il sito
della concessionaria possono mostrare due prezzi diversi** per la stessa
auto. Non e' un errore, e' voluto -- ma e' una sorpresa per chi non lo sa.

**Cosa dovra' mostrare la scheda**, ogni volta che il prezzo e' `dealer` e
`il_sito_dice` c'e':

> Prezzo **18.900 €** -- scritto da te.
> Il tuo sito ora dice **19.400 €**: sul marketplace vale il tuo.
> [ Adotta quello del sito ]   [ Tieni il mio ]

Vale per tutti i ventidue campi, ma sul prezzo e' l'unico posto dove la
differenza si vede da fuori, e per questo va detto per primo.

---

## Le due porte che scrivono senza dirlo

**Dal 16/09/2026.** La regola "un dato scritto dal concessionario non viene
sovrascritto" funziona solo se **chi scrive lo dichiara**: la scheda in
modifica lo fa (`segnaComeScrittoDalDealer`); la sincronizzazione, "Importa
dal sito" e le due porte del feed passano da `scriviDalSito`; la duplicazione
passa da `copiaDelVeicolo`. Due porte scrivono ancora su `vehicles` senza
dichiarare niente:

| porta | cosa scrive | cosa rischia |
|---|---|---|
| `src/components/vehicles/vehicles-import-page.tsx` | l'intera riga del file CSV/Excel | nessuna sovrascrittura (nessun sito rilegge quelle righe), ma la scheda non sapra' dire "scritto da te" |
| `src/components/vehicles/vehicle-delivery-sheet-page.tsx` | i campi scritti a mano nel foglio di consegna | non segnati come suoi |

Il 15/09 questo elenco diceva tre schermate diverse, ed erano tre falsi
allarmi: il guardiano guardava chi *nominava* un campo, non chi lo *scriveva*
su `vehicles`. Rifatto il 16/09 seguendo la catena da `.from("vehicles")` alla
scrittura: trovate cinque porte, e le due del feed chiuse lo stesso giorno
(fonte `feed`, anche `feed/route.ts` che nessuno chiama: e' raggiungibile con
una sessione valida e scrive con la chiave di servizio). L'elenco
`DA_COLLEGARE` in `src/lib/provenienza-dati.test.ts` le nomina con il
perche', puo' solo accorciarsi, e il test fallisce se ne compare una terza.

### La duplicazione: cosa faceva e cosa fa (16/09/2026)

Fino al 16/09 "Duplica" (`vehicles-management-page.tsx`, `select("*")`)
copiava ogni colonna tranne `id`, `created_at`, `updated_at`: la copia
portava con se' `import_source`, `import_source_id`, `origine_dati`,
`customer_id`, `plate` e `vin`. Da quel giorno passa da
`src/lib/duplica-veicolo.ts`, che quelle colonne le lascia all'originale e
segna ogni campo copiato come scritto dal concessionario. Cosa succedeva
prima, e perche' era urgente:

Se l'originale era un'auto **importata dal sito**:

1. **la copia resta agganciata alla pagina dell'originale.** La coda del
   ripasso (`sincronizza-siti/route.ts`) prende tutte le righe con quel
   `import_source`: le rilegge tutte e due dalla stessa pagina, e nella copia
   i campi che il concessionario **non ha corretto** seguono l'originale.
   Prima del 15/09 seguivano *tutti*: la copia modificata tornava uguale
   all'originale entro tre ore;
2. **quando l'originale sparisce dal sito, sparisce anche la copia.** La
   riconciliazione ragiona per `import_source_id`: se la copia era stata
   pubblicata, finisce *in revisione* e fuori dal marketplace
   (`campiVeicoloSparito`); se era in bozza, prende solo la data di
   sparizione;
3. **quando l'originale ricompare, la copia puo' salire in vetrina da sola.**
   `campiVeicoloRitrovato` la mette *in revisione* con `import_source`, e il
   tetto del piano (`tetto-del-piano.ts:75-76`) pubblica proprio quelle: sul
   marketplace compaiono due annunci della stessa pagina.

Per **qualunque** originale, importato o no:

4. **targa e telaio vengono copiati**, e nessun vincolo lo impedisce. Sono
   chiavi: con la stessa targa si segnano vendute tutte e due
   (`auto-da-chiudere.ts`) e i documenti delle due si mescolano
   (`archivio-documenti.ts`).

Il punto 4 e' quello che ha deciso l'urgenza (titolare, 16/09/2026): due
auto con la stessa targa e lo stesso telaio non sono un fastidio, sono un
dato sbagliato che si propaga, e contraddicevano il lavoro del giorno prima --
impedito di *scrivere* una targa finta, non di *duplicare* una vera. Le copie
gia' fatte prima del 16/09 non si correggono da sole: in produzione oggi non
ce ne sono (0 targhe ripetute nella stessa concessionaria).
