import * as XLSX from "xlsx";
import { canonicalizeVehicleColorLabel } from "@/lib/vehicle-colors";
import { VEHICLE_BODY_TYPES, type VehicleBodyType } from "@/lib/vehicle-body-types";
import {
  normalizeVehicleTraction,
  VEHICLE_FUEL_OPTIONS,
  VEHICLE_TRACTION_OPTIONS,
  VEHICLE_TRANSMISSION_OPTIONS,
} from "@/lib/vehicles";

// Same cap enforced in the manual upload UI (vehicle-editor-page.tsx): a feed
// is untrusted input, so without this a malformed row could list hundreds of
// image URLs for one vehicle and the detail page would try to resolve every
// one of them on load.
export const MAX_VEHICLE_IMAGES = 20;

export type VehicleImportField =
  | "vin"
  | "brand"
  | "model"
  | "version"
  | "vehicleCategory"
  | "vehicleCondition"
  | "bodyType"
  | "registrationDate"
  | "year"
  | "engineSize"
  | "powerKw"
  | "powerCv"
  | "doors"
  | "seats"
  | "emissionClass"
  | "interiorType"
  | "warranty"
  | "equipment"
  | "price"
  | "mileage"
  | "fuel"
  | "traction"
  | "transmission"
  | "color"
  | "description"
  | "status"
  | "images";

export type VehicleImportStatus = "draft" | "published";

export type VehicleImportColumnMapping = Record<VehicleImportField, string | null>;

export type VehicleImportRawRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type VehicleImportMappedRow = Record<VehicleImportField, string>;

const FIELDS: VehicleImportField[] = [
  "vin",
  "brand",
  "model",
  "version",
  "registrationDate",
  "year",
  "price",
  "mileage",
  "fuel",
  "traction",
  "transmission",
  "color",
  "description",
  "status",
  "images",
  // In coda: chi arriva dopo prende solo le colonne che nessun campo storico
  // ha rivendicato. Senza questo, "Classe Euro" rischiava di rubare una
  // colonna "Prezzo Euro" prima che il prezzo la vedesse.
  "vehicleCategory",
  "vehicleCondition",
  "bodyType",
  "engineSize",
  "powerKw",
  "powerCv",
  "doors",
  "seats",
  "emissionClass",
  "interiorType",
  "warranty",
  "equipment",
];

