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

## Le tre porte che scrivono senza dirlo

**Dal 16/09/2026.** La regola "un dato scritto dal concessionario non viene
sovrascritto" funziona solo se **chi scrive lo dichiara**: la scheda in
modifica lo fa (`segnaComeScrittoDalDealer`); la sincronizzazione, "Importa
dal sito" e le due porte del feed passano da `scriviDalSito`. Tre porte
scrivono ancora su `vehicles` senza dichiarare niente:

| porta | cosa scrive | cosa rischia |
|---|---|---|
| `src/components/vehicles/vehicles-import-page.tsx` | l'intera riga del file CSV/Excel | nessuna sovrascrittura (nessun sito rilegge quelle righe), ma la scheda non sapra' dire "scritto da te" |
| `src/components/vehicles/vehicle-delivery-sheet-page.tsx` | i campi scritti a mano nel foglio di consegna | non segnati come suoi |
| `src/components/vehicles/vehicles-management-page.tsx` | la **duplicazione** copia tutte le colonne (`select *`), compresi `import_source_id` e la provenienza | la copia resta agganciata alla scheda del sito: la sincronizzazione la rilegge e la riscrive come l'originale |

Il 15/09 questo elenco diceva tre schermate diverse, ed erano tre falsi
allarmi: il guardiano guardava chi *nominava* un campo, non chi lo *scriveva*
su `vehicles`. Rifatto il 16/09 seguendo la catena da `.from("vehicles")` alla
scrittura: trovate cinque porte, e le due del feed chiuse lo stesso giorno
(fonte `feed`, anche `feed/route.ts` che nessuno chiama: e' raggiungibile con
una sessione valida e scrive con la chiave di servizio). L'elenco
`DA_COLLEGARE` in `src/lib/provenienza-dati.test.ts` le nomina con il
perche', puo' solo accorciarsi, e il test fallisce se ne compare una quarta.

**Da fare per prima**: la duplicazione, decisione del 16/09/2026 -- due auto
con la stessa targa e lo stesso telaio sono un dato sbagliato che si propaga,
e contraddicono il lavoro sulle targhe finte: impedito di *scrivere* una targa
finta, non di *duplicare* una targa vera.

### Cosa succede oggi a chi duplica un'auto (verificato sul codice, 16/09/2026)

La duplicazione (`vehicles-management-page.tsx`, `select("*")`) copia ogni
colonna tranne `id`, `created_at`, `updated_at`, e mette la copia in bozza.
Quindi la copia porta con se' anche `import_source`, `import_source_id`,
`origine_dati`, `plate` e `vin`.

Se l'originale e' un'auto **importata dal sito**:

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

**Quanto e' urgente:** oggi poco -- tre account di prova, e serve che qualcuno
duplichi un'auto importata. Ma i punti 1-3 sono silenziosi, e il 4 ha lo
stesso peso di una targa sbagliata. La correzione e' piccola: la copia non
deve portare `import_source`, `import_source_id`, `import_synced_at`,
`import_missing_since`, `origine_dati`, `plate`, `vin`.
