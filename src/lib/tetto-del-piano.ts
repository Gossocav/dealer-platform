/**
 * Il tetto del piano: quali auto stanno in vetrina quando sono piu' di quante
 * il piano ne consente.
 *
 * **La regola** (decisa il 10/09/2026, caso Ponginibbi: piano Base da 50
 * auto, 81 sul sito):
 *
 * 1. il limite e' quello del piano in vigore, letto dal database
 *    (`resolve_dealer_listing_cap`): qui non c'e' nessun numero;
 * 2. vale sul **totale** delle auto pubblicate, comprese quelle inserite a
 *    mano dal concessionario;
 * 3. **prima le usate**, poi le altre (km 0, aziendali, nuove);
 * 4. a parita' di tipo, **prima quelle gia' pubblicate** -- cosi' la scelta
 *    non cambia a ogni sincronizzazione e le auto non compaiono e spariscono
 *    dal sito -- poi le piu' recenti;
 * 5. quando un'auto viene venduta o sparisce dal sito, il posto libero va
 *    alla prossima in quest'ordine; se il piano scende, le auto in eccesso
 *    escono nello stesso ordine, e le usate restano per ultime.
 *
 * **Una funzione sola**, usata dalla sincronizzazione notturna,
 * dall'importazione dal sito e dalla pubblicazione a mano nel gestionale.
 * Prima il tetto lo imponeva solo il database, rifiutando la prima auto di
 * troppo: quali cinquanta fossero entrate lo decideva l'ordine dell'indice
 * del sito, e le altre trentuno non entravano affatto.
 *
 * Le auto oltre il tetto restano nell'archivio, **in revisione** e non
 * pubblicate (`STATO_OLTRE_IL_TETTO`), con l'origine e senza data di
 * sparizione: e' cio' che le distingue da una bozza scelta dal concessionario
 * (che non si tocca) e da un'auto sparita dal sito (che ha la data). Da li'
 * salgono in vetrina da sole appena si libera un posto.
 */

export const STATO_OLTRE_IL_TETTO = "in_review";

export type RigaPerIlTetto = {
  id: string;
  vehicle_condition: string | null;
  status: string | null;
  published: boolean | null;
  created_at: string | null;
  import_source: string | null;
  import_missing_since: string | null;
};

export type PianoDelTetto = {
  /** Il limite applicato, o `null` se il piano non ne ha uno leggibile. */
  limite: number | null;
  /** Le auto che stanno in vetrina, in ordine di priorita'. */
  inVetrina: string[];
  /** Le candidate rimaste fuori, in ordine di priorita'. */
  escluse: string[];
  /** Fra le escluse, quelle che oggi sono pubblicate: vanno tolte. */
  daTogliere: string[];
  /** Fra quelle in vetrina, quelle che oggi non sono pubblicate: vanno pubblicate. */
  daPubblicare: string[];
};

export function eUsata(condizione: string | null | undefined): boolean {
  return String(condizione ?? "").trim().toLowerCase() === "usato";
}

export function ePubblicata(riga: Pick<RigaPerIlTetto, "status" | "published">): boolean {
  return riga.published === true && String(riga.status ?? "").toLowerCase() === "published";
}

/**
 * Chi concorre a un posto in vetrina: le auto pubblicate, di qualsiasi
 * origine, e le auto del sito messe da parte per il tetto. Una bozza scelta
 * dal concessionario non concorre: l'ha messa lui in bozza. Un'auto sparita
 * dal sito nemmeno: non e' piu' in vendita.
 */
export function candidataAllaVetrina(riga: RigaPerIlTetto): boolean {
  if (ePubblicata(riga)) return true;
  return (
    String(riga.status ?? "").toLowerCase() === STATO_OLTRE_IL_TETTO &&
    Boolean(riga.import_source) &&
    riga.import_missing_since === null
  );
}

function istante(valore: string | null): number {
  const t = valore ? Date.parse(valore) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Prima le usate; poi le gia' pubblicate; poi le piu' recenti; poi l'id, per non lasciare niente al caso. */
export function confrontaPriorita(a: RigaPerIlTetto, b: RigaPerIlTetto): number {
  const usata = Number(eUsata(b.vehicle_condition)) - Number(eUsata(a.vehicle_condition));
  if (usata !== 0) return usata;
  const pubblicata = Number(ePubblicata(b)) - Number(ePubblicata(a));
  if (pubblicata !== 0) return pubblicata;
  const recente = istante(b.created_at) - istante(a.created_at);
  if (recente !== 0) return recente;
  return a.id.localeCompare(b.id);
}

/**
 * Decide chi sta in vetrina. Con `limite` nullo il piano non ha un tetto
 * leggibile e non si tocca niente: tutte le candidate restano come sono.
 */
export function pianoDelTetto(righe: readonly RigaPerIlTetto[], limite: number | null): PianoDelTetto {
  const candidate = righe.filter(candidataAllaVetrina).sort(confrontaPriorita);

  if (limite === null || !Number.isFinite(limite) || limite < 0) {
    return { limite: null, inVetrina: candidate.map((r) => r.id), escluse: [], daTogliere: [], daPubblicare: [] };
  }

  const dentro = candidate.slice(0, limite);
  const fuori = candidate.slice(limite);

  return {
    limite,
    inVetrina: dentro.map((r) => r.id),
    escluse: fuori.map((r) => r.id),
    daTogliere: fuori.filter(ePubblicata).map((r) => r.id),
    daPubblicare: dentro.filter((r) => !ePubblicata(r)).map((r) => r.id),
  };
}

/** Come si presenta un'auto messa da parte per il tetto. */
export function campiOltreIlTetto(adesso: Date) {
  return { status: STATO_OLTRE_IL_TETTO, published: false, updated_at: adesso.toISOString() };
}

/** Come si presenta un'auto che sale in vetrina. */
export function campiInVetrina(adesso: Date) {
  return { status: "published", published: true, updated_at: adesso.toISOString() };
}

/**
 * Il messaggio per il concessionario. Solo quando c'e' qualcosa fuori: un
 * avviso che compare sempre e' un avviso che si smette di leggere.
 */
export function messaggioDelTetto(limite: number | null, escluse: number): string | null {
  if (limite === null || escluse <= 0) return null;
  const auto = escluse === 1 ? "1 auto del tuo sito non e' pubblicata" : `${escluse} auto del tuo sito non sono pubblicate`;
  return `Il tuo piano include ${limite} auto: ${auto}. Passa a un piano superiore per pubblicarle tutte.`;
}
