import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import {
  buildInitialVehicleImportMapping,
  buildVehicleInsertPayload,
  extractVehicleImageUrls,
  mapVehicleImportRow,
  type VehicleImportMappedRow,
  type VehicleImportRawRow,
  type VehicleImportStatus,
  validateVehicleImportRow,
} from "@/lib/vehicle-import";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { fetchWithSsrfProtection, parseAndValidateExternalHttpUrl } from "@/lib/ssrf-protection";

type FeedFormat = "csv" | "xml" | "json";
type FeedMode = "analyze" | "import";

type FeedRequestBody = {
  mode?: FeedMode;
  feedUrl?: string;
  format?: "auto" | FeedFormat;
  status?: VehicleImportStatus;
  frequency?: "manual" | "nightly" | "weekly";
};

type FeedRecord = Record<string, unknown>;

type FeedHistoryItem = {
  id: string;
  created_at: string;
  source: string;
  source_type: FeedFormat;
  imported_count: number;
  error_count: number;
  duration_ms: number;
};

type ApiSupabaseClient = SupabaseClient;

const MAX_FEED_BYTES = 1_000_000;

const PREVIEW_LIMIT = 20;
const DEMO_FEED_IMAGES_URL = "demo://automotive-feed-images";
const DEMO_FEED_RECORDS: FeedRecord[] = [
  {
    brand: "Audi",
    model: "A3 Sportback",
    version: "35 TFSI S tronic Business",
    year: "2023",
    price: "31900",
    mileage: "22800",
    fuel: "Benzina",
    transmission: "Automatico",
    images: "https://picsum.photos/seed/audi-a3/900/600",
  },
  {
    brand: "Alfa Romeo",
    model: "Giulia",
    version: "2.2 Turbo Diesel 190 AT8 Veloce",
    year: "2022",
    price: "36900",
    mileage: "48200",
    fuel: "Diesel",
    transmission: "Automatico",
    images: "https://picsum.photos/seed/alfa-giulia/900/600",
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
    images: "https://picsum.photos/seed/peugeot-3008/900/600",
  },
];

