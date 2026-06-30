import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type FeedType = "auto" | "csv" | "xml" | "json";

const MAX_FEED_BYTES = 1_000_000;
const MAX_PREVIEW_ITEMS = 10;
const COMMON_JSON_ARRAY_KEYS = ["vehicles", "cars", "data", "items", "stock"];
const XML_REPEAT_TAGS = ["vehicle", "car", "item", "auto"];
const AUTOMOTIVE_XML_MARKERS = ["make", "brand", "marca", "model", "modello", "vehicle", "auto"];

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        const overflow = totalBytes - maxBytes;
        const allowedLength = value.byteLength - overflow;
        if (allowedLength > 0) {
          chunks.push(decoder.decode(value.slice(0, allowedLength), { stream: true }));
        }
        break;
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    result = chunks.join("") + decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return result;
}

function isLikelyJson(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  return (trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.endsWith("}") || trimmed.endsWith("]");
}

function isLikelyXml(content: string) {
  const trimmed = content.trimStart();
  return trimmed.startsWith("<") || /<\/?[a-zA-Z][\w:-]*(\s[^>]*)?>/.test(content);
}

function isLikelyCsv(content: string) {
  const sample = content.slice(0, 2000);
  return sample.includes(",") || sample.includes(";");
}

function detectDelimiter(sample: string) {
  const commaCount = (sample.match(/,/g) ?? []).length;
  const semicolonCount = (sample.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      rowsCount: 0,
      preview: [],
      firstRawRecord: undefined,
    };
  }

  const delimiter = detectDelimiter(lines.slice(0, 5).join("\n"));
  const header = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1);
  const vehicles: VehicleRecord[] = [];
  let firstRawRecord: Record<string, unknown> | undefined;

  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index];
    const values = parseCsvLine(line, delimiter);
    const entry: Record<string, unknown> = {};

    header.forEach((column, columnIndex) => {
      entry[column || `col_${columnIndex + 1}`] = values[columnIndex] ?? "";
    });

    if (index === 0) {
      firstRawRecord = entry;
    }

    const vehicle = extractVehicleFromRecord(entry);
    if (vehicle) {
      vehicles.push(vehicle);
    }
  }

  return {
    rowsCount: vehicles.length,
    preview: vehicles.slice(0, MAX_PREVIEW_ITEMS),
    firstRawRecord,
  };
}

function abbreviateText(value: string, maxLength = 220) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength)}...`;
}

function parseXml(content: string) {
  const result = extractVehiclesFromXmlContent(content);
  return {
    rowsCount: result.vehicles.length,
    preview: result.vehicles.slice(0, MAX_PREVIEW_ITEMS),
    firstRawRecord: result.firstRawXml,
  };
}

function isAutomotiveXmlFeed(content: string) {
  return AUTOMOTIVE_XML_MARKERS.some((marker) => {
    const tagPattern = new RegExp(`<\\/?\\s*${marker}\\b`, "i");
    const attributePattern = new RegExp(`\\b[a-zA-Z_:-]+\\s*=\\s*["']${marker}["']`, "i");

    return tagPattern.test(content) || attributePattern.test(content);
  });
}

