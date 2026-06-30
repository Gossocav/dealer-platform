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

function extractImageUrls(record: Record<string, unknown>): string[] {
  const imageFieldNames = [
    "image",
    "images",
    "image_url",
    "image_urls",
    "photo",
    "photos",
    "foto",
    "fotos",
    "immagine",
    "immagini",
    "gallery",
    "gallery_images",
    "picture",
    "pictures",
  ];

  const urls: string[] = [];

  // Cerca tutti i campi che potrebbero contenere immagini
  for (const [key, value] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    const isImageField = imageFieldNames.some((name) => lowerKey === name || lowerKey.includes(name));

    if (!isImageField) continue;

    // Supporta stringa singola con potenziali URL separati da virgola
    if (typeof value === "string") {
      const trimmed = value.trim();

      // Se contiene virgola, splittare e estrarre URL
      if (trimmed.includes(",")) {
        const parts = trimmed.split(",").map((p) => p.trim());
        for (const part of parts) {
          if ((part.startsWith("http://") || part.startsWith("https://")) && !urls.includes(part)) {
            urls.push(part);
          }
        }
      } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        if (!urls.includes(trimmed)) {
          urls.push(trimmed);
        }
      }
    }

    // Supporta array
    if (Array.isArray(value)) {
      for (const item of value) {
        // Caso 1: array di stringhe
        if (typeof item === "string") {
          const trimmed = item.trim();
          if ((trimmed.startsWith("http://") || trimmed.startsWith("https://")) && !urls.includes(trimmed)) {
            urls.push(trimmed);
          }
        }

        // Caso 2: array di oggetti - estrai url/src/href/image/etc
        if (item && typeof item === "object") {
          const urlFieldNames = ["url", "src", "href", "link", "image", "uri"];
          for (const urlField of urlFieldNames) {
            if (urlField in item) {
              const urlValue = (item as Record<string, unknown>)[urlField];
              if (typeof urlValue === "string") {
                const trimmed = urlValue.trim();
                if ((trimmed.startsWith("http://") || trimmed.startsWith("https://")) && !urls.includes(trimmed)) {
                  urls.push(trimmed);
                }
              }
            }
          }
        }
      }
    }

    // Caso 3: oggetto singolo - estrai url/src/href/etc
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const urlFieldNames = ["url", "src", "href", "link", "image", "uri"];
      for (const urlField of urlFieldNames) {
        if (urlField in (value as Record<string, unknown>)) {
          const urlValue = (value as Record<string, unknown>)[urlField];
          if (typeof urlValue === "string") {
            const trimmed = urlValue.trim();
            if ((trimmed.startsWith("http://") || trimmed.startsWith("https://")) && !urls.includes(trimmed)) {
              urls.push(trimmed);
            }
          }
        }
      }
    }
  }

  return urls;
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

  // Estrai immagini con la nuova logica
  const imageUrls = extractImageUrls(record);

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
const DEMO_FEED_IMAGES_URL = "demo://automotive-feed-images";

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