function normalizeActiveDealerId(value: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

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

    return chunks.join("") + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    let body: FeedRequestBody;
    try {
      body = (await request.json()) as FeedRequestBody;
    } catch {
      return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
    }
    const mode: FeedMode = body.mode === "import" ? "import" : "analyze";
    const feedUrl = String(body.feedUrl ?? "").trim();
    const preferredFormat = body.format ?? "auto";
    const desiredStatus: VehicleImportStatus = body.status === "draft" ? "draft" : "published";

    if (!feedUrl) {
      return NextResponse.json({ error: "URL feed obbligatorio." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(feedUrl);
    } catch {
      return NextResponse.json({ error: "URL feed non valido." }, { status: 400 });
    }

    if (!["http:", "https:", "demo:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Sono supportati solo URL HTTP/HTTPS." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Configurazione Supabase incompleta." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
    }

    const activeDealerId = normalizeActiveDealerId(request.headers.get("x-active-dealer-id"));
    const dealerId = await resolveDealerId(supabase, user.id, activeDealerId);
    if (!dealerId) {
      return NextResponse.json({ error: "Dealer non associato al profilo utente." }, { status: 400 });
    }

    const { count: vehicleCount, error: vehicleCountError } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId);

    if (vehicleCountError) {
      return NextResponse.json({ error: "Impossibile verificare il limite demo del dealer." }, { status: 500 });
    }

    const demoAccessContext = await resolveDemoAccessContext(supabase, dealerId, {
      vehicleCount: vehicleCount ?? 0,
    });

    if (mode === "import") {
      const demoBlock = getDemoFeatureBlockReason(demoAccessContext, "vehicle");
      if (demoBlock) {
        return NextResponse.json({ error: demoBlock.message }, { status: 403 });
      }
    }

    let detectedFormat: FeedFormat;
    let records: FeedRecord[];

    if (feedUrl === DEMO_FEED_IMAGES_URL) {
      detectedFormat = "json";
      records = DEMO_FEED_RECORDS;
    } else {
      const safeFeedUrl = parseAndValidateExternalHttpUrl(feedUrl);

      const feedResponse = await fetchWithSsrfProtection(safeFeedUrl, {
        method: "GET",
        headers: {
          Accept: "application/json, text/csv, application/xml, text/xml, */*",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });

      if (!feedResponse.ok) {
        return NextResponse.json({ error: `Download feed fallito (HTTP ${feedResponse.status}).` }, { status: 400 });
      }

      const contentLength = Number(feedResponse.headers.get("content-length") ?? "NaN");
      if (Number.isFinite(contentLength) && contentLength > MAX_FEED_BYTES) {
        return NextResponse.json({ error: "Il feed supera la dimensione massima consentita." }, { status: 400 });
      }

      const rawText = await readLimitedText(feedResponse, MAX_FEED_BYTES);
      detectedFormat = detectFeedFormat(
        preferredFormat,
        feedUrl,
        String(feedResponse.headers.get("content-type") ?? ""),
        rawText
      );

      records = parseFeedRecords(rawText, detectedFormat);
    }

    if (records.length === 0) {
      return NextResponse.json({
        mode,
        format: detectedFormat,
        vehicleCount: 0,
        errorCount: 0,
        preview: [],
      });
    }

    const headers = collectHeaders(records);
    const rawRows = toRawRows(records);
    const mapping = buildInitialVehicleImportMapping(headers);

    const analyzed = rawRows.map((row) => {
      const mapped = mapVehicleImportRow(row, mapping);
      const errors = validateVehicleImportRow(mapped);
      return {
        row,
        mapped,
        errors,
        imageUrls: extractVehicleImageUrls(row.values),
      };
    });

    const preview = analyzed.slice(0, PREVIEW_LIMIT).map((entry) => ({
      rowNumber: entry.row.rowNumber,
      brand: entry.mapped.brand,
      model: entry.mapped.model,
      version: entry.mapped.version,
      year: entry.mapped.year,
      price: entry.mapped.price,
      status: entry.mapped.status,
      images: entry.imageUrls.slice(0, 3),
      errors: entry.errors,
    }));

    if (mode === "analyze") {
      return NextResponse.json({
        mode,
        format: detectedFormat,
        vehicleCount: analyzed.length,
        errorCount: analyzed.reduce((acc, item) => acc + item.errors.length, 0),
        preview,
      });
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const entry of analyzed) {
      if (entry.errors.length > 0) {
        skippedCount += 1;
        errors.push(`Riga ${entry.row.rowNumber}: ${entry.errors.join(", ")}`);
        continue;
      }

      const duplicateId = await findDuplicateVehicleId(supabase, dealerId, entry.mapped);
      const payload = {
        ...buildVehicleInsertPayload(entry.mapped, desiredStatus),
        dealer_id: dealerId,
        status: desiredStatus,
        published: desiredStatus === "published",
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>;

      let targetVehicleId: string | null = null;

      if (duplicateId) {
        const { error: updateError } = await supabase.from("vehicles").update(payload).eq("id", duplicateId).eq("dealer_id", dealerId);
        if (updateError) {
          skippedCount += 1;
          errors.push(`Riga ${entry.row.rowNumber}: errore aggiornamento veicolo`);
          continue;
        }
        targetVehicleId = duplicateId;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("vehicles")
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();

        if (insertError || !inserted?.id) {
          skippedCount += 1;
          errors.push(`Riga ${entry.row.rowNumber}: errore inserimento veicolo`);
          continue;
        }

        targetVehicleId = String(inserted.id);
      }

      if (!targetVehicleId) {
        skippedCount += 1;
        errors.push(`Riga ${entry.row.rowNumber}: ID veicolo non disponibile.`);
        continue;
      }

      await upsertVehicleImages(supabase, dealerId, targetVehicleId, entry.imageUrls);
      importedCount += 1;
    }

    const durationMs = Date.now() - startedAt;
    await persistHistoryIfTableExists(
      supabase,
      {
        created_at: new Date().toISOString(),
        source: feedUrl,
        source_type: detectedFormat,
        imported_count: importedCount,
        error_count: errors.length,
        duration_ms: durationMs,
      },
      dealerId,
      body.frequency ?? "manual"
    );

    return NextResponse.json({
      mode,
      format: detectedFormat,
      vehicleCount: analyzed.length,
      importedCount,
      skippedCount,
      errorCount: errors.length,
      errors,
      preview,
      durationMs,
    });
  } catch (error) {
    console.error("Vehicles import-feed POST unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante la sincronizzazione stock." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ history: buildMockHistory(), mock: true });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ history: buildMockHistory(), mock: true });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ history: buildMockHistory(), mock: true });
    }

    const activeDealerId = normalizeActiveDealerId(request.headers.get("x-active-dealer-id"));
    const dealerId = await resolveDealerId(supabase, user.id, activeDealerId);
    if (!dealerId) {
      return NextResponse.json({ history: buildMockHistory(), mock: true });
    }

    const historyTable = await detectHistoryTable(supabase);
    if (!historyTable) {
      return NextResponse.json({ history: buildMockHistory(), mock: true });
    }

    const { data, error } = await supabase
      .from(historyTable)
      .select("id, created_at, source, source_type, imported_count, error_count, duration_ms")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ history: buildMockHistory(), mock: true });
    }

    const history = data.map((row: Record<string, unknown>) => ({
      id: String(row.id ?? crypto.randomUUID()),
      created_at: String(row.created_at ?? new Date().toISOString()),
      source: String(row.source ?? "Feed"),
      source_type: normalizeFeedType(String(row.source_type ?? "csv")),
      imported_count: Number(row.imported_count ?? 0),
      error_count: Number(row.error_count ?? 0),
      duration_ms: Number(row.duration_ms ?? 0),
    }));

    return NextResponse.json({ history });
  } catch (error) {
    console.warn("Vehicles import-feed GET fallback to mock history", error);
    return NextResponse.json({ history: buildMockHistory(), mock: true });
  }
}

