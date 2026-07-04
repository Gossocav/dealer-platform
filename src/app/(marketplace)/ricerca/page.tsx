import Link from "next/link";
import { ITALIAN_PROVINCES } from "@/lib/italian-provinces";
import { formatMileage, formatPrice, formatText, getMarketplaceStatusFilter, normalizeVehicleDealerName, publicSupabase, resolveDealerSlug, resolveVehicleImageUrl, resolveVehicleImages, resolveVehicleLabel, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type SearchState = {
  q: string;
  brand: string;
  model: string;
  interiorType: string;
  priceBand: string;
  province: string;
  fuel: string;
  transmission: string;
  traction: string;
  yearFrom: string;
  yearTo: string;
  kmFrom: string;
  kmTo: string;
  minPrice: string;
  maxPrice: string;
};

const DEFAULT_STATE: SearchState = {
  q: "",
  brand: "",
  model: "",
  interiorType: "",
  priceBand: "",
  province: "",
  fuel: "",
  transmission: "",
  traction: "",
  yearFrom: "",
  yearTo: "",
  kmFrom: "",
  kmTo: "",
  minPrice: "",
  maxPrice: "",
};

export default async function AdvancedSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchState(resolvedSearchParams);

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, interior_type, year, registration_date, mileage, price, fuel, transmission, traction, city, province, status, created_at, dealer_id, dealers(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)")
    .or(getMarketplaceStatusFilter())
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Ricerca avanzata</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Ricerca non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{error.message || "Non siamo riusciti a caricare i veicoli."}</p>
        </div>
      </main>
    );
  }

  const vehicles = ((data ?? []) as unknown) as MarketplaceVehicle[];
  const results = vehicles.filter((vehicle) => matchesFilters(vehicle, filters));

  const brandOptions = uniqueValues(vehicles.map((vehicle) => vehicle.brand));
  const modelSource = filters.brand
    ? vehicles.filter((vehicle) => formatText(vehicle.brand).toLowerCase() === filters.brand.toLowerCase())
    : vehicles;
  const modelOptions = uniqueValues(modelSource.map((vehicle) => vehicle.model));
  const provinceOptions = ITALIAN_PROVINCES.map((province) => `${province.name} (${province.code})`);
  const provinceValues = ITALIAN_PROVINCES.map((province) => province.code);
  const fuelOptions = uniqueValues(vehicles.map((vehicle) => vehicle.fuel));
  const transmissionOptions = uniqueValues(vehicles.map((vehicle) => vehicle.transmission));
  const tractionOptions = buildTractionFilterOptions(vehicles);
  const interiorTypeOptions = ["Interni in pelle", "Interni in pelle e Alcantara", "Interni in tessuto e Alcantara", "Interni in tessuto"];
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1950 + 1 }, (_, index) => String(currentYear - index));
  const kmValues = buildMileageFilterValues();
  const kmLabels = kmValues.map((value) => new Intl.NumberFormat("it-IT").format(Number(value)));
  const priceBandOptions = [
    { label: "Fino a 15.000 €", value: "0-15000" },
    { label: "15.000 - 25.000 €", value: "15000-25000" },
    { label: "25.000 - 40.000 €", value: "25000-40000" },
    { label: "Oltre 40.000 €", value: "40000-99999999" },
  ];

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Ricerca avanzata</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Trova il veicolo giusto in pochi secondi.</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Filtra il marketplace per provincia, alimentazione, cambio, anno e fascia prezzo.
          </p>
        </section>

        <form className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SearchField label="Cerca" name="q" defaultValue={filters.q} placeholder="Marca, modello, versione" />
            <SearchSelect label="Marca" name="brand" defaultValue={filters.brand} options={brandOptions} />
            <SearchSelect label="Modello" name="model" defaultValue={filters.model} options={modelOptions} />
            <SearchSelect label="Interni" name="interiorType" defaultValue={filters.interiorType} options={interiorTypeOptions} />
            <SearchSelect label="Prezzo" name="priceBand" defaultValue={filters.priceBand} options={priceBandOptions.map((option) => option.label)} values={priceBandOptions.map((option) => option.value)} />
            <SearchSelect label="Provincia" name="province" defaultValue={filters.province} options={provinceOptions} values={provinceValues} />
            <SearchSelect label="Alimentazione" name="fuel" defaultValue={filters.fuel} options={fuelOptions} />
            <SearchSelect label="Cambio" name="transmission" defaultValue={filters.transmission} options={transmissionOptions} />
            <SearchSelect label="Trazione" name="traction" defaultValue={filters.traction} options={tractionOptions.map((option) => option.label)} values={tractionOptions.map((option) => option.value)} />
            <SearchSelect label="Anno da" name="yearFrom" defaultValue={filters.yearFrom} options={yearOptions} />
            <SearchSelect label="Anno a" name="yearTo" defaultValue={filters.yearTo} options={yearOptions} />
            <SearchSelect label="KM da" name="kmFrom" defaultValue={filters.kmFrom} options={kmLabels} values={kmValues} />
            <SearchSelect label="KM a" name="kmTo" defaultValue={filters.kmTo} options={kmLabels} values={kmValues} />
            <SearchField label="Prezzo minimo" name="minPrice" defaultValue={filters.minPrice} placeholder="Es. 10000" inputMode="numeric" />
            <SearchField label="Prezzo massimo" name="maxPrice" defaultValue={filters.maxPrice} placeholder="Es. 30000" inputMode="numeric" />
            <div className="flex items-end gap-3">
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                Cerca
              </button>
              <Link href="/ricerca" className="inline-flex w-full items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Reset
              </Link>
            </div>
          </div>
        </form>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Risultati</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{formatVehicleResultsText(results.length)}</h2>
            </div>
            <Link href="/auto" className="rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Vai al catalogo
            </Link>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-[28px] bg-slate-50 px-6 py-10 text-center text-slate-600">Nessun veicolo corrisponde ai filtri selezionati.</div>
          ) : (
            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {results.map((vehicle) => (
                <SearchResultCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

async function SearchResultCard({ vehicle }: { vehicle: MarketplaceVehicle }) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const coverUrl = cover ? await resolveVehicleImageUrl(cover) : null;
  const dealerSlug = resolveDealerSlug(vehicle.dealers);

  const registrationDate = resolveVehicleRegistrationDate(vehicle);

  return (
    <article className="group overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.22)] transition hover:-translate-y-1 hover:shadow-[0_40px_120px_-40px_rgba(15,23,42,0.34)]">
      <div className="h-52 bg-slate-200">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : null}
      </div>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">{formatText(normalizeVehicleDealerName(vehicle.dealers))}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{resolveVehicleLabel(vehicle)}</h3>
          <p className="mt-2 text-sm text-slate-600">{formatText(vehicle.city)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Spec label={"Data\u00A0imm.ne"} value={registrationDate} />
          <Spec label="Prezzo" value={formatPrice(vehicle.price)} />
          <Spec label="Km" value={formatMileage(vehicle.mileage)} />
          <Spec label="Cambio" value={formatText(vehicle.transmission)} />
        </div>
        <div className="flex gap-2 pt-1">
          <Link href={`/auto/${vehicle.id}`} className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            Visualizza
          </Link>
          <Link href={`/concessionarie/${dealerSlug}`} className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
            Concessionaria
          </Link>
        </div>
      </div>
    </article>
  );
}

function resolveVehicleRegistrationDate(vehicle: MarketplaceVehicle) {
  const source = vehicle as Record<string, unknown>;
  const candidates = [
    source.registration_date,
    source.registrationDate,
    source.first_registration_date,
    source.immatricolazione,
    source.data_immatricolazione,
  ];

  for (const value of candidates) {
    const normalized = String(value ?? "").trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return "—";
}

function SearchField({ label, name, defaultValue, placeholder, inputMode }: { label: string; name: string; defaultValue: string; placeholder: string; inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function SearchSelect({
  label,
  name,
  defaultValue,
  options,
  values,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
  values?: string[];
}) {
  const finalValues = values ?? options;

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      >
        <option value="">Tutti</option>
        {options.map((option, index) => (
          <option key={option} value={finalValues[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full min-h-[6.5rem] flex-col justify-start rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.18em] whitespace-normal break-words text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-tight break-words text-slate-900">{value}</p>
    </div>
  );
}

function parseSearchState(searchParams: SearchParams): SearchState {
  const yearFrom = asValue(searchParams.yearFrom);
  const yearToRaw = asValue(searchParams.yearTo);
  const yearFromValue = Number(yearFrom);
  const yearToValue = Number(yearToRaw);
  const yearTo =
    yearFrom && yearToRaw && Number.isFinite(yearFromValue) && Number.isFinite(yearToValue) && yearFromValue > yearToValue
      ? ""
      : yearToRaw;
  const kmFrom = asValue(searchParams.kmFrom);
  const kmToRaw = asValue(searchParams.kmTo);
  const kmFromValue = normalizeMileage(kmFrom);
  const kmToValue = normalizeMileage(kmToRaw);
  const kmTo =
    kmFromValue !== null && kmToValue !== null && kmFromValue > kmToValue
      ? ""
      : kmToRaw;

  return {
    q: asValue(searchParams.q),
    brand: asValue(searchParams.brand),
    model: asValue(searchParams.model),
    interiorType: asValue(searchParams.interiorType),
    priceBand: asValue(searchParams.priceBand),
    province: normalizeProvinceCode(asValue(searchParams.province)),
    fuel: asValue(searchParams.fuel),
    transmission: asValue(searchParams.transmission),
    traction: asValue(searchParams.traction),
    yearFrom,
    yearTo,
    kmFrom,
    kmTo,
    minPrice: asValue(searchParams.minPrice),
    maxPrice: asValue(searchParams.maxPrice),
  };
}

function matchesFilters(vehicle: MarketplaceVehicle, filters: SearchState) {
  return getVehicleExclusionReasons(vehicle, filters).length === 0;
}

function getVehicleExclusionReasons(vehicle: MarketplaceVehicle, filters: SearchState) {
  const reasons: string[] = [];
  const normalizedQuery = filters.q.trim().toLowerCase();
  const haystack = [vehicle.brand, vehicle.model, vehicle.version, vehicle.city, vehicle.province, vehicle.fuel, vehicle.transmission, vehicle.traction, vehicle.interior_type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
  if (!matchesQuery) reasons.push("q");

  const matchesBrand = !filters.brand || formatText(vehicle.brand).toLowerCase() === filters.brand.toLowerCase();
  if (!matchesBrand) reasons.push("brand");

  const matchesModel = !filters.model || formatText(vehicle.model).toLowerCase() === filters.model.toLowerCase();
  if (!matchesModel) reasons.push("model");

  const matchesInteriorType = !filters.interiorType || formatText(vehicle.interior_type).toLowerCase() === filters.interiorType.toLowerCase();
  if (!matchesInteriorType) reasons.push("interiorType");

  const hasPriceBandFilter = Boolean(filters.priceBand);
  const hasMinPriceFilter = filters.minPrice.trim() !== "";
  const hasMaxPriceFilter = filters.maxPrice.trim() !== "";
  const hasPriceFilter = hasPriceBandFilter || hasMinPriceFilter || hasMaxPriceFilter;
  const priceValue = Number(vehicle.price ?? 0);
  const matchesBand = !hasPriceBandFilter || (Number.isFinite(priceValue) && matchesPriceBand(priceValue, filters.priceBand));
  if (!matchesBand) reasons.push("priceBand");

  const selectedProvinceCode = normalizeProvinceCode(filters.province);
  const vehicleProvinceCode = normalizeProvinceCode(formatText(vehicle.province));
  const matchesProvince = !selectedProvinceCode || vehicleProvinceCode === selectedProvinceCode;
  if (!matchesProvince) reasons.push("province");

  const matchesFuel = !filters.fuel || formatText(vehicle.fuel).toLowerCase() === filters.fuel.toLowerCase();
  if (!matchesFuel) reasons.push("fuel");

  const matchesTransmission = !filters.transmission || formatText(vehicle.transmission).toLowerCase() === filters.transmission.toLowerCase();
  if (!matchesTransmission) reasons.push("transmission");

  const filterTraction = normalizeTractionFilterValue(filters.traction);
  const vehicleTraction = normalizeTractionFilterValue(vehicle.traction);
  const matchesTraction = !filterTraction || (vehicleTraction.length > 0 && vehicleTraction === filterTraction);
  if (!matchesTraction) reasons.push("traction");

  const vehicleYear = Number(formatText(vehicle.year));
  const yearFrom = filters.yearFrom ? Number(filters.yearFrom) : Number.NEGATIVE_INFINITY;
  const yearTo = filters.yearTo ? Number(filters.yearTo) : Number.POSITIVE_INFINITY;
  const hasYearFilter = Boolean(filters.yearFrom || filters.yearTo);
  const matchesYear = !hasYearFilter || (Number.isFinite(vehicleYear) && vehicleYear >= yearFrom && vehicleYear <= yearTo);
  if (!matchesYear) reasons.push("year");

  const mileageValue = normalizeMileage(resolveVehicleMileageValue(vehicle));
  const kmFromValue = normalizeMileage(filters.kmFrom);
  const kmToValue = normalizeMileage(filters.kmTo);
  const kmFrom = kmFromValue ?? Number.NEGATIVE_INFINITY;
  const kmTo = kmToValue ?? Number.POSITIVE_INFINITY;
  const hasMileageFilter = kmFromValue !== null || kmToValue !== null;
  const matchesMileage = !hasMileageFilter || (mileageValue !== null && mileageValue >= kmFrom && mileageValue <= kmTo);
  if (!matchesMileage) reasons.push("mileage");

  const minPrice = filters.minPrice ? Number(filters.minPrice) : Number.NEGATIVE_INFINITY;
  const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : Number.POSITIVE_INFINITY;
  const matchesPrice = !hasPriceFilter || (Number.isFinite(priceValue) && priceValue >= minPrice && priceValue <= maxPrice);
  if (!matchesPrice) reasons.push("price");

  return reasons;
}

function normalizeProvinceCode(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  const upper = normalized.toUpperCase();
  if (ITALIAN_PROVINCES.some((province) => province.code === upper)) {
    return upper;
  }

  const fromBracket = upper.match(/\(([A-Z]{2})\)$/)?.[1] ?? "";
  if (fromBracket && ITALIAN_PROVINCES.some((province) => province.code === fromBracket)) {
    return fromBracket;
  }

  const byName = ITALIAN_PROVINCES.find((province) => province.name.toLowerCase() === normalized.toLowerCase());
  return byName?.code ?? "";
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => formatText(value)).filter((value) => value !== "-"))).sort((a, b) => a.localeCompare(b, "it-IT"));
}

function buildTractionFilterOptions(vehicles: MarketplaceVehicle[]) {
  const options = new Map<string, string>();

  for (const vehicle of vehicles) {
    const normalized = normalizeTractionFilterValue(vehicle.traction);
    if (!normalized) {
      continue;
    }

    if (normalized === "anteriore") {
      options.set(normalized, "Anteriore");
      continue;
    }

    if (normalized === "posteriore") {
      options.set(normalized, "Posteriore");
      continue;
    }

    if (normalized === "integrale") {
      options.set(normalized, "Integrale / 4x4");
      continue;
    }

    options.set(normalized, formatText(vehicle.traction));
  }

  return Array.from(options.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "it-IT"));
}

function normalizeTractionFilterValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const compact = normalized.replace(/\s+/g, "");

  if (
    normalized.includes("integrale") ||
    compact.includes("4x4") ||
    compact.includes("4wd") ||
    compact.includes("awd") ||
    compact.includes("quattroruotemotrici")
  ) {
    return "integrale";
  }

  if (
    normalized.includes("anteriore") ||
    compact.includes("fwd") ||
    compact.includes("frontwheel")
  ) {
    return "anteriore";
  }

  if (
    normalized.includes("posteriore") ||
    compact.includes("rwd") ||
    compact.includes("rearwheel")
  ) {
    return "posteriore";
  }

  return compact;
}

function formatVehicleResultsText(count: number) {
  return count === 1 ? "1 veicolo trovato" : `${count} veicoli trovati`;
}

function buildMileageFilterValues() {
  const values: string[] = [];

  for (let mileage = 0; mileage <= 100000; mileage += 5000) {
    values.push(String(mileage));
  }

  for (let mileage = 110000; mileage <= 200000; mileage += 10000) {
    values.push(String(mileage));
  }

  return values;
}

function normalizeMileage(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const rawValue = String(value).trim().toLowerCase();
  if (!rawValue) {
    return null;
  }

  const cleaned = rawValue
    .replace(/km/g, "")
    .replace(/\s+/g, "")
    .replace(/'/g, "")
    // Remove decimal tails like .00 or ,00 before stripping separators.
    .replace(/[.,]\d{1,2}$/g, "")
    .replace(/[.,]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) {
    return null;
  }

  const normalized = Number(digitsOnly);
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveVehicleMileageValue(vehicle: MarketplaceVehicle) {
  // Keep filtering aligned with what cards display: vehicle.mileage.
  return vehicle.mileage;
}

function matchesPriceBand(price: number, priceBand: string) {
  const [min, max] = priceBand.split("-").map((value) => Number(value));
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return true;
  }

  return price >= min && price <= max;
}

function asValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
