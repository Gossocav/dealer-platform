import Link from "next/link";
import { formatMileage, formatPrice, formatText, normalizeVehicleDealerName, publicSupabase, resolveDealerSlug, resolveVehicleImageUrl, resolveVehicleImages, resolveVehicleLabel, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type SearchState = {
  q: string;
  brand: string;
  priceBand: string;
  city: string;
  fuel: string;
  transmission: string;
  year: string;
  minPrice: string;
  maxPrice: string;
};

const DEFAULT_STATE: SearchState = {
  q: "",
  brand: "",
  priceBand: "",
  city: "",
  fuel: "",
  transmission: "",
  year: "",
  minPrice: "",
  maxPrice: "",
};

export default async function AdvancedSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchState(resolvedSearchParams);

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)")
    .eq("status", "published")
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

  const vehicles = (data ?? []) as MarketplaceVehicle[];
  const results = vehicles.filter((vehicle) => matchesFilters(vehicle, filters));
  const brandOptions = uniqueValues(vehicles.map((vehicle) => vehicle.brand));
  const cityOptions = uniqueValues(vehicles.map((vehicle) => vehicle.city));
  const fuelOptions = uniqueValues(vehicles.map((vehicle) => vehicle.fuel));
  const transmissionOptions = uniqueValues(vehicles.map((vehicle) => vehicle.transmission));
  const yearOptions = uniqueValues(vehicles.map((vehicle) => String(vehicle.year ?? "")));
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
            Filtra il marketplace per città, alimentazione, cambio, anno e fascia prezzo.
          </p>
        </section>

        <form className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SearchField label="Cerca" name="q" defaultValue={filters.q} placeholder="Marca, modello, versione" />
            <SearchSelect label="Marca" name="brand" defaultValue={filters.brand} options={brandOptions} />
            <SearchSelect label="Prezzo" name="priceBand" defaultValue={filters.priceBand} options={priceBandOptions.map((option) => option.label)} values={priceBandOptions.map((option) => option.value)} />
            <SearchSelect label="Città" name="city" defaultValue={filters.city} options={cityOptions} />
            <SearchSelect label="Alimentazione" name="fuel" defaultValue={filters.fuel} options={fuelOptions} />
            <SearchSelect label="Cambio" name="transmission" defaultValue={filters.transmission} options={transmissionOptions} />
            <SearchSelect label="Anno" name="year" defaultValue={filters.year} options={yearOptions} />
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
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{results.length} veicolo{results.length === 1 ? "" : "i"} trovato{results.length === 1 ? "" : "i"}</h2>
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
          <Spec label="Anno" value={formatText(vehicle.year)} />
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
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function parseSearchState(searchParams: SearchParams): SearchState {
  return {
    q: asValue(searchParams.q),
    brand: asValue(searchParams.brand),
    priceBand: asValue(searchParams.priceBand),
    city: asValue(searchParams.city),
    fuel: asValue(searchParams.fuel),
    transmission: asValue(searchParams.transmission),
    year: asValue(searchParams.year),
    minPrice: asValue(searchParams.minPrice),
    maxPrice: asValue(searchParams.maxPrice),
  };
}

function matchesFilters(vehicle: MarketplaceVehicle, filters: SearchState) {
  const normalizedQuery = filters.q.trim().toLowerCase();
  const haystack = [vehicle.brand, vehicle.model, vehicle.version, vehicle.city, vehicle.fuel, vehicle.transmission]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
  const matchesBrand = !filters.brand || formatText(vehicle.brand).toLowerCase() === filters.brand.toLowerCase();
  const matchesBand = !filters.priceBand || matchesPriceBand(Number(vehicle.price ?? 0), filters.priceBand);
  const matchesCity = !filters.city || formatText(vehicle.city).toLowerCase() === filters.city.toLowerCase();
  const matchesFuel = !filters.fuel || formatText(vehicle.fuel).toLowerCase() === filters.fuel.toLowerCase();
  const matchesTransmission = !filters.transmission || formatText(vehicle.transmission).toLowerCase() === filters.transmission.toLowerCase();
  const matchesYear = !filters.year || formatText(vehicle.year).toLowerCase() === filters.year.toLowerCase();
  const priceValue = Number(vehicle.price ?? 0);
  const minPrice = filters.minPrice ? Number(filters.minPrice) : Number.NEGATIVE_INFINITY;
  const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : Number.POSITIVE_INFINITY;
  const matchesPrice = Number.isFinite(priceValue) && priceValue >= minPrice && priceValue <= maxPrice;

  return matchesQuery && matchesBrand && matchesBand && matchesCity && matchesFuel && matchesTransmission && matchesYear && matchesPrice;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => formatText(value)).filter((value) => value !== "-"))).sort((a, b) => a.localeCompare(b, "it-IT"));
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
