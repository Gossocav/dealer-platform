import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hitRateLimit } from "@/lib/api-rate-limit";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";

type PlateLookupBody = {
  licensePlate?: string;
};

type VehicleLookupResponse = {
  brand: string;
  model: string;
  version: string;
  year: string;
  fuel: string;
  transmission: string;
  engineSize: string;
  powerKw: string;
  powerHp: string;
  doors: string;
  seats: string;
  euroClass: string;
  registrationDate: string;
  color: string;
  vin: string;
};

const PLATE_PATTERN = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
const PLATE_LOOKUP_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
};

function normalizeActiveDealerId(value: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
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
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
    }

    const resolvedDealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
      activeDealerId: normalizeActiveDealerId(request.headers.get("x-active-dealer-id")),
    });

    if (!resolvedDealerId) {
      return NextResponse.json({ error: "Dealer non associato al profilo utente." }, { status: 403 });
    }

    const clientIp = getClientIp(request);
    const rateLimitKey = `plate-lookup:${user.id}:${clientIp || "unknown"}`;

    const rateLimit = hitRateLimit(rateLimitKey, PLATE_LOOKUP_RATE_LIMIT);
    if (rateLimit.limited) {
      return NextResponse.json({ error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
    }

    const body = (await request.json()) as PlateLookupBody;
    const normalizedPlate = normalizePlate(body.licensePlate);

    if (!normalizedPlate || !PLATE_PATTERN.test(normalizedPlate)) {
      return NextResponse.json({ error: "Targa non valida. Usa formato AA123BB." }, { status: 400 });
    }

    const baseUrl = process.env.OPENAPI_AUTOMOTIVE_BASE_URL;
    const token = process.env.OPENAPI_AUTOMOTIVE_TOKEN;

    if (!baseUrl || !token) {
      console.error("OpenAPI Automotive env vars missing.");
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const endpoint = `${baseUrl.replace(/\/$/, "")}/IT-car/${encodeURIComponent(normalizedPlate)}`;
    const upstreamResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (upstreamResponse.status === 404) {
      return NextResponse.json({ error: "Nessun veicolo trovato per la targa indicata." }, { status: 404 });
    }

    if (!upstreamResponse.ok) {
      return NextResponse.json({ error: "Servizio lookup targa temporaneamente non disponibile." }, { status: 502 });
    }

    const upstreamData = await safeReadJson(upstreamResponse);
    const normalizedVehicle = normalizeVehiclePayload(upstreamData);

    return NextResponse.json({ vehicle: normalizedVehicle }, { status: 200 });
  } catch (error) {
    console.error("Plate lookup unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante la ricerca veicolo da targa." }, { status: 500 });
  }
}

function normalizePlate(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .trim();
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeVehiclePayload(raw: unknown): VehicleLookupResponse {
  const source = pickVehicleRoot(raw);

  return {
    brand: findString(source, ["CarMake", "MakeDescription", "brand", "make", "marca"]) || "",
    model: findString(source, ["CarModel", "ModelDescription", "model", "modello"]) || "",
    version: findString(source, ["Version", "Description", "version", "trim", "allestimento"]) || "",
    year: findString(source, ["RegistrationYear", "year", "modelYear", "anno"]) || "",
    fuel: findString(source, ["FuelType", "fuel", "fuelType", "alimentazione"]) || "",
    transmission: findString(source, ["transmission", "gearbox", "cambio"]) || "",
    engineSize: findString(source, ["EngineSize", "engineSize", "engineDisplacement", "cilindrata"]) || "",
    powerKw: findString(source, ["PowerKW", "powerKw", "kw", "power", "potenzaKw"]) || "",
    powerHp: findString(source, ["PowerCV", "powerHp", "hp", "cv", "potenzaCv"]) || "",
    doors: findString(source, ["NumberOfDoors", "doors", "doorCount", "porte"]) || "",
    seats: findString(source, ["seats", "seatCount", "posti"]) || "",
    euroClass: findString(source, ["EuroClass", "euroClass", "emissionClass", "classeEuro"]) || "",
    registrationDate: findString(source, ["RegistrationDate", "registrationDate", "firstRegistrationDate", "dataImmatricolazione"]) || "",
    color: findString(source, ["Color", "ExteriorColor", "color", "colore"]) || "",
    vin: findString(source, ["VIN", "Vin", "vin", "chassis", "numeroTelaio"]) || "",
  };
}

function pickVehicleRoot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const root = value as Record<string, unknown>;
  const nested = [root.data, root.result, root.vehicle, root.car].find((item) => item && typeof item === "object");

  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }

  return root;
}

function findString(source: unknown, keys: string[]): string {
  if (!source || typeof source !== "object") {
    return "";
  }

  const dictionary = source as Record<string, unknown>;

  for (const key of keys) {
    const direct = dictionary[key];
    const normalized = toCleanString(direct);
    if (normalized) {
      return normalized;
    }
  }

  for (const value of Object.values(dictionary)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const nested = findString(value, keys);
    if (nested) {
      return nested;
    }
  }

  return "";
}

function toCleanString(value: unknown) {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return null;
}