function detectFeedFormat(preferred: "auto" | FeedFormat, feedUrl: string, contentType: string, rawText: string): FeedFormat {
  if (preferred !== "auto") {
    return preferred;
  }

  const normalizedUrl = feedUrl.toLowerCase();
  const normalizedType = contentType.toLowerCase();
  const trimmed = rawText.trim();

  if (normalizedUrl.endsWith(".json") || normalizedType.includes("json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "json";
  }

  if (normalizedUrl.endsWith(".xml") || normalizedType.includes("xml") || trimmed.startsWith("<")) {
    return "xml";
  }

  return "csv";
}

function parseFeedRecords(raw: string, format: FeedFormat): FeedRecord[] {
  if (format === "json") {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter(isRecord);
    }

    if (isRecord(parsed)) {
      const candidates = ["vehicles", "items", "stock", "data", "results"];
      for (const key of candidates) {
        const entry = parsed[key];
        if (Array.isArray(entry)) {
          return entry.filter(isRecord);
        }
      }
    }

    return [];
  }

  if (format === "xml") {
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
      parseAttributeValue: false,
    });

    const parsed = parser.parse(raw) as unknown;
    const arrays = collectObjectArrays(parsed);

    const preferred = arrays.find((entries) => entries.some(hasVehicleLikeFields));
    const selected = preferred ?? arrays.find((entries) => entries.length > 0) ?? [];

    return selected.map(flattenRecord).filter(isRecord);
  }

  return parseCsv(raw);
}

function parseCsv(raw: string): FeedRecord[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const delimiter = chooseDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((entry) => entry.replace(/^"|"$/g, "").trim());

  const rows: FeedRecord[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i], delimiter);
    const record: FeedRecord = {};

    for (let j = 0; j < headers.length; j += 1) {
      record[headers[j]] = String(values[j] ?? "").replace(/^"|"$/g, "").trim();
    }

    rows.push(record);
  }

  return rows;
}

function chooseDelimiter(line: string) {
  const delimiters = [",", ";", "\t", "|"];
  let best = ",";
  let max = -1;

  for (const delimiter of delimiters) {
    const size = splitCsvLine(line, delimiter).length;
    if (size > max) {
      max = size;
      best = delimiter;
    }
  }

  return best;
}

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function collectHeaders(records: FeedRecord[]) {
  const headers = new Set<string>();

  for (const record of records.slice(0, 300)) {
    for (const key of Object.keys(record)) {
      const normalized = String(key).trim();
      if (normalized) {
        headers.add(normalized);
      }
    }
  }

  return Array.from(headers);
}

function toRawRows(records: FeedRecord[]): VehicleImportRawRow[] {
  return records.map((record, index) => {
    const values: Record<string, string> = {};

    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) {
        values[key] = value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(",");
        continue;
      }

      if (isRecord(value)) {
        values[key] = Object.values(value)
          .map((entry) => String(entry ?? "").trim())
          .filter(Boolean)
          .join(" ");
        continue;
      }

      values[key] = String(value ?? "").trim();
    }

    return {
      rowNumber: index + 2,
      values,
    };
  });
}

export async function findDuplicateVehicleId(supabase: ApiSupabaseClient, dealerId: string, mapped: VehicleImportMappedRow) {
  const vin = String(mapped.vin ?? "").trim();

  if (vin) {
    const { data } = await supabase
      .from("vehicles")
      .select("id")
      .eq("dealer_id", dealerId)
      .eq("vin", vin)
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      return String(data.id);
    }
  }

  const brand = String(mapped.brand ?? "").trim();
  const model = String(mapped.model ?? "").trim();
  const version = String(mapped.version ?? "").trim();
  const yearRaw = String(mapped.year ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;

  if (!brand || !model || !version || !Number.isFinite(year)) {
    return null;
  }

  const { data } = await supabase
    .from("vehicles")
    .select("id")
    .eq("dealer_id", dealerId)
    .ilike("brand", brand)
    .ilike("model", model)
    .ilike("version", version)
    .eq("year", year)
    .limit(2);

  if (!Array.isArray(data) || data.length !== 1) {
    return null;
  }

  const [match] = data;
  return match?.id ? String(match.id) : null;
}

