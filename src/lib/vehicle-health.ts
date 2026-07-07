import { evaluateVehicleStateTransition, resolveVehicleLifecycleState, type VehiclePermission } from "@/lib/vehicle-state-machine";
import type { VehicleRow } from "@/lib/vehicles";

export type VehicleHealthLevel = "eccellente" | "buono" | "incompleto" | "critico";

export type VehicleHealthIssue = {
  code: string;
  message: string;
  severity: "critical" | "warning";
  blocksPublication: boolean;
};

export type VehicleHealthResult = {
  score: number;
  level: VehicleHealthLevel;
  publishable: boolean;
  issues: VehicleHealthIssue[];
  suggestions: string[];
  completeness: {
    filled: number;
    total: number;
  };
};

type EvaluateVehicleHealthParams = {
  vehicle: VehicleRow;
  imagesCount?: number;
};

type HealthCheck = {
  code: string;
  valid: boolean;
  weight: number;
  message: string;
  severity?: "critical" | "warning";
  blocksPublication?: boolean;
  suggestion?: string;
};

const ALL_LIFECYCLE_PERMISSIONS: ReadonlyArray<VehiclePermission> = [
  "vehicle.state.update",
  "vehicle.publish",
  "vehicle.reserve",
  "vehicle.negotiate",
  "vehicle.sell",
  "vehicle.deliver",
  "vehicle.archive",
];

