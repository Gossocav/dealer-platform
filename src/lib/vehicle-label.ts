/**
 * Marca, modello e versione scritti di fila senza ripetersi.
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
 * La versione ricavata da un titolo intero: quello che resta dopo aver tolto
 * marca e modello dalla testa.
 *
 * "Hyundai Tucson 1.6 CRDi Xline" con marca "Hyundai" e modello "Tucson"
 * diventa "1.6 CRDi Xline". Se il titolo non aggiunge niente -- e' solo marca
 * e modello -- non c'e' versione da scrivere e torna null, perche' un campo
 * vuoto e' piu' onesto di un doppione.
 */
export function derivaVersioneDalTitolo(
  titolo: string | null | undefined,
  marca: string | null | undefined,
  modello: string | null | undefined
): string | null {
  const testo = String(titolo ?? "").trim();
  if (!testo) return null;

  const brand = String(marca ?? "").trim();
  const model = String(modello ?? "").trim();
  const brandModel = [brand, model].filter(Boolean).join(" ");

  // Prima "Marca Modello" insieme, poi il solo modello: cosi' un titolo che
  // ripete entrambi perde entrambe le ripetizioni, non solo la prima.
  const versione = stripLeadingRepeat(stripLeadingRepeat(testo, brandModel), model);

  return versione || null;
}
