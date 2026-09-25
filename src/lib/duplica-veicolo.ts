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

/**
 * Le foto della copia: ognuna sua, mai il file dell'originale.
 *
 * **Il difetto che chiude, verificato il 25/09/2026 sul codice e sullo schema
 * ricostruito.** "Duplica" scriveva le foto della copia prendendo
 * dall'originale soltanto `image_url`. Finche' le foto stanno su DealerK non
 * cambia niente: la copia eredita un indirizzo esterno, come l'originale. Ma
 * una foto nel nostro archivio ha un percorso con dentro **l'id dell'auto**
 * (`<utente o concessionaria>/<id dell'auto>/<file>`), e il proxy decide se
 * mostrarla guardando quell'auto (`fotoDiUnAnnuncioPubblico`). La copia
 * ereditava quindi tre dipendenze dall'originale, nessuna visibile:
 *
 * - **venduto o tolto dalla vetrina l'originale, le foto della copia
 *   pubblicata rispondevano "non trovata"** -- e duplicare un'auto venduta per
 *   pubblicarne una uguale e' l'uso normale del pulsante;
 * - il file era uno solo: togliere la foto dalla copia, nell'editor, cancellava
 *   il file dell'originale;
 * - la riga non aveva origine e aveva un percorso nostro: il programma di
 *   copia non l'avrebbe mai guardata.
 *
 * Valeva gia' per le foto caricate a mano; la copia delle foto da DealerK
 * (`supabase/MIGRAZIONI.md`, "Le foto stanno su un server non nostro") lo
 * avrebbe esteso a quasi tutte. E il database non lo avrebbe fermato: la riga
 * della copia nasce senza esito, e i vincoli guardano solo le foto "copiate".
 *
 * La regola: **una foto nostra si copia sotto l'id della copia**, nella
 * cartella dell'utente che duplica -- e' l'unica in cui le regole
 * dell'archivio gli lasciano scrivere, e il proxy legge l'id dell'auto dal
 * secondo pezzo del percorso, non dal primo. Una foto esterna si riscrive con
 * la sua origine, e la copia nel nostro archivio la fa il programma.
 */

/** La foto dell'originale, come si legge da `vehicle_images`. */
export type FotoDaDuplicare = {
  image_url: string;
  position: number | null;
  is_cover: boolean | null;
  origine_url?: string | null;
  copia_esito?: string | null;
  copia_sha256?: string | null;
  copia_byte?: number | null;
};

/** La riga che la copia scrive in `vehicle_images`. */
export type RigaFotoDellaCopia = {
  vehicle_id: string;
  dealer_id: string;
  image_url: string;
  position: number;
  is_cover: boolean;
  origine_url?: string;
  copia_esito?: "copiata";
  copia_sha256?: string;
  copia_byte?: number;
};

export type PassoFotoDellaCopia =
  /** Una foto esterna: si scrive la riga, con la sua origine. */
  | { tipo: "riga"; riga: RigaFotoDellaCopia }
  /** Una foto nostra: prima si copia il file, poi si scrive la riga. */
  | { tipo: "copia-file"; da: string; a: string; riga: RigaFotoDellaCopia }
  /**
   * Una foto che non si sa copiare senza condividere il file dell'originale.
   * Si salta e si dice: condividerla e' esattamente il difetto chiuso qui.
   */
  | { tipo: "non-copiabile"; motivo: string };

const INDIRIZZO_COMPLETO = /^https?:\/\//i;
const ARCHIVIO_SUPABASE = /^https?:\/\/[^/]*supabase\.co\//i;
const NOSTRO_SITO = /^https?:\/\/([^/]*\.)?keyauto\.it\//i;
const PREFISSI_ARCHIVIO = ["/storage/v1/object/public/vehicle-images/", "/storage/v1/object/sign/vehicle-images/"];

/** Il percorso nel nostro archivio di un indirizzo completo di Supabase, o null. */
function percorsoDaIndirizzoSupabase(indirizzo: string): string | null {
  try {
    const { pathname } = new URL(indirizzo);
    for (const prefisso of PREFISSI_ARCHIVIO) {
      if (pathname.includes(prefisso)) return decodeURIComponent(pathname.split(prefisso)[1] ?? "") || null;
    }
  } catch {
    return null;
  }
  return null;
}

function nomeDelFile(percorso: string) {
  const nome = percorso.split("/").filter(Boolean).pop() ?? "foto.jpg";
  return nome.replace(/\s+/g, "-");
}

export function pianoFotoDellaCopia(
  foto: readonly FotoDaDuplicare[],
  opzioni: { idCopia: string; idUtente: string; dealerId: string },
): PassoFotoDellaCopia[] {
  return foto.map((originale, indice) => {
    const base = {
      vehicle_id: opzioni.idCopia,
      dealer_id: opzioni.dealerId,
      position: typeof originale.position === "number" ? originale.position : indice,
      // Come prima: la copertina resta alla prima foto, se lo era.
      is_cover: Boolean(originale.is_cover) && indice === 0,
    };
    const indirizzo = String(originale.image_url ?? "").trim();

    if (INDIRIZZO_COMPLETO.test(indirizzo) && !ARCHIVIO_SUPABASE.test(indirizzo) && !NOSTRO_SITO.test(indirizzo)) {
      // Esterna: si riscrive con la sua origine, e senza esito. Anche se
      // l'originale l'aveva data per morta o esaurita: la copia e' un'auto
      // nuova, e il programma la riprova da capo.
      return {
        tipo: "riga",
        riga: { ...base, image_url: indirizzo, origine_url: String(originale.origine_url ?? "").trim() || indirizzo },
      };
    }

    const da = ARCHIVIO_SUPABASE.test(indirizzo)
      ? percorsoDaIndirizzoSupabase(indirizzo)
      : INDIRIZZO_COMPLETO.test(indirizzo)
        ? null
        : indirizzo.replace(/^\/+/, "").replace(/^vehicle-images\//, "");

    if (!da) {
      return { tipo: "non-copiabile", motivo: `indirizzo che non e' un percorso del nostro archivio: ${indirizzo || "(vuoto)"}` };
    }

    // L'indice nel nome tiene distinte due foto con lo stesso nome di file.
    const a = `${opzioni.idUtente}/${opzioni.idCopia}/${indice}-${nomeDelFile(da)}`;
    const copiata =
      originale.copia_esito === "copiata" && originale.origine_url && originale.copia_sha256 && originale.copia_byte
        ? {
            origine_url: originale.origine_url,
            copia_esito: "copiata" as const,
            copia_sha256: originale.copia_sha256,
            copia_byte: originale.copia_byte,
          }
        : {};

    return { tipo: "copia-file", da, a, riga: { ...base, image_url: a, ...copiata } };
  });
}
