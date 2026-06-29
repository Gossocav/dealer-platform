import * as XLSX from "xlsx";

export type VehicleImportField =
  | "brand"
  | "model"
  | "version"
  | "year"
  | "price"
  | "mileage"
  | "fuel"
  | "transmission"
  | "color"
  | "description"
  | "status";

export type VehicleImportStatus = "draft" | "published";

export type VehicleImportColumnMapping = Record<VehicleImportField, string | null>;

export type VehicleImportRawRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type VehicleImportMappedRow = Record<VehicleImportField, string>;

const FIELDS: VehicleImportField[] = [
  "brand",
  "model",
  "version",
  "year",
  "price",
  "mileage",
  "fuel",
  "transmission",
  "color",
  "description",
  "status",
];

const ALIASES: Record<VehicleImportField, string[]> = {
  brand: ["brand", "marca"],
  model: ["model", "modello"],
  version: ["version", "versione", "allestimento"],
  year: ["year", "anno"],
  price: ["price", "prezzo"],
  mileage: ["mileage", "chilometri", "chilometro", "km", "percorrenza"],
  fuel: ["fuel", "alimentazione", "carburante"],
  transmission: ["transmission", "cambio"],
  color: ["color", "colore"],
  description: ["description", "descrizione", "note"],
  status: ["status", "stato"],
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
    brand: "Marca",
    model: "Modello",
    version: "Versione",
    year: "Anno",
    price: "Prezzo",
    mileage: "Chilometri",
    fuel: "Alimentazione",
    transmission: "Cambio",
    color: "Colore",
    description: "Descrizione",
    status: "Stato",
  };

  return labels[field];
}

export function createEmptyVehicleImportMapping(): VehicleImportColumnMapping {
  return {
    brand: null,
    model: null,
    version: null,
    year: null,
    price: null,
    mileage: null,
    fuel: null,
    transmission: null,
    color: null,
    description: null,
    status: null,
  };
}

export function buildInitialVehicleImportMapping(headers: string[]): VehicleImportColumnMapping {
  const mapping = createEmptyVehicleImportMapping();
  const usedHeaders = new Set<string>();
  const headerByNormalized = new Map(headers.map((header) => [normalizeKey(header), header]));

  for (const field of FIELDS) {
    const aliases = ALIASES[field].map(normalizeKey);

    for (const alias of aliases) {
      const header = headerByNormalized.get(alias);
      if (header && !usedHeaders.has(header)) {
        mapping[field] = header;
        usedHeaders.add(header);
        break;
      }
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

  return errors;
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
    brand: mappedRow.brand.trim(),
    model: mappedRow.model.trim(),
    version: mappedRow.version.trim() || null,
    year: parseOptionalNumber(mappedRow.year),
    price: parseOptionalNumber(mappedRow.price),
    mileage: parseOptionalNumber(mappedRow.mileage),
    fuel: mappedRow.fuel.trim() || null,
    transmission: mappedRow.transmission.trim() || null,
    color: mappedRow.color.trim() || null,
    description: mappedRow.description.trim() || null,
    status,
    published: status === "published",
  };
}