async function upsertVehicleImages(supabase: ApiSupabaseClient, dealerId: string, vehicleId: string, imageUrls: string[]) {
  const urls = Array.from(new Set(imageUrls.map((url) => String(url ?? "").trim()).filter(Boolean)));
  if (urls.length === 0) {
    return;
  }

  const { data: existing } = await supabase
    .from("vehicle_images")
    .select("id, image_url")
    .eq("vehicle_id", vehicleId)
    .order("position", { ascending: true });

  const existingUrls = new Set((Array.isArray(existing) ? existing : []).map((row: Record<string, unknown>) => String(row.image_url ?? "").trim()));
  const toInsert = urls.filter((url) => !existingUrls.has(url));

  if (Array.isArray(existing) && existing.length === 0) {
    await supabase.from("vehicle_images").insert(
      urls.map((url, index) => ({
        dealer_id: dealerId,
        vehicle_id: vehicleId,
        image_url: url,
        position: index,
        is_cover: index === 0,
      }))
    );
    return;
  }

  if (toInsert.length > 0) {
    await supabase.from("vehicle_images").insert(
      toInsert.map((url, index) => ({
        dealer_id: dealerId,
        vehicle_id: vehicleId,
        image_url: url,
        position: (Array.isArray(existing) ? existing.length : 0) + index,
        is_cover: false,
      }))
    );
  }
}

async function resolveDealerId(supabase: ApiSupabaseClient, userId: string, activeDealerId?: string | null) {
  return resolveDealerIdFromTenantSources(supabase, userId, {
    activeDealerId,
  });
}

async function detectHistoryTable(supabase: ApiSupabaseClient) {
  const candidates = ["vehicle_import_history", "stock_sync_history", "import_history"];

  for (const table of candidates) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (!error) {
      return table;
    }
  }

  return null;
}

async function persistHistoryIfTableExists(
  supabase: ApiSupabaseClient,
  item: Omit<FeedHistoryItem, "id">,
  dealerId: string,
  frequency: "manual" | "nightly" | "weekly"
) {
  const table = await detectHistoryTable(supabase);
  if (!table) {
    return;
  }

  await supabase.from(table).insert({
    dealer_id: dealerId,
    source: item.source,
    source_type: item.source_type,
    imported_count: item.imported_count,
    error_count: item.error_count,
    duration_ms: item.duration_ms,
    frequency,
    created_at: item.created_at,
  });
}

function normalizeFeedType(value: string): FeedFormat {
  const lowered = value.trim().toLowerCase();
  if (lowered === "xml" || lowered === "json") {
    return lowered;
  }

  return "csv";
}

function buildMockHistory(): FeedHistoryItem[] {
  return [
    {
      id: "mock-1",
      created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
      source: "https://www.concessionaria.it/feed.xml",
      source_type: "xml",
      imported_count: 27,
      error_count: 2,
      duration_ms: 2400,
    },
    {
      id: "mock-2",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      source: "https://www.concessionaria.it/stock.csv",
      source_type: "csv",
      imported_count: 19,
      error_count: 1,
      duration_ms: 1780,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasVehicleLikeFields(record: Record<string, unknown>) {
  const keys = Object.keys(record).map((key) => key.toLowerCase());
  return keys.some((key) =>
    ["brand", "marca", "model", "modello", "version", "versione", "vin", "price", "prezzo"].some((hint) => key.includes(hint))
  );
}

function collectObjectArrays(value: unknown): Array<Array<Record<string, unknown>>> {
  const found: Array<Array<Record<string, unknown>>> = [];

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      const asObjects = node.filter(isRecord);
      if (asObjects.length > 0) {
        found.push(asObjects);
      }

      for (const item of node) {
        walk(item);
      }
      return;
    }

    if (isRecord(node)) {
      for (const nested of Object.values(node)) {
        walk(nested);
      }
    }
  };

  walk(value);
  return found;
}

function flattenRecord(record: Record<string, unknown>): FeedRecord {
  const flattened: FeedRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      flattened[key] = value
        .map((entry) => {
          if (isRecord(entry)) {
            return Object.values(entry)
              .map((nested) => String(nested ?? "").trim())
              .filter(Boolean)
              .join(" ");
          }
          return String(entry ?? "").trim();
        })
        .filter(Boolean)
        .join(",");
      continue;
    }

    if (isRecord(value)) {
      flattened[key] = Object.values(value)
        .map((nested) => {
          if (isRecord(nested)) {
            return Object.values(nested)
              .map((leaf) => String(leaf ?? "").trim())
              .filter(Boolean)
              .join(" ");
          }
          return String(nested ?? "").trim();
        })
        .filter(Boolean)
        .join(" ");
      continue;
    }

    flattened[key] = String(value ?? "").trim();
  }

  return flattened;
}
