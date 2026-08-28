/**
 * Marca, modello e versione scritti di fila senza ripetersi e senza rumore.
 *
 * L'importazione da sito non trova la versione separata: trova un titolo
 * intero ("Hyundai Tucson 1.6 CRDi Xline") e marca e modello per conto loro.
 * Finche' il titolo finiva tal quale nel campo Versione, l'intestazione
 * dell'annuncio diceva due volte la stessa cosa -- "Hyundai Tucson Hyundai
 * Tucson" -- su ogni veicolo importato, non su qualcuno.
 *
 * Qui sta la regola sola, usata in due momenti diversi: quando si importa,
 * per non scrivere il doppione nel database; e quando si mostra, perche' i
 * veicoli gia' importati quel doppione ce l'hanno gia' dentro.
 */

/**
 * Toglie da un campo la ripetizione di quello che viene scritto subito prima.
 *
 * Solo in testa e solo a parola intera: la versione "Tucson" di un modello
 * "Tuc" non e' una ripetizione, e un allestimento che nomina il modello piu'
 * avanti resta come l'ha scritto il concessionario.
 *
 * **Il confronto e' volutamente letterale.** Ho provato a renderlo tollerante
 * -- trattini e punti ridotti a spazi, per far combaciare il modello scritto
 * come nell'indirizzo (`range-rover-evoque`) con il titolo per esteso -- e ha
 * rotto il caso opposto: "Mercedes-Benz Classe A" diventava "mercedes benz
 * classe a", la marca "Mercedes" ci combaciava in testa, e il modello usciva
 * mutilato in "Benz Classe A". Un test che c'era gia' l'ha fermato.
 *
 * La forma dell'indirizzo si sistema prima, con normalizzaModello, dove si
 * puo' distinguere uno slug da un nome che il trattino ce l'ha per davvero.
 */
export function stripLeadingRepeat(value: string, repeated: string): string {
  if (!value || !repeated) return value;

  const valueLower = value.toLowerCase();
  const repeatedLower = repeated.toLowerCase();

  if (valueLower === repeatedLower) return "";
  if (valueLower.startsWith(`${repeatedLower} `)) {
    return value.slice(repeated.length).trim();
  }

  return value;
}

/**
 * Il modello come si legge, non come sta in un indirizzo.
 *
 * Alcuni siti dichiarano il modello nei dati strutturati con la stessa forma
 * che usano nell'URL: `range-rover-evoque`, `classe-b`, `grand-cherokee`. Su
 * 235 veicoli in produzione erano 14, e comparivano cosi' com'erano nel
 * titolo dell'annuncio.
 *
 * Si interviene solo quando la forma e' inequivocabile -- tutto minuscolo,
 * nessuno spazio, almeno un trattino fra due parole -- perche' un modello che
 * il trattino ce l'ha per davvero, come "Classe-A", non va toccato.
 */
export function normalizzaModello(modello: string | null | undefined): string | null {
  const testo = String(modello ?? "").trim();
  if (!testo) return null;
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(testo)) return testo;
  return testo.split("-").join(" ");
}

/**
 * Il titolo di un annuncio senza le cose che il concessionario ha messo nel
 * titolo del suo sito per farsi trovare sul suo sito.
 *
 * Misurato in produzione il 28/08/2026, su 235 veicoli importati:
 *
 * - **231** finivano con l'anno, che sulla scheda sta gia' scritto per conto
 *   suo alla voce Immatricolazione;
 * - **11** portavano dentro una partita IVA di undici cifre;
 * - **14** il nome della concessionaria, a volte con la filiale
 *   ("AUTOGEPY SASSUOLO", "* SEDE DI CARPI *");
 * - **12** punti esclamativi ripetuti, virgolette o asterischi di richiamo
 *   ("KM0!!!!").
 *
 * Sul sito di origine hanno un senso: sono la stessa pagina che deve
 * posizionarsi per "autogepy sassuolo". Su KeyAuto no -- la concessionaria e'
 * gia' scritta accanto all'annuncio -- e occupano lo spazio del titolo, che
 * nei risultati di ricerca si ferma intorno ai sessanta caratteri.
 *
 * Non si toglie niente che sia un dato: cilindrata, allestimento, potenza e
 * numero di porte restano come sono stati scritti.
 */