function findFirstArrayInObject(value: Record<string, unknown>) {
  for (const key of COMMON_JSON_ARRAY_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseJson(content: string) {
  const parsed = JSON.parse(content) as unknown;
  const vehicles: VehicleRecord[] = [];
  let firstRawRecord: unknown;

  if (Array.isArray(parsed)) {
    for (let index = 0; index < parsed.length; index += 1) {
      const item = parsed[index];
      if (item && typeof item === "object") {
        if (index === 0) {
          firstRawRecord = item;
        }
        const vehicle = extractVehicleFromRecord(item as Record<string, unknown>);
        if (vehicle) {
          vehicles.push(vehicle);
        }
      }
    }
  } else if (parsed && typeof parsed === "object") {
    const objectValue = parsed as Record<string, unknown>;
    const arrayValue = findFirstArrayInObject(objectValue);

    if (arrayValue) {
      for (let index = 0; index < arrayValue.length; index += 1) {
        const item = arrayValue[index];
        if (item && typeof item === "object") {
          if (index === 0) {
            firstRawRecord = item;
          }
          const vehicle = extractVehicleFromRecord(item as Record<string, unknown>);
          if (vehicle) {
            vehicles.push(vehicle);
          }
        }
      }
    } else {
      firstRawRecord = objectValue;
      const vehicle = extractVehicleFromRecord(objectValue);
      if (vehicle) {
        vehicles.push(vehicle);
      }
    }
  }

  return {
    rowsCount: vehicles.length,
    preview: vehicles.slice(0, MAX_PREVIEW_ITEMS),
    firstRawRecord,
  };
}

function detectFeedType(content: string, requestedType: FeedType) {
  const normalizedType = requestedType === "auto" ? null : requestedType;

  if (normalizedType === "json") {
    try {
      parseJson(content);
      return "json" as const;
    } catch {
      // fall through to sniffing
    }
  }

  if (normalizedType === "xml") {
    if (isLikelyXml(content)) {
      return "xml" as const;
    }
  }

  if (normalizedType === "csv") {
    if (isLikelyCsv(content)) {
      return "csv" as const;
    }
  }

  if (isLikelyJson(content)) {
    try {
      parseJson(content);
      return "json" as const;
    } catch {
      // continue sniffing other formats
    }
  }

  if (isLikelyXml(content)) {
    return "xml" as const;
  }

  return "csv" as const;
}

type VehicleRecord = {
  brand?: string;
  model?: string;
  version?: string;
  year?: string | number;
  price?: string | number;
  mileage?: string | number;
  fuel?: string;
  transmission?: string;
  image_urls?: string[];
};

function extractStringFromValue(value: unknown, depth = 0): string | null {
  const MAX_DEPTH = 10;

  // Protezione contro la ricorsione infinita
  if (depth > MAX_DEPTH) {
    return null;
  }

  // Stringa: ritorna se non vuota
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  // Numeri e booleani: converti a stringa
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // null o undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Array: estrai il primo valore utile
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractStringFromValue(item, depth + 1);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }

  // Oggetto: cerca ricorsivamente
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const priorityKeys = ["name", "value", "label", "title", "text", "model", "make"];

    // Primo: prova i campi prioritari
    for (const key of priorityKeys) {
      if (key in obj) {
        const extracted = extractStringFromValue(obj[key], depth + 1);
        if (extracted) {
          return extracted;
        }
      }
    }

    // Secondo: prova tutti i valori in ordine
    const entries = Object.entries(obj);
    const sortedEntries = entries.sort(([keyA], [keyB]) => {
      const aScore = keyA.toLowerCase().includes("name") || keyA.toLowerCase().includes("value") ? 0 : 1;
      const bScore = keyB.toLowerCase().includes("name") || keyB.toLowerCase().includes("value") ? 0 : 1;
      return aScore - bScore;
    });

    for (const [, val] of sortedEntries) {
      const extracted = extractStringFromValue(val, depth + 1);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

function findFieldValue(obj: Record<string, unknown>, fieldPatterns: string[]): string | null {
  const lowerObj: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    lowerObj[k.toLowerCase().replace(/[_-]/g, "")] = v;
  });

  for (const pattern of fieldPatterns) {
    const normalized = pattern.toLowerCase().replace(/[_-]/g, "");
    const value = lowerObj[normalized];
    if (value !== null && value !== undefined && value !== "") {
      return extractStringFromValue(value);
    }
  }

  return null;
}

function normalizeVehicleRecord(record: VehicleRecord): VehicleRecord {
  const normalized: VehicleRecord = {};

  // Normalizza tutti i campi stringa
  const stringFields: (keyof VehicleRecord)[] = ["brand", "model", "version", "fuel", "transmission"];
  for (const field of stringFields) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      const extracted = extractStringFromValue(value);
      if (extracted) {
        (normalized as Record<string, unknown>)[field] = extracted;
      }
    }
  }

  // Normalizza campi numerici
  const numericFields: (keyof VehicleRecord)[] = ["year", "price", "mileage"];
  for (const field of numericFields) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      if (typeof value === "number") {
        (normalized as Record<string, unknown>)[field] = value;
      } else if (typeof value === "string") {
        const extracted = extractStringFromValue(value);
        if (extracted) {
          (normalized as Record<string, unknown>)[field] = extracted;
        }
      }
    }
  }

  // Normalizza image_urls
  if (record.image_urls && Array.isArray(record.image_urls)) {
    const urls = record.image_urls.filter((url) => typeof url === "string");
    if (urls.length > 0) {
      normalized.image_urls = urls;
    }
  }

  return normalized;
}