// Headers are normalized by normalizeKey (lowercased, accents and every
// non-alphanumeric stripped) before matching, and a header matches if it
// contains an alias or an alias contains it. So "Col. Esterno" already reaches
// "col esterno", and "Anno Immatricolazione" already reaches "immatricolazione"
// -- only genuinely different words need listing here.
//
// Keep aliases specific: a short one can be swallowed by the containment match
// and hijack an unrelated column.
const ALIASES: Record<VehicleImportField, string[]> = {
  vin: ["vin", "telaio", "numero telaio", "chassis", "numero di telaio"],
  brand: ["brand", "marca", "costruttore", "manufacturer", "make", "marchio"],
  model: ["model", "modello"],
  // "trim" and "variante" are what English portals and some management systems
  // call the version.
  version: ["version", "versione", "allestimento", "trim", "variante"],
  vehicleCategory: ["tipo veicolo", "tipologia veicolo", "categoria veicolo", "vehicle type", "vehicle category"],
  // "condizione" da solo verrebbe inghiottito dal confronto per contenimento e
  // finirebbe su colonne come "condizioni di vendita": meglio i termini interi.
  vehicleCondition: ["condizioni", "condizione veicolo", "stato veicolo", "usato nuovo", "condition", "vehicle condition"],
  bodyType: ["carrozzeria", "body", "body type", "bodystyle", "body style", "tipo carrozzeria", "segmento"],
  // Tenuto separato da "year": molti listini hanno entrambe le colonne, e la
  // data e' il dato buono -- l'anno da solo e' il ripiego.
  registrationDate: ["data immatricolazione", "data prima immatricolazione", "registration date", "first registration date", "immatricolata il", "data imm"],
  // Portals commonly export the year as a registration date field.
  year: ["year", "anno", "immatricolazione", "first registration", "immatricolato", "anno modello"],
  price: ["price", "prezzo", "listino", "importo"],
  mileage: [
    "mileage",
    "chilometri",
    "chilometro",
    "chilometraggio",
    "kilometri",
    "kilometers",
    "km",
    "percorrenza",
    "odometer",
    "odometro",
  ],
  // Niente "cc": e' dentro "Accessori", che finiva nella cilindrata.
  engineSize: ["cilindrata", "engine size", "displacement", "cm3"],
  // Niente "potenza kw": contiene "potenza", e una colonna chiamata solo
  // "Potenza" -- che in Italia sono i CV -- finiva nei kW.
  powerKw: ["kw"],
  powerCv: ["cv", "potenza cv", "cavalli", "hp", "horsepower", "potenza"],
  doors: ["porte", "numero porte", "doors", "n porte"],
  // Niente "posti a sedere": contiene "sede", e una colonna "Sede" finiva qui.
  // "posti" da solo aggancia comunque "Posti a sedere", per contenimento.
  seats: ["posti", "numero posti", "seats", "n posti"],
  emissionClass: ["classe euro", "euro", "emission class", "classe emissioni", "normativa"],
  interiorType: ["interni", "interior", "tipo interni", "rivestimento", "upholstery"],
  warranty: ["garanzia", "warranty"],
  equipment: ["dotazioni", "optional", "accessori", "equipment", "features", "allestimenti"],
  fuel: ["fuel", "alimentazione", "carburante", "combustibile"],
  traction: ["traction", "trazione", "trazione motrice", "drivetrain", "drive", "awd", "fwd", "rwd", "4x4"],
  // "gear" alone covers gearbox and gear_type once punctuation is stripped.
  transmission: ["transmission", "cambio", "gear", "gearbox", "gear type", "trasmissione"],
  color: [
    "color",
    "colour",
    "colore",
    "col esterno",
    "col. esterno",
    "exterior color",
    "exterior colour",
    "colore esterno",
    // Niente "colore carrozzeria": contiene "carrozzeria", e si prendeva quella
    // colonna prima che la carrozzeria la vedesse. "colore" aggancia comunque
    // "Colore carrozzeria", per contenimento.
    "tinta",
  ],
  description: ["description", "descrizione", "note", "commento", "dettagli", "annotazioni"],
  status: ["status", "stato", "pubblicazione"],
  images: [
    "photo",
    "photos",
    "image",
    "images",
    "image_url",
    "image_urls",
    "foto",
    "url foto",
    "url immagini",
    "immagini",
    "gallery",
    "galleria",
  ],
};

