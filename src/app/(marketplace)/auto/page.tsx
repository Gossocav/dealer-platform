import type { Metadata } from "next";
import Link from "next/link";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, logMarketplaceQueryError, publicSupabase, toAbsoluteUrl, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

const MARKETPLACE_CATALOG_PAGE_SIZE = 24;

// Stessi criteri di ordinamento di /ricerca, cosi' il comportamento resta
// identico in tutto il marketplace pubblico.
const SORT_OPTIONS = [
  { value: "created_desc", label: "Data inserimento (piu recenti)" },
  { value: "created_asc", label: "Data inserimento (piu vecchi)" },
  { value: "price_asc", label: "Prezzo crescente" },
  { value: "price_desc", label: "Prezzo decrescente" },
  { value: "year_desc", label: "Immatricolazione piu recente" },
  { value: "year_asc", label: "Immatricolazione piu vecchia" },
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function asValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : String(value ?? "");
}

function parsePage(value: string | string[] | undefined) {
  const numeric = Number(asValue(value));
  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }
  return Math.floor(numeric);
}

function parseSort(value: string | string[] | undefined) {
  const candidate = asValue(value);
  return SORT_OPTIONS.some((option) => option.value === candidate) ? candidate : "created_desc";
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const resolved = await searchParams;
  const page = parsePage(resolved.page);
  const canonicalPath = page > 1 ? `/auto?page=${page}` : "/auto";
  const title = page > 1 ? `Catalogo Veicoli - Pagina ${page}` : "Catalogo Veicoli";
  const description = "Catalogo pubblico dei veicoli disponibili: filtra e consulta le auto pubblicate dalle concessionarie partner.";
  const canonical = toAbsoluteUrl(canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${title} | KeyAuto`,
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function MarketplaceCatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const sort = parseSort(resolvedSearchParams.sort);
  const from = (page - 1) * MARKETPLACE_CATALOG_PAGE_SIZE;
  const to = from + MARKETPLACE_CATALOG_PAGE_SIZE - 1;

  let query = publicSupabase
      .from("vehicles")
      .select(
        "id, brand, model, version, year, registration_date, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status), vehicle_images(image_url, position, is_cover)",
        { count: "exact" }
      )
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

  switch (sort) {
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
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    logMarketplaceQueryError("catalog", error);
    return (
      <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 p-8 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Catalogo</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Catalogo non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">{error.message || "Non siamo riusciti a caricare il catalogo."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as unknown as MarketplaceVehicle[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / MARKETPLACE_CATALOG_PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const sortQuery = sort !== "created_desc" ? `&sort=${sort}` : "";
  const prevHref = hasPrev ? `/auto?page=${page - 1}${sortQuery}` : `/auto${sortQuery ? `?${sortQuery.slice(1)}` : ""}`;
  const nextHref = `/auto?page=${page + 1}${sortQuery}`;

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:p-8 lg:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Catalogo veicoli</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight" style={{ textWrap: "balance" }}>
                Tutti i veicoli pubblicati
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Una vista ordinata dei veicoli disponibili sul marketplace pubblico di KeyAuto.
              </p>
            </div>
            <div className="relative flex flex-wrap items-end gap-3">
              <form method="GET" action="/auto" className="flex items-end gap-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Ordinamento</span>
                  <select
                    name="sort"
                    defaultValue={sort}
                    style={{ color: "#f8fafc", colorScheme: "dark" }}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.08]"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Ordina
                </button>
              </form>
              <Link
                href="/ricerca"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
              >
                Ricerca avanzata
              </Link>
            </div>
          </div>
        </section>

        {vehicles.length === 0 ? (
          <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-8 text-center text-slate-400">
            Nessun veicolo pubblicato al momento.
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </section>

            <section className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                Pagina <span className="font-semibold text-white">{page}</span> di <span className="font-semibold text-white">{totalPages}</span>
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
