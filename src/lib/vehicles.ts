import {
  evaluateVehicleStateTransition,
  getVehicleStateLabel,
  resolveVehicleLifecycleState,
  type VehicleLifecycleState,
  type VehiclePermission,
} from "@/lib/vehicle-state-machine";

export type VehicleStatus = VehicleLifecycleState | string;

export const VEHICLE_TRACTION_OPTIONS = ["Anteriore", "Posteriore", "Integrale 4x4"] as const;
export type VehicleTraction = (typeof VEHICLE_TRACTION_OPTIONS)[number];

// Questi elenchi vivevano scritti a mano dentro il modulo di inserimento, ma
// ora anche l'importazione ci scrive sopra (valori predefiniti): tenerli in un
// posto solo evita la trappola gia' vista con le carrozzerie, dove una voce
// aggiunta da una parte sola produceva veicoli impossibili da filtrare.
export const VEHICLE_FUEL_OPTIONS = [
  "Benzina",
  "Diesel",
  "GPL",
  "Metano",
  "Elettrica",
  "Elettrica/Benzina (Ibrida)",
  "Elettrica/Diesel (Ibrida)",
  "Idrogeno",
  "Etanolo",
  "Altro",
] as const;

export const VEHICLE_TRANSMISSION_OPTIONS = ["Automatico", "Manuale"] as const;

export type VehicleImageRow = {
  id: string;
  image_url: string | null;
  position: number | null;
  is_cover: boolean | null;
};

export type VehicleRow = {
  id: string;
  dealer_id: string | null;
  /** Il collegamento al video YouTube dell'automobile. Solo Piano Elite. */
  video_url?: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  interior_type?: string | null;
  engine_size?: string | number | null;
  power_kw?: number | null;
  power_cv?: number | null;
  doors?: number | null;
  registration_date?: string | null;
  registration_month?: string | null;
  year: string | number | null;
  mileage: number | null;
  fuel: string | null;
  transmission: string | null;
  traction?: string | null;
  price: string | number | null;
  status: string | null;
  published: boolean | null;
  // Colonne ancora in tabella ma non piu' compilate: la posizione di un
  // veicolo e' quella della concessionaria.
  city?: string | null;
  province?: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Da quando la sorgente non dichiara piu' questo veicolo. Vuoto: c'e' ancora. */
  import_missing_since?: string | null;
  vehicle_images?: VehicleImageRow[] | null;
};

export type VehicleListItem = {
  id: string;
  brand: string;
  model: string;
  version: string;
  registration: string;
  priceValue: number;
  priceLabel: string;
  status: VehicleStatus;
  statusLabel: string;
  badge: string;
  fuel: string;
  transmission: string;
  /** Gia' formattati per essere letti: "29.870 km", oppure "-". */
  mileageLabel: string;
  mainImageUrl: string | null;
  leadCount: number;
  insertedAt: string;
  raw: VehicleRow;
};

export type VehicleFilters = {
  query: string;
  brand: string;
  model: string;
  fuel: string;
  transmission: string;
  status: string;
  priceBand: string;
};

export type VehicleSortField = "created_at" | "brand" | "model" | "year" | "price" | "status" | "mileage";

export type VehicleSortState = {
  field: VehicleSortField;
  direction: "asc" | "desc";
};

/**
 * Gli ordinamenti offerti nella tendina "Ordina per".
 *
 * Prima l'ordine si cambiava solo cliccando le intestazioni della tabella, e
 * la vista a schede -- che e' quella predefinita -- non permetteva di
 * ordinare affatto. I chilometri non erano ordinabili da nessuna parte.
 *
 * Sono coppie campo+verso perche' "prezzo" da solo non dice niente: chi
 * cerca l'auto piu' economica e chi cerca la piu' cara chiedono due cose
 * diverse, e devono poterle chiedere con un gesto solo.
 */
export const VEHICLE_SORT_OPTIONS = [
  { value: "created_at:desc", label: "Inserimento (piu recenti)" },
  { value: "created_at:asc", label: "Inserimento (piu vecchi)" },
  { value: "price:asc", label: "Prezzo crescente" },
  { value: "price:desc", label: "Prezzo decrescente" },
  { value: "mileage:asc", label: "Chilometri crescenti" },
  { value: "mileage:desc", label: "Chilometri decrescenti" },
  { value: "year:desc", label: "Immatricolazione piu recente" },
  { value: "year:asc", label: "Immatricolazione piu vecchia" },
] as const satisfies ReadonlyArray<{ value: string; label: string }>;