function normalizeKey(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function sanitizeCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function isRowCompletelyEmpty(values: Record<string, string>) {
  return Object.values(values).every((value) => String(value).trim().length === 0);
}

export function getVehicleImportFields() {
  return FIELDS;
}

export function getVehicleImportFieldLabel(field: VehicleImportField) {
  const labels: Record<VehicleImportField, string> = {
    vin: "VIN",
    brand: "Marca",
    model: "Modello",
    version: "Versione",
    vehicleCategory: "Tipo veicolo",
    vehicleCondition: "Condizioni",
    bodyType: "Carrozzeria",
    registrationDate: "Data immatricolazione",
    year: "Anno",
    engineSize: "Cilindrata",
    powerKw: "Potenza kW",
    powerCv: "Potenza CV",
    doors: "Porte",
    seats: "Posti",
    emissionClass: "Classe Euro",
    interiorType: "Interni",
    warranty: "Garanzia",
    equipment: "Dotazioni",
    price: "Prezzo",
    mileage: "Chilometri",
    fuel: "Alimentazione",
    traction: "Trazione",
    transmission: "Cambio",
    color: "Colore",
    description: "Descrizione",
    status: "Stato",
    images: "Immagini",
  };

  return labels[field];
}

export function createEmptyVehicleImportMapping(): VehicleImportColumnMapping {
  return {
    vin: null,
    brand: null,
    model: null,
    version: null,
    vehicleCategory: null,
    vehicleCondition: null,
    bodyType: null,
    registrationDate: null,
    year: null,
    engineSize: null,
    powerKw: null,
    powerCv: null,
    doors: null,
    seats: null,
    emissionClass: null,
    interiorType: null,
    warranty: null,
    equipment: null,
    price: null,
    mileage: null,
    fuel: null,
    traction: null,
    transmission: null,
    color: null,
    description: null,
    status: null,
    images: null,
  };
}

export function buildInitialVehicleImportMapping(headers: string[]): VehicleImportColumnMapping {
  const mapping = createEmptyVehicleImportMapping();
  const usedHeaders = new Set<string>();
  const normalizedHeaders = headers
    .map((header) => ({
      original: header,
      normalized: normalizeKey(header),
    }))
    .filter((entry) => entry.normalized.length > 0);

  const matchHeaderForAliases = (aliases: string[]) => {
    const normalizedAliases = aliases.map(normalizeKey).filter((alias) => alias.length > 0);

    for (const alias of normalizedAliases) {
      const exactMatch = normalizedHeaders.find((entry) => entry.normalized === alias && !usedHeaders.has(entry.original));
      if (exactMatch) {
        return exactMatch.original;
      }
    }

    for (const alias of normalizedAliases) {
      if (alias.length < 2) {
        continue;
      }

      const fuzzyMatch = normalizedHeaders.find(
        (entry) =>
          !usedHeaders.has(entry.original) &&
          (entry.normalized.includes(alias) || alias.includes(entry.normalized)),
      );

      if (fuzzyMatch) {
        return fuzzyMatch.original;
      }
    }

    return null;
  };

  for (const field of FIELDS) {
    const header = matchHeaderForAliases(ALIASES[field]);
    if (header) {
      mapping[field] = header;
      usedHeaders.add(header);
    }
  }

  return mapping;
}

export async function parseVehicleImportFile(file: File): Promise<{ headers: string[]; rows: VehicleImportRawRow[] }> {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["csv", "xlsx", "xls"].includes(extension)) {
    throw new Error("Formato file non supportato. Usa CSV, XLSX o XLS.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("File senza fogli leggibili.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("Il file non contiene dati.");
  }

  const headers = (matrix[0] ?? [])
    .map((value) => sanitizeCellValue(value))
    .map((header) => header.replace(/\uFEFF/g, ""))
    .filter((header) => header.length > 0);

  if (headers.length === 0) {
    throw new Error("Intestazioni non valide. Inserisci una prima riga con i nomi colonna.");
  }

  const rows: VehicleImportRawRow[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const valuesByHeader: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      valuesByHeader[headers[j]] = sanitizeCellValue((matrix[i] ?? [])[j]);
    }

    if (isRowCompletelyEmpty(valuesByHeader)) {
      continue;
    }

    rows.push({
      rowNumber: i + 1,
      values: valuesByHeader,
    });
  }

  return { headers, rows };
}

export function mapVehicleImportRow(row: VehicleImportRawRow, mapping: VehicleImportColumnMapping): VehicleImportMappedRow {
  const mapped = {} as VehicleImportMappedRow;

  for (const field of FIELDS) {
    const header = mapping[field];
    mapped[field] = header ? sanitizeCellValue(row.values[header]) : "";
  }

  return mapped;
}

export function validateVehicleImportRow(mappedRow: VehicleImportMappedRow) {
  const errors: string[] = [];

  if (!mappedRow.brand.trim()) {
    errors.push("Marca obbligatoria");
  }

  if (!mappedRow.model.trim()) {
    errors.push("Modello obbligatorio");
  }

  if (mappedRow.year.trim()) {
    const yearValue = Number(mappedRow.year);
    if (!Number.isFinite(yearValue)) {
      errors.push("Anno non numerico");
    }
  }

  if (mappedRow.price.trim()) {
    const priceValue = Number(mappedRow.price.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(priceValue)) {
      errors.push("Prezzo non numerico");
    }
  }

  if (mappedRow.mileage.trim()) {
    const mileageValue = Number(mappedRow.mileage.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(mileageValue)) {
      errors.push("Chilometri non numerici");
    }
  }

  if (mappedRow.traction.trim() && !normalizeVehicleTraction(mappedRow.traction)) {
    errors.push("Trazione non riconosciuta");
  }

  return errors;
}

export function extractVehicleImageUrls(values: Record<string, string>) {
  const imageAliases = ALIASES.images.map(normalizeKey);
  const collected: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = normalizeKey(key);
    if (!imageAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias) || alias.includes(normalizedKey))) {
      continue;
    }

    const raw = String(value ?? "").trim();
    if (!raw) {
      continue;
    }

    const chunks = raw
      .split(/\r?\n|,|;|\|/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      const normalizedUrl = chunk.replace(/^"|"$/g, "").trim();
      if (/^https?:\/\//i.test(normalizedUrl)) {
        collected.push(normalizedUrl);
      }
    }
  }

  return Array.from(new Set(collected)).slice(0, MAX_VEHICLE_IMAGES);
}

