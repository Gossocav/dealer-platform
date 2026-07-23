import type { Metadata } from "next";
import Link from "next/link";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, formatText, logMarketplaceQueryError, publicSupabase, toAbsoluteUrl, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

const MARKETPLACE_SEARCH_PAGE_SIZE = 24;
const MARKETPLACE_OPTIONS_LIMIT = 1000;

type SearchParams = Record<string, string | string[] | undefined>;

type SearchState = {
  q: string;
  vehicleCategory: string;
  vehicleCondition: string;
  bodyType: string;
  brand: string;
  model: string;
  fuel: string;
  transmission: string;
  yearFrom: string;
  yearTo: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  page: number;
};

const VEHICLE_CATEGORY_OPTIONS = ["Auto", "Veicolo commerciale"] as const;

const VEHICLE_CONDITION_OPTIONS = ["Nuovo", "Usato", "Aziendale", "Km/0"] as const;

const BODY_TYPE_OPTIONS = ["SUV/Pick-up", "Berlina", "Station Wagon", "City Car", "Monovolume", "Coupé", "Cabrio", "Furgone/Van"] as const;

const SORT_OPTIONS = [
  { value: "created_desc", label: "Data inserimento (piu recenti)" },
  { value: "created_asc", label: "Data inserimento (piu vecchi)" },
  { value: "price_asc", label: "Prezzo crescente" },
  { value: "price_desc", label: "Prezzo decrescente" },
  { value: "year_desc", label: "Immatricolazione piu recente" },
  { value: "year_asc", label: "Immatricolazione piu vecchia" },
  { value: "mileage_asc", label: "Km crescente" },
  { value: "mileage_desc", label: "Km decrescente" },
] as const;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const resolved = await searchParams;
  const filters = parseSearchState(resolved);
  const params = buildSearchParams(filters);
  const queryString = params.toString();
  const canonicalPath = queryString ? `/ricerca?${queryString}` : "/ricerca";
  const description = "Ricerca avanzata veicoli: filtra per marca, modello, prezzo, alimentazione, cambio e anno.";
  const canonical = toAbsoluteUrl(canonicalPath);

  return {
    title: filters.page > 1 ? `Ricerca Veicoli - Pagina ${filters.page}` : "Ricerca Veicoli",
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: "Ricerca Veicoli | KeyAuto",
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function AdvancedSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchState(resolvedSearchParams);
  const from = (filters.page - 1) * MARKETPLACE_SEARCH_PAGE_SIZE;
  const to = from + MARKETPLACE_SEARCH_PAGE_SIZE - 1;

  let query = publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, interior_type, year, registration_date, mileage, price, fuel, transmission, traction, color, city, province, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status), vehicle_images(image_url, position, is_cover)",
      { count: "exact" }
    )
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

  if (filters.q) {
    const safeQ = filters.q.replace(/[,%]/g, " ").trim();
    if (safeQ) {
      query = query.or(`brand.ilike.%${safeQ}%,model.ilike.%${safeQ}%,version.ilike.%${safeQ}%`);
    }
  }

  if (filters.vehicleCategory) query = query.eq("vehicle_category", filters.vehicleCategory);
  if (filters.vehicleCondition) query = query.eq("vehicle_condition", filters.vehicleCondition);
  if (filters.bodyType) query = query.eq("body_type", filters.bodyType);
  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.model) query = query.eq("model", filters.model);
  if (filters.fuel) query = query.eq("fuel", filters.fuel);
  if (filters.transmission) query = query.eq("transmission", filters.transmission);

  // "Anno da / Anno a" filtra sulla data di immatricolazione reale
  // (registration_date), non sulla colonna year: e' il dato che il
  // concessionario compila davvero tramite il calendario nel modulo veicolo.
  // I due estremi sono indipendenti (si puo' impostare solo "da" o solo "a")
  // e vengono scambiati automaticamente se inseriti in ordine inverso.
  const parsedYearFrom = parseSearchYear(filters.yearFrom);
  const parsedYearTo = parseSearchYear(filters.yearTo);
  const yearFrom = parsedYearFrom !== null && parsedYearTo !== null ? Math.min(parsedYearFrom, parsedYearTo) : parsedYearFrom;
  const yearTo = parsedYearFrom !== null && parsedYearTo !== null ? Math.max(parsedYearFrom, parsedYearTo) : parsedYearTo;

  if (yearFrom !== null) query = query.gte("registration_date", `${yearFrom}-01-01`);
  if (yearTo !== null) query = query.lte("registration_date", `${yearTo}-12-31`);

  const minPrice = parseNullableNumber(filters.minPrice);
  const maxPrice = parseNullableNumber(filters.maxPrice);
  if (minPrice !== null) query = query.gte("price", minPrice);
  if (maxPrice !== null) query = query.lte("price", maxPrice);

  switch (filters.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "year_asc":
      query = query.order("registration_date", { ascending: true });
      break;
    case "year_desc":
      query = query.order("registration_date", { ascending: false });
      break;
    case "mileage_asc":
      query = query.order("mileage", { ascending: true });
      break;
    case "mileage_desc":
      query = query.order("mileage", { ascending: false });
      break;
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data, error, count } = await query.range(from, to);

  const { data: optionRows } = await publicSupabase
    .from("vehicles")
    .select("brand, model, fuel, transmission, registration_date, dealers!inner(status)")
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .limit(MARKETPLACE_OPTIONS_LIMIT);

  if (error) {
    logMarketplaceQueryError("search", error);
    return (
      <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 p-8 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Ricerca avanzata</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Ricerca non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">{error.message || "Non siamo riusciti a caricare i veicoli."}</p>
        </div>
      </main>
    );
  }

  const results = ((data ?? []) as unknown) as MarketplaceVehicle[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / MARKETPLACE_SEARCH_PAGE_SIZE));

  const optionData = Array.isArray(optionRows) ? optionRows : [];
  const brandOptions = uniqueValues(optionData.map((row) => (row as { brand?: string | null }).brand));
  const modelSource = filters.brand
    ? optionData.filter((row) => formatText((row as { brand?: string | null }).brand).toLowerCase() === filters.brand.toLowerCase())
    : optionData;
  const modelOptions = uniqueValues(modelSource.map((row) => (row as { model?: string | null }).model));
  const fuelOptions = uniqueValues(optionData.map((row) => (row as { fuel?: string | null }).fuel));
  const transmissionOptions = uniqueValues(optionData.map((row) => (row as { transmission?: string | null }).transmission));
  // Elenco anni derivato dalle date di immatricolazione realmente presenti,
  // cosi' come marca/alimentazione/cambio: nessun anno "vuoto" in elenco.
  const yearOptions = Array.from(
    new Set(
      optionData
        .map((row) => String((row as { registration_date?: string | null }).registration_date ?? "").slice(0, 4))
        .filter((year) => /^\d{4}$/.test(year))
    )
  ).sort((a, b) => Number(b) - Number(a));

  const hasPrev = filters.page > 1;
  const hasNext = filters.page < totalPages;
  const prevHref = hasPrev ? `/ricerca?${buildSearchParams({ ...filters, page: filters.page - 1 }).toString()}` : "/ricerca";
  const nextHref = `/ricerca?${buildSearchParams({ ...filters, page: filters.page + 1 }).toString()}`;

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Ricerca avanzata</p>
          <h1 className="relative mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ textWrap: "balance" }}>
            Trova il veicolo giusto in pochi secondi.
          </h1>
          <p className="relative mt-4 max-w-3xl text-base leading-7 text-slate-400 sm:text-lg">
            Filtra il marketplace per provincia, alimentazione, cambio, anno e fascia prezzo.
          </p>
        </section>

        <form className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8" method="GET" action="/ricerca">
          <input type="hidden" name="page" value="1" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SearchField label="Cerca" name="q" defaultValue={filters.q} placeholder="Marca, modello, versione" />
            <SearchSelect label="Tipo veicolo" name="vehicleCategory" defaultValue={filters.vehicleCategory} options={[...VEHICLE_CATEGORY_OPTIONS]} />
            <SearchSelect label="Condizioni" name="vehicleCondition" defaultValue={filters.vehicleCondition} options={[...VEHICLE_CONDITION_OPTIONS]} />
            <SearchSelect label="Carrozzeria" name="bodyType" defaultValue={filters.bodyType} options={[...BODY_TYPE_OPTIONS]} />
            <SearchSelect label="Marca" name="brand" defaultValue={filters.brand} options={brandOptions} />
            <SearchSelect label="Modello" name="model" defaultValue={filters.model} options={modelOptions} />
            <SearchSelect label="Alimentazione" name="fuel" defaultValue={filters.fuel} options={fuelOptions} />
            <SearchSelect label="Cambio" name="transmission" defaultValue={filters.transmission} options={transmissionOptions} />
            <SearchSelect label="Anno da" name="yearFrom" defaultValue={filters.yearFrom} options={yearOptions} />
            <SearchSelect label="Anno a" name="yearTo" defaultValue={filters.yearTo} options={yearOptions} />
            <SearchField label="Prezzo minimo" name="minPrice" defaultValue={filters.minPrice} placeholder="Es. 10000" inputMode="numeric" />
            <SearchField label="Prezzo massimo" name="maxPrice" defaultValue={filters.maxPrice} placeholder="Es. 30000" inputMode="numeric" />
            <SearchSelect label="Ordinamento" name="sort" defaultValue={filters.sort} options={SORT_OPTIONS.map((option) => option.label)} values={SORT_OPTIONS.map((option) => option.value)} />
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
              >
                Cerca
              </button>
              <a href="/ricerca" className="inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                Reset
              </a>
            </div>
          </div>
        </form>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Risultati</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{formatVehicleResultsText(totalCount)}</h2>
            </div>
            <Link
              href="/auto"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Vai al catalogo
            </Link>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center text-slate-400">
              Nessun veicolo corrisponde ai filtri selezionati.
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {results.map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  Pagina <span className="font-semibold text-white">{filters.page}</span> di <span className="font-semibold text-white">{totalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  {hasPrev ? (
                    <Link href={prevHref} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                      Precedente
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full border border-white/5 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-600">
                      Precedente
                    </span>
                  )}
                  {hasNext ? (
                    <Link
                      href={nextHref}
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:brightness-105"
                    >
                      Successiva
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-slate-500">
                      Successiva
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SearchField({ label, name, defaultValue, placeholder, inputMode }: { label: string; name: string; defaultValue: string; placeholder: string; inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        suppressHydrationWarning
        style={{ color: "#f8fafc" }}
        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:bg-white/[0.06]"
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
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        style={{ color: "#f8fafc", colorScheme: "dark" }}
        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06]"
      >
        <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
          Tutti
        </option>
        {options.map((option, index) => (
          <option key={option} value={finalValues[index] ?? option} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseSearchState(searchParams: SearchParams): SearchState {
  const sortCandidate = asValue(searchParams.sort);
  const sort = SORT_OPTIONS.some((option) => option.value === sortCandidate) ? sortCandidate : "created_desc";

  return {
    q: asValue(searchParams.q),
    vehicleCategory: asValue(searchParams.vehicleCategory),
    vehicleCondition: asValue(searchParams.vehicleCondition),
    bodyType: asValue(searchParams.bodyType),
    brand: asValue(searchParams.brand),
    model: asValue(searchParams.model),
    fuel: asValue(searchParams.fuel),
    transmission: asValue(searchParams.transmission),
    yearFrom: asValue(searchParams.yearFrom),
    yearTo: asValue(searchParams.yearTo),
    minPrice: asValue(searchParams.minPrice),
    maxPrice: asValue(searchParams.maxPrice),
    sort,
    page: parsePage(searchParams.page),
  };
}

function buildSearchParams(filters: SearchState) {
  const params = new URLSearchParams();

  const entries: Array<[string, string]> = [
    ["q", filters.q],
    ["vehicleCategory", filters.vehicleCategory],
    ["vehicleCondition", filters.vehicleCondition],
    ["bodyType", filters.bodyType],
    ["brand", filters.brand],
    ["model", filters.model],
    ["fuel", filters.fuel],
    ["transmission", filters.transmission],
    ["yearFrom", filters.yearFrom],
    ["yearTo", filters.yearTo],
    ["minPrice", filters.minPrice],
    ["maxPrice", filters.maxPrice],
  ];

  for (const [key, value] of entries) {
    const normalized = value.trim();
    if (normalized) {
      params.set(key, normalized);
    }
  }

  if (filters.sort && filters.sort !== "created_desc") {
    params.set("sort", filters.sort);
  }

  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  return params;
}

function parsePage(value: string | string[] | undefined) {
  const numeric = Number(asValue(value));
  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }
  return Math.floor(numeric);
}

function parseNullableNumber(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseSearchYear(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const yearValue = Number(normalized);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(yearValue) || yearValue < 1900 || yearValue > currentYear + 1) {
    return null;
  }

  return yearValue;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => formatText(value)).filter((value) => value !== "-"))).sort((a, b) => a.localeCompare(b, "it-IT"));
}

function asValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : String(value ?? "");
}

function formatVehicleResultsText(count: number) {
  return count === 1 ? "1 veicolo trovato" : `${count} veicoli trovati`;
}