export function ripulisciTitoloVeicolo(
  titolo: string | null | undefined,
  opzioni: { sorgente?: string | null } = {}
): string | null {
  let testo = String(titolo ?? "");
  if (!testo.trim()) return null;

  // Il nome della concessionaria si ricava dall'indirizzo del sito da cui la
  // scheda arriva: "www.autogepy.it" -> la parola "autogepy". E' l'unico modo
  // di conoscerlo senza andarlo a chiedere al database da dentro una funzione
  // che non lo interroga.
  const dominio = String(opzioni.sorgente ?? "").trim().toLowerCase();
  const nomeSorgente = dominio
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0];

  if (nomeSorgente.length >= 4) {
    testo = testo.replace(new RegExp(`\\b${nomeSorgente.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
  }

  testo = testo
    // La partita IVA, **con davanti le parole tutte maiuscole che la
    // accompagnano**: "AUTOGEPY SASSUOLO 05361881051" e' l'insegna piu' la
    // filiale piu' il numero, e vanno via insieme -- togliere solo le cifre
    // lascerebbe "Sassuolo" appeso in fondo al titolo.
    //
    // Ancorata alla partita IVA e non alle maiuscole da sole, ed e' una
    // distinzione che ho dovuto misurare: 66 titoli su 235 contengono parole
    // tutte maiuscole, e sono quasi tutte dati veri -- PHEV, MHEV, CRDI, AWD,
    // DCT, EDCT. Una regola che togliesse le maiuscole in quanto tali
    // svuoterebbe le schede invece di ripulirle.
    .replace(/(?:\s*\b[A-ZÀ-Ù][A-ZÀ-Ù'&.-]+\b)*\s*\b\d{11}\b/g, " ")
    // La filiale: "SEDE DI CARPI".
    .replace(/\bsede\s+di\s+[a-zà-ù']+/gi, " ")
    // I richiami tipografici. Le virgolette se ne vanno, le parole restano:
    // "TAGLIANDATA&GARANTITA 12 MESI" e' un'informazione, le virgolette no.
    .replace(/[!]{2,}/g, " ")
    .replace(/[*"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // L'anno in coda: sulla scheda c'e' gia' la riga Immatricolazione, e
    // ripeterlo nel titolo costa cinque caratteri su sessanta.
    .replace(/\s*\b(19|20)\d{2}\b\s*$/, "")
    // Quello che resta appeso dopo aver tolto un pezzo in mezzo.
    .replace(/\s*[-–,;:]\s*$/, "")
    .replace(/^\s*[-–,;:]\s*/, "")
    .trim();

  return testo || null;
}

/**
 * La versione ricavata da un titolo intero: quello che resta dopo aver tolto
 * marca, modello e rumore dalla testa.
 *
 * "Hyundai Tucson 1.6 CRDi Xline" con marca "Hyundai" e modello "Tucson"
 * diventa "1.6 CRDi Xline". Se il titolo non aggiunge niente -- e' solo marca
 * e modello -- non c'e' versione da scrivere e torna null, perche' un campo
 * vuoto e' piu' onesto di un doppione.
 */
export function derivaVersioneDalTitolo(
  titolo: string | null | undefined,
  marca: string | null | undefined,
  modello: string | null | undefined,
  opzioni: { sorgente?: string | null } = {}
): string | null {
  const pulito = ripulisciTitoloVeicolo(titolo, opzioni);
  if (!pulito) return null;

  const brand = String(marca ?? "").trim();
  const model = normalizzaModello(modello) ?? "";
  const brandModel = [brand, model].filter(Boolean).join(" ");

  // Prima "Marca Modello" insieme, poi il solo modello: cosi' un titolo che
  // ripete entrambi perde entrambe le ripetizioni, non solo la prima.
  const versione = stripLeadingRepeat(stripLeadingRepeat(pulito, brandModel), model);

  return versione || null;
}
