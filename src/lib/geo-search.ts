import { CAP_TO_PLACE, COMUNI_BY_PROVINCE } from "@/lib/italian-geo-data";
import { ITALIAN_PROVINCES } from "@/lib/italian-locations";

// Solo lato server: importa il dataset dei comuni, che pesa parecchio.
// Un "use client" che risalga fino a qui lo spedirebbe a ogni visitatore.

// Rimangono esportate da qui per chi le usa insieme al resto della ricerca
// geografica; la definizione sta in un modulo leggero perche' la barra in home
// possa disegnare la tendina senza caricare il dataset dei comuni.
export { DEFAULT_DISTANCE_KM, DISTANCE_OPTIONS, parseDistanceKm } from "@/lib/search-distance";

export type GeoPoint = { lat: number; lng: number };
export type ResolvedPlace = GeoPoint & { name: string; province: string };
export type BoundingBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

const EARTH_RADIUS_KM = 6371;

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Parole di servizio nei nomi ufficiali dei comuni. Nessuno scrive "Reggio
// nell'Emilia" o "Reggio di Calabria": si scrive "Reggio Emilia" e "Reggio
// Calabria". Ignorarle nel confronto fa combaciare le due forme.
const FILLER_TOKENS = new Set([
  "di", "del", "dello", "della", "dei", "degli", "delle",
  "in", "nel", "nell", "nella", "nei", "negli", "nelle",
  "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle",
  "a", "al", "allo", "alla", "ai", "agli", "alle",
  "con", "e", "d", "l", "la", "il", "lo", "i", "gli", "le", "presso",
]);

function tokenize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function significantTokens(value: string) {
  return tokenize(value).filter((token) => !FILLER_TOKENS.has(token));
}

type IndexEntry = ResolvedPlace & { isProvinceCapital: boolean; tokens: Set<string> };

let nameIndex: Map<string, IndexEntry[]> | null = null;
let pointIndex: Map<string, GeoPoint> | null = null;

function buildIndexes() {
  if (nameIndex && pointIndex) return { nameIndex, pointIndex };

  const provinceNames = new Map<string, string>(
    ITALIAN_PROVINCES.map((province) => [province.code as string, normalizeName(province.name)]),
  );
  const byName = new Map<string, IndexEntry[]>();
  const byPoint = new Map<string, GeoPoint>();

  for (const [province, comuni] of Object.entries(COMUNI_BY_PROVINCE)) {
    for (const [name, lat, lng] of comuni) {
      const key = normalizeName(name);
      const entry: IndexEntry = {
        name,
        province,
        lat,
        lng,
        // Un capoluogo si riconosce dal nome uguale a quello della provincia.
        // Serve a sciogliere le omonimie: "Peglio" esiste in due province, ma
        // chi scrive "Firenze" intende il capoluogo, non una frazione omonima.
        isProvinceCapital: provinceNames.get(province) === key,
        tokens: new Set(tokenize(name)),
      };

      const list = byName.get(key);
      if (list) list.push(entry);
      else byName.set(key, [entry]);

      byPoint.set(`${province}|${key}`, { lat, lng });
    }
  }

  nameIndex = byName;
  pointIndex = byPoint;
  return { nameIndex: byName, pointIndex: byPoint };
}

/**
 * Coordinate di un comune a partire da come sono salvate sull'account della
 * concessionaria. `null` quando il punto non e' determinabile.
 *
 * La provincia serve a distinguere i comuni omonimi, non e' obbligatoria: le
 * concessionarie piu' vecchie hanno solo la citta' (l'attivazione demo non
 * copiava la provincia), e pretenderla le avrebbe fatte sparire in silenzio da
 * ogni ricerca per distanza. Senza provincia un nome unico si risolve lo
 * stesso; se invece e' ambiguo si preferisce restare senza punto piuttosto che
 * collocare una concessionaria a centinaia di chilometri da dove sta.
 */
export function resolveComunePoint(province: string | null | undefined, city: string | null | undefined): GeoPoint | null {
  const normalizedProvince = String(province ?? "").trim().toUpperCase();
  const normalizedCity = normalizeName(String(city ?? ""));
  if (!normalizedCity) return null;

  const { pointIndex: byPoint, nameIndex: byName } = buildIndexes();

  if (normalizedProvince) {
    const exact = byPoint.get(`${normalizedProvince}|${normalizedCity}`);
    if (exact) return exact;
  }

  const candidates = byName.get(normalizedCity);
  if (!candidates || candidates.length !== 1) return null;

  return { lat: candidates[0].lat, lng: candidates[0].lng };
}