function extractVehicleFromRecord(record: Record<string, unknown>): VehicleRecord | null {
  const brand = findFieldValue(record, ["brand", "marca", "make", "manufacturer", "marque"]);
  const model = findFieldValue(record, ["model", "modello", "model_name", "name"]);

  if (!brand || !model) {
    return null;
  }

  const year = findFieldValue(record, ["year", "anno", "year_of_manufacture", "manufacturing_year"]);
  const price = findFieldValue(record, ["price", "prezzo", "prezzo_vendita", "cost", "selling_price"]);
  const mileage = findFieldValue(record, ["mileage", "km", "chilometri", "kilometers", "odometer"]);
  const fuel = findFieldValue(record, ["fuel", "alimentazione", "carburante", "fuel_type", "petrol_diesel"]);
  const transmission = findFieldValue(record, ["transmission", "cambio", "trasmissione", "gearbox", "gear"]);
  const version = findFieldValue(record, ["version", "versione", "trim", "trim_level"]);

  const imageUrlsKey = Object.keys(record).find(
    (k) => k.toLowerCase().includes("image") || k.toLowerCase().includes("foto") || k.toLowerCase().includes("picture"),
  );
  let imageUrls: string[] = [];
  if (imageUrlsKey) {
    const imageValue = record[imageUrlsKey];
    if (Array.isArray(imageValue)) {
      imageUrls = imageValue
        .map((v) => extractStringFromValue(v))
        .filter((v): v is string => v !== null && (v.startsWith("http://") || v.startsWith("https://")));
    } else {
      const extracted = extractStringFromValue(imageValue);
      if (extracted && (extracted.startsWith("http://") || extracted.startsWith("https://"))) {
        imageUrls = [extracted];
      }
    }
  }

  const vehicle: VehicleRecord = {
    brand,
    model,
    version: version ?? undefined,
    year: year ?? undefined,
    price: price ?? undefined,
    mileage: mileage ?? undefined,
    fuel: fuel ?? undefined,
    transmission: transmission ?? undefined,
    image_urls: imageUrls.length > 0 ? imageUrls : undefined,
  };

  return normalizeVehicleRecord(vehicle);
}

