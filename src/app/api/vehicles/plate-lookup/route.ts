import { NextResponse } from "next/server";

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

export async function POST(request: Request) {
  try {
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
      const fallbackMessage = `Lookup targa fallito (HTTP ${upstreamResponse.status}).`;
      const upstreamError = await safeReadJson(upstreamResponse);
      const message = findString(upstreamError, ["error", "message", "detail"]) || fallbackMessage;
      return NextResponse.json({ error: message }, { status: 500 });
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