function parseOptionalNumber(value: string) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\./g, "").replace(",", ".");
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeStatus(value: string, defaultStatus: VehicleImportStatus): "draft" | "published" | "sold" | "review" {
  const normalized = normalizeKey(value);

  if (["published", "pubblicato", "online", "attivo"].includes(normalized)) {
    return "published";
  }

  if (["sold", "venduto", "chiuso"].includes(normalized)) {
    return "sold";
  }

  if (["review", "revisione", "inrevisione"].includes(normalized)) {
    return "review";
  }

  if (["draft", "bozza"].includes(normalized)) {
    return "draft";
  }

  return defaultStatus;
}


// I filtri della ricerca pubblica confrontano per uguaglianza esatta
// (.eq("vehicle_condition", "Usato")): un file che scrive "usato" minuscolo, o
// "KM 0", non corrisponderebbe a niente. Mappare la colonna non basta, il
// valore va ricondotto a quello che la piattaforma usa davvero.
//
// Un valore che non si riconosce resta vuoto invece di essere salvato com'e':
// un testo estraneo nella colonna non comparirebbe comunque nei filtri, e in
// piu' il modulo di modifica non saprebbe mostrarlo, cancellandolo al primo
// salvataggio.

const CONDITION_BY_ALIAS: Record<string, string> = {
  nuovo: "Nuovo", nuova: "Nuovo", nuovi: "Nuovo", nuove: "Nuovo", new: "Nuovo",
  usato: "Usato", usata: "Usato", usati: "Usato", usate: "Usato", used: "Usato",
  secondhand: "Usato", dioccasione: "Usato", occasione: "Usato",
  aziendale: "Aziendale", aziendali: "Aziendale", company: "Aziendale",
  demo: "Aziendale", exdemo: "Aziendale", vetturaaziendale: "Aziendale",
  km0: "Km/0", "0km": "Km/0", kmzero: "Km/0", zerokm: "Km/0",
  chilometrizero: "Km/0", kilometrizero: "Km/0", nuovokm0: "Km/0",
};

const CATEGORY_BY_ALIAS: Record<string, string> = {
  auto: "Auto", autovettura: "Auto", autovetture: "Auto", vettura: "Auto", car: "Auto", automobile: "Auto",
  veicolocommerciale: "Veicolo commerciale", veicolicommerciali: "Veicolo commerciale",
  commerciale: "Veicolo commerciale", autocarro: "Veicolo commerciale",
  lcv: "Veicolo commerciale", commercialvehicle: "Veicolo commerciale",
};

// Tipizzata sulle carrozzerie vere e non su "string": se un domani una voce
// dell'elenco cambia nome, i sinonimi che puntano a quella vecchia diventano
// un errore di compilazione invece di scrivere in silenzio una carrozzeria
// che non esiste piu'.
const BODY_TYPE_BY_ALIAS: Record<string, VehicleBodyType> = {
  suv: "SUV/Pick-up/Fuoristrada", pickup: "SUV/Pick-up/Fuoristrada", fuoristrada: "SUV/Pick-up/Fuoristrada",
  offroad: "SUV/Pick-up/Fuoristrada", crossover: "SUV/Pick-up/Fuoristrada",
  berlina: "Berlina", sedan: "Berlina", limousine: "Berlina", saloon: "Berlina",
  // Come le scrivono i siti delle concessionarie, misurato su autogepy.it e
  // delorenziauto.it: "Berlina due volumi", "Furgone - Van", "Furgoni/Van".
  berlinaduevolumi: "Berlina", berlinatrevolumi: "Berlina",
  berlina2volumi: "Berlina", berlina3volumi: "Berlina",
  stationwagon: "Station Wagon", sw: "Station Wagon", familiare: "Station Wagon", wagon: "Station Wagon",
  break: "Station Wagon", estate: "Station Wagon", touring: "Station Wagon",
  citycar: "City Car", utilitaria: "City Car", cittadina: "City Car", compatta: "City Car",
  monovolume: "Monovolume", mpv: "Monovolume", minivan: "Monovolume", multispazio: "Monovolume",
  coupe: "Coupé", coupa: "Coupé",
  cabrio: "Cabrio", cabriolet: "Cabrio", convertible: "Cabrio", spider: "Cabrio", spyder: "Cabrio", roadster: "Cabrio",
  furgone: "Furgone/Van", van: "Furgone/Van", furgonato: "Furgone/Van", panelvan: "Furgone/Van",
  furgonevan: "Furgone/Van", furgonivan: "Furgone/Van", furgoncino: "Furgone/Van",
};