/**
 * Interpreta quello che il visitatore scrive nel campo "Citta' o CAP".
 * Accetta "Milano", "milano", "20121", "Milano (MI)", "Milano, MI".
 */
export function resolvePlaceQuery(input: string | null | undefined): ResolvedPlace | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const { nameIndex: byName } = buildIndexes();

  // CAP: cinque cifre. Un CAP identifica il luogo meglio di un nome, quindi
  // viene provato per primo.
  const capMatch = raw.match(/\b\d{5}\b/);
  if (capMatch) {
    const place = CAP_TO_PLACE[capMatch[0]];
    if (place) {
      const [province, name] = place.split("|");
      const point = resolveComunePoint(province, name);
      if (point) return { name, province, ...point };
    }
  }

  // Indicazione esplicita della provincia: "Milano (MI)" oppure "Milano, MI".
  const provinceHint = raw.match(/[(,]\s*([A-Za-z]{2})\s*\)?\s*$/)?.[1]?.toUpperCase() ?? null;
  const key = normalizeName(raw.replace(/[(,]\s*[A-Za-z]{2}\s*\)?\s*$/, ""));

  const cityText = raw.replace(/[(,]\s*[A-Za-z]{2}\s*\)?\s*$/, "");
  const candidates = byName.get(key) ?? matchByTokens(cityText, provinceHint);
  if (candidates.length === 0) return null;

  if (provinceHint) {
    const exact = candidates.find((candidate) => candidate.province === provinceHint);
    if (exact) return { name: exact.name, province: exact.province, lat: exact.lat, lng: exact.lng };
  }

  const chosen = candidates.find((candidate) => candidate.isProvinceCapital) ?? candidates[0];
  return { name: chosen.name, province: chosen.province, lat: chosen.lat, lng: chosen.lng };
}

/**
 * Ripiego quando il nome scritto non combacia parola per parola con quello
 * ufficiale. I comuni si chiamano "Reggio nell'Emilia" e "Reggio di Calabria",
 * ma nessuno li scrive cosi': confrontare le parole significative invece della
 * stringa intera fa combaciare le due forme.
 *
 * Restano richieste tutte le parole scritte, quindi "reggio" da solo non
 * sceglie fra Emilia e Calabria. Se piu' comuni risultano ugualmente
 * plausibili si preferisce non rispondere: il messaggio "non riconosciuto" e'
 * meglio di risultati presi dall'altra parte d'Italia.
 */
function matchByTokens(cityText: string, provinceHint: string | null): IndexEntry[] {
  const wanted = significantTokens(cityText);
  if (wanted.length === 0) return [];

  const { nameIndex: byName } = buildIndexes();
  const scored: Array<{ entry: IndexEntry; extra: number }> = [];

  for (const entries of byName.values()) {
    for (const entry of entries) {
      if (provinceHint && entry.province !== provinceHint) continue;
      if (!wanted.every((token) => entry.tokens.has(token))) continue;

      const extra = [...entry.tokens].filter((token) => !FILLER_TOKENS.has(token) && !wanted.includes(token)).length;
      scored.push({ entry, extra });
    }
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    if (a.entry.isProvinceCapital !== b.entry.isProvinceCapital) return a.entry.isProvinceCapital ? -1 : 1;
    if (a.extra !== b.extra) return a.extra - b.extra;
    return a.entry.name.localeCompare(b.entry.name, "it");
  });

  const [best, runnerUp] = scored;
  const tied =
    runnerUp && runnerUp.entry.isProvinceCapital === best.entry.isProvinceCapital && runnerUp.extra === best.extra;

  return tied ? [] : [best.entry];
}

/** Distanza in linea d'aria fra due punti, in chilometri. */
export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Rettangolo che contiene il cerchio. Serve solo a scartare in fretta i punti
 * lontani: gli angoli del rettangolo stanno fuori dal cerchio, quindi il
 * risultato va sempre rifinito con distanceKm.
 */
export function boundingBox(center: GeoPoint, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32;
  // Un grado di longitudine si accorcia salendo di latitudine: a Bolzano vale
  // circa 76 km, a Lampedusa 88. Il coseno tiene conto della differenza.
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const lngDelta = radiusKm / (111.32 * Math.max(0.01, Math.abs(cos)));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

export function isWithinBox(point: GeoPoint, box: BoundingBox) {
  return point.lat >= box.minLat && point.lat <= box.maxLat && point.lng >= box.minLng && point.lng <= box.maxLng;
}

