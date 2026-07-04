const COLOR_DEFINITIONS = [
  { label: "Nero", key: "nero", aliases: ["nero", "black"] },
  { label: "Bianco", key: "bianco", aliases: ["bianco", "white"] },
  { label: "Beige", key: "beige", aliases: ["beige"] },
  { label: "Blu/Azzurro", key: "bluazzurro", aliases: ["blu", "azzurro", "bluazzurro", "blue", "lightblue"] },
  { label: "Marrone", key: "marrone", aliases: ["marrone", "brown"] },
  { label: "Bronzo", key: "bronzo", aliases: ["bronzo", "bronze"] },
  { label: "Giallo", key: "giallo", aliases: ["giallo", "yellow"] },
  { label: "Grigio", key: "grigio", aliases: ["grigio", "gray", "grey"] },
  { label: "Verde", key: "verde", aliases: ["verde", "green"] },
  { label: "Rosso", key: "rosso", aliases: ["rosso", "red"] },
  { label: "Argento", key: "argento", aliases: ["argento", "silver"] },
  { label: "Lilla", key: "lilla", aliases: ["lilla", "lilac", "violet", "purple"] },
  { label: "Arancione", key: "arancione", aliases: ["arancione", "orange"] },
  { label: "Oro", key: "oro", aliases: ["oro", "gold"] },
] as const;

const COLOR_BY_KEY = new Map<string, string>(COLOR_DEFINITIONS.map((definition) => [definition.key, definition.label]));
const ALIAS_TO_KEY = new Map<string, string>();

for (const definition of COLOR_DEFINITIONS) {
  for (const alias of definition.aliases) {
    ALIAS_TO_KEY.set(alias, definition.key);
  }
}

export const VEHICLE_COLOR_OPTIONS = COLOR_DEFINITIONS.map((definition) => definition.label);

function normalizeColorToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactColorToken(value: string) {
  return value.replace(/\s+/g, "");
}

export function normalizeVehicleColorValue(value: unknown) {
  const normalized = normalizeColorToken(value);
  if (!normalized) {
    return "";
  }

  const compact = compactColorToken(normalized);

  if (compact.includes("blu") || compact.includes("azzurro") || compact.includes("blue") || compact.includes("lightblue")) {
    return "bluazzurro";
  }

  const directKey = ALIAS_TO_KEY.get(normalized) ?? ALIAS_TO_KEY.get(compact);
  if (directKey) {
    return directKey;
  }

  for (const [alias, key] of ALIAS_TO_KEY.entries()) {
    const compactAlias = compactColorToken(alias);
    if (compact.includes(compactAlias) || compactAlias.includes(compact)) {
      return key;
    }
  }

  return compact;
}

export function canonicalizeVehicleColorLabel(value: unknown) {
  const normalizedKey = normalizeVehicleColorValue(value);
  if (!normalizedKey) {
    return "";
  }

  return COLOR_BY_KEY.get(normalizedKey) ?? String(value ?? "").trim();
}