function hasText(value: unknown, minLength = 1) {
  return String(value ?? "").trim().length >= minLength;
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDescription(value: unknown) {
  return String(value ?? "").trim();
}

function getLevel(score: number): VehicleHealthLevel {
  if (score >= 85) return "eccellente";
  if (score >= 70) return "buono";
  if (score >= 45) return "incompleto";
  return "critico";
}

function uniqueSuggestions(suggestions: Array<string | undefined>) {
  const unique = new Set<string>();
  for (const item of suggestions) {
    const text = String(item ?? "").trim();
    if (text) unique.add(text);
  }
  return [...unique];
}

function resolveImageCount(vehicle: VehicleRow, explicitImagesCount: number | undefined) {
  if (typeof explicitImagesCount === "number" && Number.isFinite(explicitImagesCount) && explicitImagesCount >= 0) {
    return explicitImagesCount;
  }

  if (!Array.isArray(vehicle.vehicle_images)) {
    return 0;
  }

  return vehicle.vehicle_images.filter((image) => hasText(image?.image_url)).length;
}

function evaluatePublicationFromState(vehicle: VehicleRow) {
  const currentState = resolveVehicleLifecycleState(vehicle.status, vehicle.published);

  if (currentState === "published") {
    return { currentState, canPublish: true };
  }

  const evaluation = evaluateVehicleStateTransition(currentState, "published", ALL_LIFECYCLE_PERMISSIONS);
  return { currentState, canPublish: evaluation.allowed };
}

export function evaluateVehicleHealth(params: EvaluateVehicleHealthParams): VehicleHealthResult {
  const { vehicle } = params;
  const imagesCount = resolveImageCount(vehicle, params.imagesCount);
  const year = parseNumber(vehicle.year);
  const price = parseNumber(vehicle.price);
  const mileage = parseNumber(vehicle.mileage);
  const description = normalizeDescription(vehicle.description);

  const hasTechnicalData =
    hasText(vehicle.engine_size) ||
    parseNumber(vehicle.power_kw) !== null ||
    parseNumber(vehicle.power_cv) !== null ||
    parseNumber(vehicle.doors) !== null ||
    hasText(vehicle.registration_date);

  const publication = evaluatePublicationFromState(vehicle);

  const checks: HealthCheck[] = [
    {
      code: "brand",
      valid: hasText(vehicle.brand),
      weight: 7,
      message: "Marca mancante.",
      severity: "critical",
      blocksPublication: true,
      suggestion: "Inserisci la marca del veicolo.",
    },
    {
      code: "model",
      valid: hasText(vehicle.model),
      weight: 7,
      message: "Modello mancante.",
      severity: "critical",
      blocksPublication: true,
      suggestion: "Inserisci il modello del veicolo.",
    },
    {
      code: "version",
      valid: hasText(vehicle.version),
      weight: 5,
      message: "Versione mancante.",
      severity: "warning",
      blocksPublication: true,
      suggestion: "Specifica la versione/allestimento.",
    },
    {
      code: "year",
      valid: year !== null && year >= 1950 && year <= new Date().getFullYear() + 1,
      weight: 7,
      message: "Anno non valido o mancante.",
      severity: "critical",
      blocksPublication: true,
      suggestion: "Inserisci un anno valido di immatricolazione/modello.",
    },
    {
      code: "price",
      valid: price !== null && price > 0,
      weight: 10,
      message: "Prezzo mancante o non valido.",
      severity: "critical",
      blocksPublication: true,
      suggestion: "Imposta un prezzo di vendita maggiore di zero.",
    },
    {
      code: "mileage",
      valid: mileage !== null && mileage >= 0,
      weight: 8,
      message: "Chilometraggio mancante o non valido.",
      severity: "warning",
      blocksPublication: true,
      suggestion: "Inserisci il chilometraggio reale del veicolo.",
    },
    {
      code: "fuel",
      valid: hasText(vehicle.fuel),
      weight: 6,
      message: "Alimentazione mancante.",
      severity: "warning",
      blocksPublication: true,
      suggestion: "Indica il tipo di alimentazione.",
    },
    {
      code: "transmission",
      valid: hasText(vehicle.transmission),
      weight: 6,
      message: "Cambio mancante.",
      severity: "warning",
      blocksPublication: true,
      suggestion: "Seleziona il tipo di cambio.",
    },
    {
      code: "images",
      valid: imagesCount >= 3,
      weight: 12,
      message: "Numero immagini insufficiente (minimo 3 consigliate).",
      severity: "critical",
      blocksPublication: true,
      suggestion: "Carica almeno 3 immagini di qualita del veicolo.",
    },
    {
      code: "description",
      valid: description.length >= 80,
      weight: 10,
      message: "Descrizione troppo breve o assente.",
      severity: "warning",
      blocksPublication: true,
      suggestion: "Aggiungi una descrizione commerciale di almeno 80 caratteri.",
    },
    {
      code: "status",
      valid: publication.canPublish,
      weight: 8,
      message: "Stato veicolo non compatibile con la pubblicazione.",
      severity: "critical",
      blocksPublication: true,
      suggestion: "Riporta il veicolo in uno stato che consenta la pubblicazione.",
    },
    {
      code: "location",
      valid: hasText(vehicle.city) && hasText(vehicle.province),
      weight: 8,
      message: "Citta o provincia mancanti.",
      severity: "warning",
      blocksPublication: true,
      suggestion: "Completa localizzazione con citta e provincia.",
    },
    {
      code: "technical_data",
      valid: hasTechnicalData,
      weight: 6,
      message: "Dati tecnici principali incompleti.",
      severity: "warning",
      blocksPublication: false,
      suggestion: "Completa i dati tecnici principali (potenza, cilindrata, porte o data immatricolazione).",
    },
  ];

  const maxScore = checks.reduce((sum, check) => sum + check.weight, 0);
  const rawScore = checks.reduce((sum, check) => sum + (check.valid ? check.weight : 0), 0);
  const score = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

  const issues = checks
    .filter((check) => !check.valid)
    .map((check) => ({
      code: check.code,
      message: check.message,
      severity: check.severity ?? "warning",
      blocksPublication: check.blocksPublication ?? false,
    }));

  const suggestions = uniqueSuggestions(checks.filter((check) => !check.valid).map((check) => check.suggestion));
  const publishable = publication.canPublish && !issues.some((issue) => issue.blocksPublication);

  return {
    score,
    level: getLevel(score),
    publishable,
    issues,
    suggestions,
    completeness: {
      filled: checks.filter((check) => check.valid).length,
      total: checks.length,
    },
  };
}