export function vehicleSortToValue(sort: VehicleSortState) {
  return `${sort.field}:${sort.direction}`;
}

/**
 * Un ordinamento scelto cliccando un'intestazione della tabella puo' non
 * corrispondere a nessuna voce della tendina (marca, stato): in quel caso la
 * tendina non mostra una voce a caso, resta sul valore che le viene passato e
 * il chiamante decide cosa farne.
 */
export function vehicleSortFromValue(value: string): VehicleSortState | null {
  const [campo, verso] = String(value ?? "").split(":");
  const campiAmmessi: VehicleSortField[] = ["created_at", "brand", "model", "year", "price", "status", "mileage"];

  if (!campiAmmessi.includes(campo as VehicleSortField)) return null;
  if (verso !== "asc" && verso !== "desc") return null;

  return { field: campo as VehicleSortField, direction: verso };
}

export type VehicleKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
};

type VehicleStateTransitionValidation = {
  allowed: boolean;
  fromState: VehicleLifecycleState;
  toState: VehicleLifecycleState;
  nextStatus: VehicleLifecycleState;
  nextPublished: boolean;
  message: string | null;
};

const CRUD_STATE_MACHINE_PERMISSIONS: ReadonlyArray<VehiclePermission> = [
  "vehicle.state.update",
  "vehicle.publish",
  "vehicle.reserve",
  "vehicle.negotiate",
  "vehicle.sell",
  "vehicle.deliver",
  "vehicle.archive",
];

export const defaultVehicleFilters: VehicleFilters = {
  query: "",
  brand: "all",
  model: "all",
  fuel: "all",
  transmission: "all",
  status: "all",
  priceBand: "all",
};

// Quanti filtri restringono davvero l'elenco. La barra mostrava un'etichetta
// "Filtri attivi" scritta in duro, sempre accesa anche a filtri vuoti: diceva
// una cosa falsa a chi la leggeva. Il conteggio si fa qui, non nella barra,
// perche' e' una regola sui dati e va provata chiamandola.
export function countActiveVehicleFilters(filters: VehicleFilters): number {
  return (Object.keys(defaultVehicleFilters) as Array<keyof VehicleFilters>).filter((campo) => {
    const valore = filters[campo];
    // La ricerca fatta di soli spazi non restringe niente.
    if (campo === "query") return valore.trim().length > 0;
    return valore !== defaultVehicleFilters[campo];
  }).length;
}

export const statusOptions = [
  { value: "all", label: "Tutti gli stati" },
  { value: "published", label: "Pubblicato" },
  { value: "draft", label: "Bozza" },
  { value: "sold", label: "Venduto" },
  { value: "review", label: "In revisione" },
] as const;

export const priceBandOptions = [
  { value: "all", label: "Tutti i prezzi" },
  { value: "0-20000", label: "Fino a EUR 20.000" },
  { value: "20001-30000", label: "EUR 20.001 - EUR 30.000" },
  { value: "30001-40000", label: "EUR 30.001 - EUR 40.000" },
  { value: "40001-plus", label: "Oltre EUR 40.000" },
] as const;

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * I chilometri, scritti come si leggono.
 *
 * Zero e' un valore vero -- una km 0 ha zero chilometri -- e va distinto da
 * "non lo so", che si scrive con un trattino.
 */
export function formatMileage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";

  const numero = Number(value);
  if (!Number.isFinite(numero) || numero < 0) return "-";

  return `${new Intl.NumberFormat("it-IT").format(Math.round(numero))} km`;
}

