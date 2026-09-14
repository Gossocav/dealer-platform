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
Prezzo d'acquisto  14.500 €       scritto da te
```

La funzione che le scrive c'e' gia': `etichettaProvenienza` in
`src/lib/provenienza-dati.ts`.

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
