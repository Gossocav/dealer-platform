import { segnaComeScrittoDalDealer } from "@/lib/provenienza-dati";

/**
 * Cosa una copia **non** porta con se'.
 *
 * "Duplica" copiava ogni colonna (`select("*")`), e con quelle anche le cose
 * che identificano *quella* vettura e non il suo modello. Verificato sul
 * codice il 16/09/2026:
 *
 * - **targa e telaio**: due auto con la stessa targa non sono un fastidio,
 *   sono un dato sbagliato che si propaga -- si segnano vendute tutte e due,
 *   i documenti si mescolano, e la ricerca a pagamento si paga due volte per
 *   la stessa vettura. Il giorno prima si era impedito di *scrivere* una
 *   targa finta (`src/lib/targa.ts`), non di *duplicare* una vera;
 * - **l'aggancio al sito** (`import_*`): la copia restava legata alla scheda
 *   dell'originale, la sincronizzazione la rileggeva e la riscriveva, e
 *   quando l'originale spariva dal sito spariva anche lei;
 * - **la provenienza** (`origine_dati`): la copia e' un'auto a mano, e come
 *   ogni auto a mano i suoi campi sono del concessionario;
 * - **il cliente** (`customer_id`): e' chi ha comprato l'originale, non la
 *   copia;
 * - **il testo di ricerca**: lo ricostruisce il database.
 */
export const NON_SI_COPIANO = [
  "id",
  "created_at",
  "updated_at",
  "plate",
  "vin",
  "import_source",
  "import_source_id",
  "import_synced_at",
  "import_missing_since",
  "origine_dati",
  "customer_id",
  "ricerca_testo",
] as const;

/** Quello che non descrive l'auto ma la sua vita nel gestionale. */
const NON_SONO_DATI = new Set(["dealer_id", "status", "published"]);

/**
 * La riga da inserire per la copia di `origine`: in bozza, della
 * concessionaria indicata, senza le chiavi dell'originale, e con ogni campo
 * segnato come scritto dal concessionario -- e' lui che ha deciso di partire
 * da quei valori, e nessun sito o feed li rileggera'.
 */
export function copiaDelVeicolo(origine: Record<string, unknown>, dealerId: string) {
  const esclusi = new Set<string>(NON_SI_COPIANO);
  const campi: Record<string, unknown> = {};
  for (const [campo, valore] of Object.entries(origine)) {
    if (!esclusi.has(campo)) campi[campo] = valore;
  }
  return {
    ...campi,
    origine_dati: segnaComeScrittoDalDealer({}, Object.keys(campi).filter((campo) => !NON_SONO_DATI.has(campo))),
    dealer_id: dealerId,
    status: "draft",
    published: false,
  };
}