function canonicalizeFromAliases(value: string, table: Record<string, string>, allowed: readonly string[]) {
  const key = normalizeKey(value);
  if (!key) return null;

  // Prima il valore gia' corretto: "SUV/Pick-up/Fuoristrada" normalizzato e'
  // "suvpickupfuoristrada", che nella tabella dei sinonimi non c'e'.
  const exact = allowed.find((option) => normalizeKey(option) === key);
  if (exact) return exact;

  return table[key] ?? null;
}

export const VEHICLE_CONDITION_VALUES = ["Nuovo", "Usato", "Aziendale", "Km/0"] as const;
export const VEHICLE_CATEGORY_VALUES = ["Auto", "Veicolo commerciale"] as const;

export function canonicalizeVehicleCondition(value: string) {
  return canonicalizeFromAliases(value, CONDITION_BY_ALIAS, VEHICLE_CONDITION_VALUES);
}

export function canonicalizeVehicleCategory(value: string) {
  return canonicalizeFromAliases(value, CATEGORY_BY_ALIAS, VEHICLE_CATEGORY_VALUES);
}

export function canonicalizeVehicleBodyType(value: string) {
  return canonicalizeFromAliases(value, BODY_TYPE_BY_ALIAS, VEHICLE_BODY_TYPES);
}

/**
 * Data di immatricolazione dai formati che compaiono davvero nei listini.
 * Restituisce la data in formato ISO, che e' come la salva il modulo manuale.
 *
 * Il solo anno resta deliberatamente senza data: inventare "1 gennaio"
 * fabbricherebbe una precisione che il file non ha. In quel caso vale il
 * ripiego sull'anno, gia' previsto in tutta la piattaforma.
 */
export function parseImportRegistrationDate(value: string): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return buildIsoDate(iso[1], iso[2], iso[3]);

  const italian = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (italian) return buildIsoDate(italian[3], italian[2], italian[1]);

  // "03/2019": mese e anno, senza giorno. Il giorno diventa il primo del mese,
  // che e' la convenzione dei portali per l'immatricolazione.
  const monthYear = text.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (monthYear) return buildIsoDate(monthYear[2], monthYear[1], "1");

  const yearMonth = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (yearMonth) return buildIsoDate(yearMonth[1], yearMonth[2], "1");

  return null;
}

function buildIsoDate(year: string, month: string, day: string) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || y < 1900 || y > 2100) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractYear(value: string) {
  const match = String(value ?? "").match(/\b(19|20)\d{2}\b/);
  if (!match) return null;

  const year = Number(match[0]);
  return year >= 1900 && year <= 2100 ? year : null;
}

function parseOptionalCount(value: string, max: number) {
  const parsed = parseOptionalNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) return null;

  const rounded = Math.round(parsed);
  return rounded > 0 && rounded <= max ? rounded : null;
}