export function parsePrice(value: string | number | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatVehicleStatus(status: string | null | undefined, published?: boolean | null): string {
  return getVehicleStateLabel(resolveVehicleLifecycleState(status, published));
}

export function normalizeVehicleStatus(status: string | null | undefined, published?: boolean | null): VehicleStatus {
  return resolveVehicleLifecycleState(status, published);
}

function toVehiclePublishedFlag(state: VehicleLifecycleState) {
  return state === "published";
}

export function validateVehicleStatusTransitionForCrud(params: {
  fromStatus: string | null | undefined;
  fromPublished?: boolean | null;
  toStatus: string | null | undefined;
  toPublished?: boolean | null;
}): VehicleStateTransitionValidation {
  const fromState = resolveVehicleLifecycleState(params.fromStatus, params.fromPublished ?? null);
  const toState = resolveVehicleLifecycleState(params.toStatus, params.toPublished ?? null);

  if (fromState === toState) {
    return {
      allowed: true,
      fromState,
      toState,
      nextStatus: toState,
      nextPublished: toVehiclePublishedFlag(toState),
      message: null,
    };
  }

  const evaluation = evaluateVehicleStateTransition(fromState, toState, CRUD_STATE_MACHINE_PERMISSIONS);
  if (!evaluation.allowed) {
    return {
      allowed: false,
      fromState,
      toState,
      nextStatus: toState,
      nextPublished: toVehiclePublishedFlag(toState),
      message: `Transizione stato non consentita: ${getVehicleStateLabel(fromState)} -> ${getVehicleStateLabel(toState)}.`,
    };
  }

  return {
    allowed: true,
    fromState,
    toState,
    nextStatus: toState,
    nextPublished: toVehiclePublishedFlag(toState),
    message: null,
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("it-IT");
}

export function safeText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "-";
}

// "Anno" non e' un dato a se': l'editor lo ricava sempre dalla data di
// immatricolazione, quindi mostrarli affiancati significa dire due volte lo
// stesso fatto. La piattaforma espone una sola voce, l'immatricolazione.
//
// Le importazioni pero' scrivono spesso il solo anno, senza giorno ne' mese
// (vehicle-import mappa "immatricolazione" su year): in quel caso l'anno e'
// l'unica immatricolazione conosciuta e viene mostrato da solo, invece di
// lasciare il campo vuoto su meta' del parco auto importato.
export function formatRegistrationLabel(input: {
  registration_date?: string | null;
  registration_month?: string | number | null;
  year?: string | number | null;
}): string | null {
  const rawDate = String(input.registration_date ?? "").trim();

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("it-IT");
    }
    return rawDate;
  }

  const rawYear = String(input.year ?? "").trim();
  if (rawYear.length === 0) {
    return null;
  }

  /**
   * Le vetture importate dai siti delle concessionarie non hanno una data
   * piena: il sito scrive "Immatricolazione 09/2018", il giorno non lo dice
   * nessuno. Si mostra quello che si sa -- "09/2018" -- invece di completarlo
   * con un primo del mese che nessuno ha mai dichiarato.
   *
   * Un mese fuori da 1-12 si ignora e resta il solo anno: e' un dato letto da
   * una pagina altrui, e un "13" mostrato come mese sarebbe peggio del mese
   * assente.
   */
  const mese = Number(String(input.registration_month ?? "").trim());
  if (Number.isInteger(mese) && mese >= 1 && mese <= 12) {
    return `${String(mese).padStart(2, "0")}/${rawYear}`;
  }

  return rawYear;
}

/**
 * Cosa scrivere in "registration_date" e "year" salvando il modulo del
 * gestionale.
 *
 * L'anno si ricava dalla data, cosi' i due valori non possono disallinearsi.
 * Ma il modulo ha un solo campo, la data piena, e le automobili importate dai
 * siti delle concessionarie **non ce l'hanno**: portano soltanto mese e anno,
 * perche' il giorno non lo dichiara nessuno.
 *
 * Prima di questa funzione, salvare la modifica di una di quelle vetture
 * scriveva "anno: vuoto" -- e l'immatricolazione spariva dalla scheda e dagli
 * annunci. Cioe' aprire un veicolo importato e premere Salva ne cancellava un
 * dato vero. Riguardava 232 automobili su 234.
 *
 * Quindi: se la data c'e' comanda lei; se non c'e', l'anno gia' in archivio
 * resta dov'e'.
 */
export function campiImmatricolazioneDaModulo(input: {
  registrationDate: string;
  annoInArchivio?: string | number | null;
}): { registration_date: string | null; year: string | number | null } {
  const data = String(input.registrationDate ?? "").trim();

  if (data) {
    return { registration_date: data, year: data.slice(0, 4) };
  }

  const anno = String(input.annoInArchivio ?? "").trim();
  return { registration_date: null, year: anno ? input.annoInArchivio ?? null : null };
}

export function normalizeVehicleTraction(value: unknown): VehicleTraction | null {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("integrale") || normalized.includes("4x4") || normalized.includes("4wd") || normalized.includes("awd")) {
    return "Integrale 4x4";
  }

  if (normalized.includes("anteriore") || normalized.includes("fwd") || normalized.includes("front wheel")) {
    return "Anteriore";
  }

  if (normalized.includes("posteriore") || normalized.includes("rwd") || normalized.includes("rear wheel")) {
    return "Posteriore";
  }

  return null;
}