const DEMO_VEHICLES_WITH_IMAGES: VehicleRecord[] = [
  {
    brand: "Alfa Romeo",
    model: "Giulia",
    version: "2.2 Turbo Diesel 190 AT8 Veloce",
    year: "2022",
    price: "36900",
    mileage: "48200",
    fuel: "Diesel",
    transmission: "Automatico",
    color: "Rosso Competizione",
    image_urls: [
      "https://upload.wikimedia.org/wikipedia/commons/8/8b/Alfa_Romeo_Giulia_Veloce_2.2_TD_2017_%2835900721646%29.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/c/c5/Alfa_Romeo_Giulia_2.2_JTDM_Super_%2845291729974%29.jpg",
    ],
  },
  {
    brand: "Audi",
    model: "A3 Sportback",
    version: "35 TFSI S tronic Business",
    year: "2023",
    price: "31900",
    mileage: "22800",
    fuel: "Benzina",
    transmission: "Automatico",
    color: "Grigio Daytona",
    image_urls: [
      "https://upload.wikimedia.org/wikipedia/commons/7/78/Audi_A3_Sportback_35_TFSI_S_line_%28IV%29_%E2%80%93_f_06012021.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/0/0d/Audi_A3_Sportback_35_TFSI_S_line_%28IV%29_%E2%80%93_h_06012021.jpg",
    ],
  },
  {
    brand: "Peugeot",
    model: "3008",
    version: "1.5 BlueHDi 130 EAT8 GT",
    year: "2021",
    price: "27400",
    mileage: "61500",
    fuel: "Diesel",
    transmission: "Automatico",
    color: "Blu Celebes",
    image_urls: [
      "https://upload.wikimedia.org/wikipedia/commons/4/43/2018_Peugeot_3008_Allure_Blue_HDi_S-A_1.5.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/f/f1/Peugeot_3008_II_Facelift_1X7A6993.jpg",
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

  let detectedType: "json" | "xml" | "csv";
  let analysis: {
    rowsCount: number;
    preview: VehicleRecord[];
    firstRawRecord?: unknown;
  };

  if (url === DEMO_FEED_IMAGES_URL) {
    detectedType = "json";
    analysis = {
      rowsCount: DEMO_VEHICLES_WITH_IMAGES.length,
      preview: DEMO_VEHICLES_WITH_IMAGES,
      firstRawRecord: DEMO_VEHICLES_WITH_IMAGES[0],
    };

    if (action !== "import") {
      return NextResponse.json({
        success: true,
        message: "Feed demo automotive con immagini analizzato correttamente",
        detectedType,
        rowsCount: analysis.rowsCount,
        preview: analysis.preview,
      });
    }
  }

  if (url !== DEMO_FEED_IMAGES_URL) {
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

    // Funzione di normalizzazione: trim, lowercase, spazi multipli -> singolo
    function normalizeForComparison(value: string | null | undefined): string | null {
      if (!value) return null;
      return value.trim().toLowerCase().replace(/\s+/g, " ");
    }

    const now = new Date().toISOString();
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;

    async function saveVehicleImages(
      vehicleId: string,
      imageDealerId: string,
      imageUrls: string[] | undefined,
      createdAt: string,
    ) {
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("vehicle_images")
        .delete()
        .eq("vehicle_id", vehicleId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      const imagesToInsert = imageUrls.map((imageUrl, index) => ({
        vehicle_id: vehicleId,
        dealer_id: imageDealerId,
        image_url: imageUrl,
        position: index,
        is_cover: index === 0,
        created_at: createdAt,
      }));

      const { error: insertError } = await supabaseAdmin.from("vehicle_images").insert(imagesToInsert);
      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    for (const vehicle of analysis.preview) {
      const vehicleLabel = `${vehicle.brand} ${vehicle.model}`;

      try {
        // Prepara i dati per insert/update
        const vehicleData = {
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
          status: "published" as const,
          published: true,
          dealer_id: dealerId,
        };

        let existingVehicle: { id: string } | null = null;

        // Step 1: Cerca per VIN se presente
        if (vehicleData.vin) {
          const { data } = await supabaseAdmin
            .from("vehicles")
            .select("id")
            .eq("dealer_id", dealerId)
            .eq("vin", vehicleData.vin)
            .maybeSingle();

          existingVehicle = data as { id: string } | null;
        }

        // Step 2: Se non trovato per VIN, cerca per (dealer_id + brand + model + year)
        if (!existingVehicle) {
          const normalizedBrand = normalizeForComparison(vehicleData.brand);
          const normalizedModel = normalizeForComparison(vehicleData.model);

          if (normalizedBrand && normalizedModel) {
            // Query per ricerca normalizzata
            // Nota: Supabase non ha LOWER() nativo ma i dati nel DB devono essere normalizzati
            // o usiamo un approccio di ricerca con filtering post-query
            let query = supabaseAdmin
              .from("vehicles")
              .select("id, brand, model, year")
              .eq("dealer_id", dealerId);

            const { data: candidates } = await query;

            // Filtra manualmente con normalizzazione
            if (candidates && Array.isArray(candidates)) {
              const match = candidates.find((record) => {
                const recordBrand = normalizeForComparison(record.brand);
                const recordModel = normalizeForComparison(record.model);
                const recordYear = record.year || null;

                return (
                  recordBrand === normalizedBrand &&
                  recordModel === normalizedModel &&
                  recordYear === vehicleData.year
                );
              });

              if (match) {
                existingVehicle = { id: match.id };
              }
            }
          }
        }

        // Step 3: Aggiorna se trovato
        if (existingVehicle) {
          const { error } = await supabaseAdmin
            .from("vehicles")
            .update({
              price: vehicleData.price,
              mileage: vehicleData.mileage,
              fuel: vehicleData.fuel,
              transmission: vehicleData.transmission,
              color: vehicleData.color,
              version: vehicleData.version,
              status: vehicleData.status,
              published: vehicleData.published,
              updated_at: now,
            })
            .eq("id", existingVehicle.id);

          if (error) {
            errors.push(`${vehicleLabel}: ${error.message}`);
          } else {
            updated += 1;
            const vehicleId = existingVehicle.id;
            try {
              await saveVehicleImages(vehicleId, dealerId, vehicle.image_urls, now);
            } catch (err) {
              errors.push(
                `${vehicleLabel} (immagini): ${err instanceof Error ? err.message : "Errore sconosciuto"}`,
              );
            }
          }
        } else {
          // Step 4: Crea nuovo se non trovato
          const { data: inserted, error } = await supabaseAdmin
            .from("vehicles")
            .insert({
              ...vehicleData,
              created_at: now,
              updated_at: now,
            })
            .select("id")
            .single<{ id: string }>();

          if (error) {
            errors.push(`${vehicleLabel}: ${error.message}`);
          } else if (inserted?.id) {
            imported += 1;
            const vehicleId = inserted.id;
            try {
              await saveVehicleImages(vehicleId, dealerId, vehicle.image_urls, now);
            } catch (err) {
              errors.push(
                `${vehicleLabel} (immagini): ${err instanceof Error ? err.message : "Errore sconosciuto"}`,
              );
            }
          }
        }
      } catch (err) {
        errors.push(`${vehicleLabel}: ${err instanceof Error ? err.message : "Errore sconosciuto"}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
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
