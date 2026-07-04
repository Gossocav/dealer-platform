import * as XLSX from "xlsx";
import { normalizeVehicleTraction } from "@/lib/vehicles";

export type VehicleImportField =
  | "vin"
  | "brand"
  | "model"
  | "version"
  | "year"
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
];

const ALIASES: Record<VehicleImportField, string[]> = {
  vin: ["vin", "telaio", "numero telaio", "chassis", "numero di telaio"],
  brand: ["brand", "marca", "costruttore", "manufacturer", "make"],
  model: ["model", "modello"],
  version: ["version", "versione", "allestimento"],
  year: ["year", "anno", "immatricolazione"],
  price: ["price", "prezzo", "listino"],
  mileage: ["mileage", "chilometri", "chilometro", "kilometri", "kilometers", "km", "percorrenza"],
  fuel: ["fuel", "alimentazione", "carburante"],
  traction: ["traction", "trazione", "trazione motrice", "drivetrain", "drive", "awd", "fwd", "rwd", "4x4"],
  transmission: ["transmission", "cambio"],
  color: ["color", "colore", "col esterno", "col. esterno"],
  description: ["description", "descrizione", "note"],
  status: ["status", "stato"],
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
    year: "Anno",
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
    year: null,
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

  return Array.from(new Set(collected));
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

export function buildVehicleInsertPayload(mappedRow: VehicleImportMappedRow, defaultStatus: VehicleImportStatus) {
  const status = normalizeStatus(mappedRow.status, defaultStatus);

  return {
    vin: mappedRow.vin.trim() || null,
    brand: mappedRow.brand.trim(),
    model: mappedRow.model.trim(),
    version: mappedRow.version.trim() || null,
    year: parseOptionalNumber(mappedRow.year),
    price: parseOptionalNumber(mappedRow.price),
    mileage: parseOptionalNumber(mappedRow.mileage),
    fuel: mappedRow.fuel.trim() || null,
    traction: normalizeVehicleTraction(mappedRow.traction),
    transmission: mappedRow.transmission.trim() || null,
    color: mappedRow.color.trim() || null,
    description: mappedRow.description.trim() || null,
    status,
    published: status === "published",
  };
}