/**
 * Una foto che non vive nel nostro archivio.
 *
 * E' il caso delle auto importate dal sito della concessionaria: in
 * `vehicle_images` resta l'indirizzo del listino di partenza
 * (`https://cdn.esterno.it/...`), non un percorso dell'archivio. In produzione
 * sono la quasi totalita' delle foto.
 *
 * Vanno distinte perche' non si possono firmare, e perche' il browser non le
 * caricherebbe comunque: le regole di sicurezza della pagina ammettono solo
 * immagini nostre (`img-src 'self'`). Si mostrano passando dal proxy.
 *
 * Il controllo legge il nome dell'host invece di cercare ".supabase.co" dentro
 * la stringa: un indirizzo esterno che avesse quel testo nel percorso
 * ingannerebbe la ricerca ingenua.
 */
export function isExternalVehicleImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const { hostname } = new URL(value);
    return hostname !== "supabase.co" && !hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/** L'indirizzo con cui il browser puo' chiedere una foto che sta fuori. */
export function vehicleImageProxyUrl(value: string) {
  return `/api/image-proxy?url=${encodeURIComponent(value)}`;
}

/**
 * Da cosa e' salvato in `vehicle_images.image_url` a come si mostra.
 *
 * Tre esiti soli, e vanno tenuti distinti:
 * - `proxy`: la foto sta su un sito esterno, si chiede al nostro proxy;
 * - `storage`: e' roba nostra, va firmata prima di poterla mostrare;
 * - `nessuna`: non c'e' niente da mostrare.
 *
 * Sta qui e non dentro le pagine perche' le pagine erano due e la regola era
 * scritta due volte, in modo diverso: l'elenco veicoli le foto importate le
 * mostrava, l'editor no -- ed e' il difetto per cui aprendo un veicolo in
 * modifica il riquadro delle foto restava vuoto.
 *
 * La firma non avviene qui: richiede il client di Supabase, che nell'editor e'
 * quello dell'utente collegato. Qui si decide soltanto, e la decisione si puo'
 * provare senza database.
 */
export type VehicleImageSource =
  | { kind: "proxy"; url: string }
  | { kind: "storage"; path: string }
  | { kind: "nessuna" };

export function resolveVehicleImageSource(rawValue: string | null | undefined): VehicleImageSource {
  const value = String(rawValue ?? "").trim();

  if (!value) {
    return { kind: "nessuna" };
  }

  if (isExternalVehicleImageUrl(value)) {
    return { kind: "proxy", url: vehicleImageProxyUrl(value) };
  }

  const path = extractVehicleImagePath(value);
  return path ? { kind: "storage", path } : { kind: "nessuna" };
}

export function extractVehicleImagePath(value: string) {
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const publicPrefix = "/storage/v1/object/public/vehicle-images/";
      const signedPrefix = "/storage/v1/object/sign/vehicle-images/";

      if (parsed.pathname.includes(publicPrefix)) {
        const path = parsed.pathname.split(publicPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      if (parsed.pathname.includes(signedPrefix)) {
        const path = parsed.pathname.split(signedPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      return value;
    } catch {
      return value;
    }
  }

  return value.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
}

export function resolveCoverImage(images: VehicleImageRow[] | null | undefined): string | null {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  const sorted = [...images].sort((a, b) => {
    const aCover = a.is_cover ? 1 : 0;
    const bCover = b.is_cover ? 1 : 0;
    if (aCover !== bCover) return bCover - aCover;

    const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
    const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
    return aPosition - bPosition;
  });

  for (const image of sorted) {
    const cover = String(image.image_url ?? "").trim();
    if (cover) {
      return cover;
    }
  }

  return null;
}

export function applyPriceBandFilters(
  minMax: { minPrice: number | null; maxPrice: number | null },
  priceBand: string
): { minPrice: number | null; maxPrice: number | null } {
  if (priceBand === "0-20000") return { minPrice: 0, maxPrice: 20000 };
  if (priceBand === "20001-30000") return { minPrice: 20001, maxPrice: 30000 };
  if (priceBand === "30001-40000") return { minPrice: 30001, maxPrice: 40000 };
  if (priceBand === "40001-plus") return { minPrice: 40001, maxPrice: null };
  return minMax;
}
