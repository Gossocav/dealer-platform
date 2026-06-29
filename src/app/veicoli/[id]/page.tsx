import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import RequestInformationButton from "./request-information-button";

type VehicleImageRow = {
  image_url: string | null;
  position: number | null;
  is_cover: boolean | null;
};

type VehicleRow = {
  id: string;
  dealer_id: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | number | null;
  mileage: number | null;
  price: string | number | null;
  fuel: string | null;
  transmission: string | null;
  power_cv: number | null;
  color: string | null;
  doors: number | null;
  seats: number | null;
  description: string | null;
  vehicle_images?: VehicleImageRow[] | null;
};

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("vehicles")
    .select(
      "id, dealer_id, brand, model, version, year, mileage, price, fuel, transmission, power_cv, color, doors, seats, description, vehicle_images(image_url, position, is_cover)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-600">Veicolo</p>
          <h1 className="mt-3 text-3xl font-semibold">Veicolo non trovato</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Non siamo riusciti a trovare il veicolo richiesto. Potrebbe essere stato rimosso oppure il link non e valido.
          </p>
          <div className="mt-8">
            <Link
              href="/veicoli"
              className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Torna ai veicoli
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const vehicle = data as VehicleRow;
  const gallery = getImageGallery(vehicle.vehicle_images);
  const coverImage = gallery[0] ?? null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-600">Scheda veicolo</p>
          <h1 className="mt-3 text-3xl font-semibold">
            {vehicle.brand ?? "-"} {vehicle.model ?? "-"} {vehicle.version ?? ""}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {safeText(vehicle.year)} • {safeText(vehicle.fuel)} • {safeText(vehicle.transmission)}
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-[360px] overflow-hidden rounded-[24px] bg-slate-200">
                {coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverImage}
                    alt={`${vehicle.brand ?? "Veicolo"} ${vehicle.model ?? ""}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <VehicleImagePlaceholder />
                )}
              </div>

              {gallery.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {gallery.map((image, index) => (
                    <a
                      key={`${image}-${index}`}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className="h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-200"
                      aria-label={`Apri immagine ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={`Miniatura ${index + 1}`} className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Dati principali</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailCard label="Marca" value={safeText(vehicle.brand)} />
                <DetailCard label="Modello" value={safeText(vehicle.model)} />
                <DetailCard label="Versione" value={safeText(vehicle.version)} />
                <DetailCard label="Anno" value={safeText(vehicle.year)} />
                <DetailCard label="Chilometri" value={formatMileage(vehicle.mileage)} />
                <DetailCard label="Prezzo" value={formatPrice(vehicle.price)} />
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Caratteristiche</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailCard label="Carburante" value={safeText(vehicle.fuel)} />
                <DetailCard label="Cambio" value={safeText(vehicle.transmission)} />
                <DetailCard label="Potenza" value={formatPower(vehicle.power_cv)} />
                <DetailCard label="Colore" value={safeText(vehicle.color)} />
                <DetailCard label="Porte" value={safeText(vehicle.doors)} />
                <DetailCard label="Posti" value={safeText(vehicle.seats)} />
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Descrizione</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700">{safeText(vehicle.description)}</p>
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Contatto</p>
              <p className="mt-3 text-sm text-slate-600">
                Interessato a questo veicolo? Contattaci per disponibilita, finanziamento e valutazione usato.
              </p>
              <div className="mt-6">
                <RequestInformationButton
                  vehicleId={vehicle.id}
                  dealerId={vehicle.dealer_id}
                  vehicleLabel={`${vehicle.brand ?? ""} ${vehicle.model ?? ""} ${vehicle.version ?? ""}`.trim() || "Veicolo"}
                />
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Navigazione</p>
              <div className="mt-4">
                <Link
                  href="/veicoli"
                  className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Torna all&apos;elenco
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function getImageGallery(images?: VehicleImageRow[] | null) {
  if (!Array.isArray(images) || images.length === 0) {
    return [] as string[];
  }

  return [...images]
    .sort((a, b) => {
      const aCover = a.is_cover ? 1 : 0;
      const bCover = b.is_cover ? 1 : 0;
      if (aCover !== bCover) {
        return bCover - aCover;
      }

      const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition;
    })
    .map((item) => String(item.image_url ?? "").trim())
    .filter((value) => value.length > 0);
}

function safeText(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : "-";
}

function formatMileage(value: number | null) {
  if (typeof value !== "number") return "-";
  return `${new Intl.NumberFormat("it-IT").format(value)} km`;
}

function formatPrice(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";

  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPower(value: number | null) {
  if (typeof value !== "number") return "-";
  return `${value} CV`;
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function VehicleImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center text-slate-500">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-12 w-12 fill-current">
        <path d="M5 6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5a2.5 2.5 0 1 0 5 0h1a2.5 2.5 0 1 0 5 0H19a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.35a1 1 0 0 1-.83-.45l-.64-.97A2 2 0 0 0 14.53 4h-5.1a2 2 0 0 0-1.65.88l-.64.97A1 1 0 0 1 6.31 6H5Zm4 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
    </div>
  );
}