function extractVehiclesFromXmlContent(content: string): { vehicles: VehicleRecord[]; firstRawXml?: string } {
  const vehicles: VehicleRecord[] = [];
  let firstRawXml: string | undefined;

  for (const tag of XML_REPEAT_TAGS) {
    const tagPattern = new RegExp(`<${tag}\\b[\\s\\S]*?<\/${tag}>`, "gi");
    const matches = content.match(tagPattern) ?? [];

    for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      const match = matches[matchIndex];
      if (matchIndex === 0 && !firstRawXml) {
        firstRawXml = match;
      }

      const vehicle: VehicleRecord = {};

      const fieldPatterns = {
        brand: [
          { patterns: ["brand", "marca", "make", "manufacturer"], single: true },
          { patterns: ["brand", "marca", "make", "manufacturer"], single: true },
        ],
        model: [{ patterns: ["model", "modello", "model_name", "name"], single: true }],
        year: [{ patterns: ["year", "anno", "year_of_manufacture", "manufacturing_year"], single: true }],
        price: [{ patterns: ["price", "prezzo", "prezzo_vendita", "cost", "selling_price"], single: true }],
        mileage: [{ patterns: ["mileage", "km", "chilometri", "kilometers", "odometer"], single: true }],
        fuel: [{ patterns: ["fuel", "alimentazione", "carburante", "fuel_type"], single: true }],
        transmission: [{ patterns: ["transmission", "cambio", "trasmissione", "gearbox"], single: true }],
        version: [{ patterns: ["version", "versione", "trim", "trim_level"], single: true }],
      };

      for (const [key, items] of Object.entries(fieldPatterns)) {
        for (const item of items) {
          for (const pattern of item.patterns) {
            const tagRegex = new RegExp(`<${pattern}[^>]*>([^<]+)<\/${pattern}>`, "i");
            const tagMatch = match.match(tagRegex);
            if (tagMatch && tagMatch[1]) {
              const value = tagMatch[1].trim();
              if (value) {
                (vehicle as Record<string, unknown>)[key] = value;
                break;
              }
            }
          }
        }
      }

      // Extract images
      const imageMatches = match.match(/<image[^>]*>([^<]+)<\/image>/gi) || [];
      if (imageMatches.length > 0) {
        vehicle.image_urls = imageMatches
          .map((m) => {
            const urlMatch = m.match(/>([^<]+)</);
            return urlMatch ? urlMatch[1].trim() : null;
          })
          .filter((url): url is string => url !== null && (url.startsWith("http://") || url.startsWith("https://")));
      }

      if (vehicle.brand && vehicle.model) {
        vehicles.push(vehicle);
      }
    }
  }

  return { vehicles, firstRawXml };
}

const DEMO_FEED_URL = "demo://automotive-feed";

const DEMO_VEHICLES = [
  {
    brand: "Jeep",
    model: "Avenger",
    version: "1.2 Turbo Altitude",
    year: "2024",
    price: "29900",
    mileage: "0",
    fuel: "Benzina",
    transmission: "Automatico",
    color: "Bianco Alpino",
    image_urls: ["https://example.com/jeep-avenger-1.jpg", "https://example.com/jeep-avenger-2.jpg"],
  },
  {
    brand: "Fiat",
    model: "600",
    version: "1.2 Hybrid Red",
    year: "2024",
    price: "24500",
    mileage: "1200",
    fuel: "Ibrido",
    transmission: "Automatico",
    color: "Rosso Passione",
    image_urls: ["https://example.com/fiat-600-1.jpg"],
  },
  {
    brand: "BMW",
    model: "X1",
    version: "xDrive20d xLine",
    year: "2023",
    price: "49800",
    mileage: "15000",
    fuel: "Diesel",
    transmission: "Automatico",
    color: "Grigio Mineral",
    image_urls: [
      "https://example.com/bmw-x1-1.jpg",
      "https://example.com/bmw-x1-2.jpg",
      "https://example.com/bmw-x1-3.jpg",
    ],
  },
];

