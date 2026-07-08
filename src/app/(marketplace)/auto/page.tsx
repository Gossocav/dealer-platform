import type { Metadata } from "next";
import Link from "next/link";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { MARKETPLACE_PUBLISHABLE_STATUS_VALUES, publicSupabase, toAbsoluteUrl, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

const MARKETPLACE_CATALOG_PAGE_SIZE = 24;

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
      title: `${title} | Dealer Platform`,
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function MarketplaceCatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const from = (page - 1) * MARKETPLACE_CATALOG_PAGE_SIZE;
  const to = from + MARKETPLACE_CATALOG_PAGE_SIZE - 1;

  const { data, error, count } = await publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, year, registration_date, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)",
      { count: "exact" }
    )
    .in("status", MARKETPLACE_PUBLISHABLE_STATUS_VALUES)
    .eq("dealers.status", "approved")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Catalogo</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Catalogo non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{error.message || "Non siamo riusciti a caricare il catalogo."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as MarketplaceVehicle[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / MARKETPLACE_CATALOG_PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const prevHref = hasPrev ? `/auto?page=${page - 1}` : "/auto";
  const nextHref = `/auto?page=${page + 1}`;

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Catalogo veicoli</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">Tutti i veicoli pubblicati</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Una vista ordinata dei veicoli disponibili sul marketplace pubblico della Dealer Platform.
              </p>
            </div>
            <Link href="/ricerca" className="inline-flex items-center justify-center rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800">
              Ricerca avanzata
            </Link>
          </div>
        </section>

        {vehicles.length === 0 ? (
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 text-slate-600 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
            Nessun veicolo pubblicato al momento.
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </section>

            <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.24)] sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Pagina <span className="font-semibold text-slate-900">{page}</span> di <span className="font-semibold text-slate-900">{totalPages}</span>
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
