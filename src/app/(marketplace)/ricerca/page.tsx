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
  brand: string;
  model: string;
  fuel: string;
  transmission: string;
  year: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  page: number;
};

const SORT_OPTIONS = [
  { value: "created_desc", label: "Data inserimento (piu recenti)" },
  { value: "created_asc", label: "Data inserimento (piu vecchi)" },
  { value: "price_asc", label: "Prezzo crescente" },
  { value: "price_desc", label: "Prezzo decrescente" },
  { value: "year_desc", label: "Anno piu recente" },
  { value: "year_asc", label: "Anno piu vecchio" },
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
      title: "Ricerca Veicoli | Dealer Platform",
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

  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.model) query = query.eq("model", filters.model);
  if (filters.fuel) query = query.eq("fuel", filters.fuel);
  if (filters.transmission) query = query.eq("transmission", filters.transmission);

  const yearValue = Number(filters.year);
  if (Number.isFinite(yearValue)) query = query.eq("year", yearValue);

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
      query = query.order("year", { ascending: true });
      break;
    case "year_desc":
      query = query.order("year", { ascending: false });
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
    .select("brand, model, fuel, transmission, year, dealers!inner(status)")
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .limit(MARKETPLACE_OPTIONS_LIMIT);

  if (error) {
    logMarketplaceQueryError("search", error);
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
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1950 + 1 }, (_, index) => String(currentYear - index));

  const hasPrev = filters.page > 1;
  const hasNext = filters.page < totalPages;
  const prevHref = hasPrev ? `/ricerca?${buildSearchParams({ ...filters, page: filters.page - 1 }).toString()}` : "/ricerca";
  const nextHref = `/ricerca?${buildSearchParams({ ...filters, page: filters.page + 1 }).toString()}`;

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

        <form className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8" method="GET" action="/ricerca">
          <input type="hidden" name="page" value="1" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SearchField label="Cerca" name="q" defaultValue={filters.q} placeholder="Marca, modello, versione" />
            <SearchSelect label="Marca" name="brand" defaultValue={filters.brand} options={brandOptions} />
            <SearchSelect label="Modello" name="model" defaultValue={filters.model} options={modelOptions} />
            <SearchSelect label="Alimentazione" name="fuel" defaultValue={filters.fuel} options={fuelOptions} />
            <SearchSelect label="Cambio" name="transmission" defaultValue={filters.transmission} options={transmissionOptions} />
            <SearchSelect label="Anno" name="year" defaultValue={filters.year} options={yearOptions} />
            <SearchField label="Prezzo minimo" name="minPrice" defaultValue={filters.minPrice} placeholder="Es. 10000" inputMode="numeric" />
            <SearchField label="Prezzo massimo" name="maxPrice" defaultValue={filters.maxPrice} placeholder="Es. 30000" inputMode="numeric" />
            <SearchSelect label="Ordinamento" name="sort" defaultValue={filters.sort} options={SORT_OPTIONS.map((option) => option.label)} values={SORT_OPTIONS.map((option) => option.value)} />
            <div className="flex items-end gap-3">
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                Cerca
              </button>
              <a href="/ricerca" className="inline-flex w-full items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Reset
              </a>
            </div>
          </div>
        </form>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Risultati</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{formatVehicleResultsText(totalCount)}</h2>
            </div>
            <Link href="/auto" className="rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Vai al catalogo
            </Link>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-[28px] bg-slate-50 px-6 py-10 text-center text-slate-600">Nessun veicolo corrisponde ai filtri selezionati.</div>
          ) : (
            <>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {results.map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.24)] sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  Pagina <span className="font-semibold text-slate-900">{filters.page}</span> di <span className="font-semibold text-slate-900">{totalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  {hasPrev ? (
                    <Link href={prevHref} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                      Precedente
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">
                      Precedente
                    </span>
                  )}
                  {hasNext ? (
                    <Link href={nextHref} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                      Successiva
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center justify-center rounded-2xl bg-slate-300 px-4 py-2 text-sm font-semibold text-white">
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

function parseSearchState(searchParams: SearchParams): SearchState {
  const sortCandidate = asValue(searchParams.sort);
  const sort = SORT_OPTIONS.some((option) => option.value === sortCandidate) ? sortCandidate : "created_desc";

  return {
    q: asValue(searchParams.q),
    brand: asValue(searchParams.brand),
    model: asValue(searchParams.model),
    fuel: asValue(searchParams.fuel),
    transmission: asValue(searchParams.transmission),
    year: asValue(searchParams.year),
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
    ["brand", filters.brand],
    ["model", filters.model],
    ["fuel", filters.fuel],
    ["transmission", filters.transmission],
    ["year", filters.year],
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