export async function POST(request: Request) {
  const body = (await request.json()) as {
    url?: string;
    type?: FeedType;
    action?: string;
    dealer_id?: string;
  };

  const url = body.url?.trim();
  const requestedType = body.type ?? "auto";
  const action = body.action ?? "analyze";
  const dealerId = body.dealer_id?.trim() ?? null;

  if (!url) {
    return NextResponse.json(
      {
        success: false,
        message: "URL feed obbligatorio",
      },
      { status: 400 },
    );
  }

  if (url === DEMO_FEED_URL) {
    if (action === "import") {
      if (!dealerId) {
        return NextResponse.json(
          { success: false, message: "dealer_id obbligatorio per l'importazione." },
          { status: 400 },
        );
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceRoleKey) {
        return NextResponse.json(
          { success: false, message: "Configurazione Supabase incompleta." },
          { status: 500 },
        );
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      const now = new Date().toISOString();
      const errors: string[] = [];
      let imported = 0;

      for (const vehicle of DEMO_VEHICLES) {
        const { error } = await supabaseAdmin.from("vehicles").insert({
          brand: vehicle.brand,
          model: vehicle.model,
          version: vehicle.version,
          year: parseInt(vehicle.year, 10),
          price: parseFloat(vehicle.price),
          mileage: parseInt(vehicle.mileage, 10),
          fuel: vehicle.fuel,
          transmission: vehicle.transmission,
          color: vehicle.color,
          vin: null,
          description: null,
          status: "published",
          published: true,
          dealer_id: dealerId,
          created_at: now,
          updated_at: now,
        });

        if (error) {
          errors.push(`${vehicle.brand} ${vehicle.model}: ${error.message}`);
        } else {
          imported += 1;
        }
      }

      return NextResponse.json({
        success: true,
        imported,
        updated: 0,
        errors,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Feed demo automotive analizzato correttamente",
      detectedType: "json",
      rowsCount: DEMO_VEHICLES.length,
      preview: DEMO_VEHICLES,
    });
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      {
        success: false,
        message: "URL feed non valido",
      },
      { status: 400 },
    );
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "DealerPlatformFeedAnalyzer/1.0",
        accept: "application/json, text/xml, application/xml, text/csv, text/plain, */*",
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Feed non raggiungibile",
      },
      { status: 400 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        success: false,
        message: "Feed non raggiungibile",
      },
      { status: 400 },
    );
  }

  const content = await readLimitedText(response, MAX_FEED_BYTES);

  let detectedType: "json" | "xml" | "csv";
  let analysis: {
    rowsCount: number;
    preview: VehicleRecord[];
    firstRawRecord?: unknown;
  };

  try {
    detectedType = detectFeedType(content, requestedType);

    if (detectedType === "json") {
      analysis = parseJson(content);
    } else if (detectedType === "xml") {
      if (!isAutomotiveXmlFeed(content)) {
        return NextResponse.json(
          {
            success: false,
            message: "Il feed è valido ma non contiene dati di veicoli.",
          },
          { status: 400 },
        );
      }

      analysis = parseXml(content);
    } else {
      analysis = parseCsv(content);
    }

    if (analysis.rowsCount === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Il feed non contiene veicoli.",
        },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Errore durante l'analisi del feed.",
      },
      { status: 400 },
    );
  }

  // Gestisci l'import di feed reali
  if (action === "import") {
    if (!dealerId) {
      return NextResponse.json(
        { success: false, message: "dealer_id obbligatorio per l'importazione." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Configurazione Supabase incompleta." },
        { status: 500 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const now = new Date().toISOString();
    const errors: string[] = [];
    let imported = 0;

    for (const vehicle of analysis.preview) {
      const { error } = await supabaseAdmin.from("vehicles").insert({
        brand: vehicle.brand,
        model: vehicle.model,
        version: vehicle.version ?? null,
        year: vehicle.year ? parseInt(String(vehicle.year), 10) : null,
        price: vehicle.price ? parseFloat(String(vehicle.price)) : null,
        mileage: vehicle.mileage ? parseInt(String(vehicle.mileage), 10) : null,
        fuel: vehicle.fuel ?? null,
        transmission: vehicle.transmission ?? null,
        color: null,
        vin: null,
        description: null,
        status: "published",
        published: true,
        dealer_id: dealerId,
        created_at: now,
        updated_at: now,
      });

      if (error) {
        errors.push(`${vehicle.brand} ${vehicle.model}: ${error.message}`);
      } else {
        imported += 1;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated: 0,
      errors,
    });
  }

  const isDebugUrl = url.includes("https://gist.githubusercontent.com/bertwagner/356bf47732b9e35d2156daa943e049e9/raw/");
  const responseBody: Record<string, unknown> = {
    success: true,
    message: "Feed analizzato correttamente",
    detectedType,
    rowsCount: analysis.rowsCount,
    preview: analysis.preview,
  };

  if (isDebugUrl && analysis.firstRawRecord) {
    responseBody.debugFirstVehicle = analysis.firstRawRecord;
  }

  return NextResponse.json(responseBody);
}