// Le dotazioni arrivano come elenco in una cella sola, separate come capita.
export function parseImportEquipment(value: string): string[] {
  const items = String(value ?? "")
    .split(/[,;|\n\r]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const unique: string[] = [];
  for (const item of items) {
    if (!unique.some((existing) => normalizeKey(existing) === normalizeKey(item))) {
      unique.push(item);
    }
  }

  // Come per le foto: un file malformato potrebbe elencarne centinaia.
  return unique.slice(0, 80);
}

/**
 * I campi per cui si puo' dichiarare un valore valido per tutto il file.
 *
 * Sono solo quelli con un elenco chiuso di valori: un listino di soli usati
 * senza colonna "condizioni" oggi produce annunci invisibili al filtro, e il
 * concessionario non ha modo di dirlo una volta sola. Campi liberi come la
 * descrizione restano fuori: ripetere lo stesso testo su ogni annuncio non e'
 * un dato mancante, e' rumore.
 */
export const VEHICLE_IMPORT_DEFAULT_FIELDS = [
  "vehicleCondition",
  "vehicleCategory",
  "bodyType",
  "fuel",
  "transmission",
  "traction",
] as const;

export type VehicleImportDefaultField = (typeof VEHICLE_IMPORT_DEFAULT_FIELDS)[number];

export type VehicleImportDefaults = Partial<Record<VehicleImportDefaultField, string>>;

const DEFAULT_FIELD_OPTIONS: Record<VehicleImportDefaultField, readonly string[]> = {
  vehicleCondition: VEHICLE_CONDITION_VALUES,
  vehicleCategory: VEHICLE_CATEGORY_VALUES,
  bodyType: VEHICLE_BODY_TYPES,
  fuel: VEHICLE_FUEL_OPTIONS,
  transmission: VEHICLE_TRANSMISSION_OPTIONS,
  traction: VEHICLE_TRACTION_OPTIONS,
};

export function getVehicleImportDefaultOptions(field: VehicleImportDefaultField): readonly string[] {
  return DEFAULT_FIELD_OPTIONS[field];
}

export function createEmptyVehicleImportDefaults(): VehicleImportDefaults {
  return {};
}

/**
 * Il file vince sempre. Il predefinito entra solo dove la riga non dice
 * niente -- colonna non mappata, oppure cella vuota.
 *
 * Deliberatamente non tocca i valori che il file scrive ma la piattaforma non
 * riconosce: quelli restano vuoti come prima. Sovrascriverli significherebbe
 * rispondere "Benzina" a una riga che aveva scritto "ibrida plug-in", e un
 * dato sbagliato e' peggio di un dato mancante.
 */
function applyImportDefault(rawValue: string, defaultValue: string | undefined) {
  const value = String(rawValue ?? "").trim();
  return value || String(defaultValue ?? "").trim();
}

export function buildVehicleInsertPayload(
  mappedRow: VehicleImportMappedRow,
  defaultStatus: VehicleImportStatus,
  defaults: VehicleImportDefaults = {},
) {
  const status = normalizeStatus(mappedRow.status, defaultStatus);
  const registrationDate = parseImportRegistrationDate(mappedRow.registrationDate);
  const equipment = parseImportEquipment(mappedRow.equipment);

  return {
    vin: mappedRow.vin.trim() || null,
    brand: mappedRow.brand.trim(),
    model: mappedRow.model.trim(),
    version: mappedRow.version.trim() || null,
    vehicle_category: canonicalizeVehicleCategory(applyImportDefault(mappedRow.vehicleCategory, defaults.vehicleCategory)),
    vehicle_condition: canonicalizeVehicleCondition(applyImportDefault(mappedRow.vehicleCondition, defaults.vehicleCondition)),
    body_type: canonicalizeVehicleBodyType(applyImportDefault(mappedRow.bodyType, defaults.bodyType)),
    registration_date: registrationDate,
    // L'anno segue la data quando c'e', come nel modulo manuale, cosi' i due
    // non possono raccontare cose diverse. Senza data vale la colonna anno; e
    // se manca anche quella, l'anno si recupera dalla colonna della data --
    // intestazioni come "firstRegistration" spesso contengono solo "2019", e
    // senza questo ripiego quel dato andrebbe perso.
    year:
      registrationDate
        ? Number(registrationDate.slice(0, 4))
        : parseOptionalNumber(mappedRow.year) ?? extractYear(mappedRow.registrationDate),
    engine_size: mappedRow.engineSize.trim() || null,
    power_kw: parseOptionalCount(mappedRow.powerKw, 2000),
    power_cv: parseOptionalCount(mappedRow.powerCv, 3000),
    doors: parseOptionalCount(mappedRow.doors, 9),
    seats: parseOptionalCount(mappedRow.seats, 99),
    emission_class: mappedRow.emissionClass.trim() || null,
    interior_type: mappedRow.interiorType.trim() || null,
    warranty: mappedRow.warranty.trim() || null,
    equipment: equipment.length > 0 ? equipment : null,
    price: parseOptionalNumber(mappedRow.price),
    mileage: parseOptionalNumber(mappedRow.mileage),
    fuel: applyImportDefault(mappedRow.fuel, defaults.fuel) || null,
    traction: normalizeVehicleTraction(applyImportDefault(mappedRow.traction, defaults.traction)),
    transmission: applyImportDefault(mappedRow.transmission, defaults.transmission) || null,
    color: canonicalizeVehicleColorLabel(mappedRow.color) || null,
    description: mappedRow.description.trim() || null,
    status,
    published: status === "published",
  };
}
