"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import { pickCoverPreviewUrl, resolveVehicleImageRows } from "@/lib/vehicle-photos";
import { formatRegistrationLabel } from "@/lib/vehicles";
import { buildVehicleSheetQr } from "@/lib/vehicle-sheet-qr";

// Mirrors the creation form field by field: whatever the dealer fills in when
// inserting a vehicle has to be printable, otherwise the sheet on the
// windscreen contradicts the listing.
type SheetVehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  vehicle_category: string | null;
  vehicle_condition: string | null;
  body_type: string | null;
  year: number | string | null;
  registration_date: string | null;
  mileage: number | null;
  price: number | string | null;
  fuel: string | null;
  transmission: string | null;
  traction: string | null;
  engine_size: string | null;
  power_kw: number | null;
  power_cv: number | null;
  color: string | null;
  interior_type: string | null;
  doors: number | null;
  seats: number | null;
  warranty: string | null;
  emission_class: string | null;
  vin: string | null;
  description: string | null;
  equipment: string[] | string | null;
};

const SHEET_VEHICLE_COLUMNS = [
  "id",
  "brand",
  "model",
  "version",
  "vehicle_category",
  "vehicle_condition",
  "body_type",
  "year",
  "registration_date",
  "mileage",
  "price",
  "fuel",
  "transmission",
  "traction",
  "engine_size",
  "power_kw",
  "power_cv",
  "color",
  "interior_type",
  "doors",
  "seats",
  "warranty",
  "emission_class",
  "vin",
  "description",
  "equipment",
].join(", ");

type SheetDealer = {
  name: string | null;
  legal_name: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
};

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function formatPrice(value: number | string | null) {
  const amount = typeof value === "string" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMileage(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${new Intl.NumberFormat("it-IT").format(value)} km`;
}

// The column accepts both a jsonb array and a free-text list, depending on
// whether the vehicle came from the editor or from an import, so both shapes
// have to print.
function normalizeEquipment(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;|]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export function VehicleSheetPage({ vehicleId }: { vehicleId: string }) {
  const [vehicle, setVehicle] = useState<SheetVehicle | null>(null);
  const [dealer, setDealer] = useState<SheetDealer | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [showPrice, setShowPrice] = useState(true);
  const [showPhoto, setShowPhoto] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read from the browser so the QR always points at the host the dealer is
  // actually on, with no base-URL env to keep in sync per environment. Safe
  // against hydration mismatch: the sheet only renders once loading is false,
  // which cannot happen during SSR.
  const listingUrl = useMemo(
    () => (typeof window === "undefined" ? null : `${window.location.origin}/auto/${vehicleId}`),
    [vehicleId],
  );

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        if (alive) {
          setError("Sessione non valida. Effettua di nuovo il login.");
          setLoading(false);
        }
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!dealerId) {
        if (alive) {
          setError("Concessionaria non associata all'utente.");
          setLoading(false);
        }
        return;
      }

      const [{ data: vehicleRow, error: vehicleError }, { data: dealerRow }, { data: imageRows }] = await Promise.all([
        supabase
          .from("vehicles")
          .select(SHEET_VEHICLE_COLUMNS)
          // Scoped to the dealer as well as the id: a sheet must never be
          // printable for another tenant's vehicle.
          .eq("id", vehicleId)
          .eq("dealer_id", dealerId)
          .maybeSingle<SheetVehicle>(),
        supabase
          .from("dealers")
          .select("name, legal_name, city, province, phone")
          .eq("id", dealerId)
          .maybeSingle<SheetDealer>(),
        supabase
          .from("vehicle_images")
          .select("id, image_url, position, is_cover")
          .eq("vehicle_id", vehicleId)
          .eq("dealer_id", dealerId)
          .order("position", { ascending: true }),
      ]);

      if (!alive) return;

      if (vehicleError || !vehicleRow) {
        setError(vehicleError?.message || "Veicolo non trovato.");
        setLoading(false);
        return;
      }

      // Resolved after the vehicle is on screen: a missing or slow photo must
      // never hold up a sheet the dealer is trying to print.
      const resolvedImages = await resolveVehicleImageRows(supabase, imageRows);

      if (!alive) return;

      setVehicle(vehicleRow);
      setDealer(dealerRow ?? null);
      setCoverUrl(pickCoverPreviewUrl(resolvedImages));
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [vehicleId]);

  const qr = useMemo(() => (listingUrl ? buildVehicleSheetQr(listingUrl) : null), [listingUrl]);

  const title = useMemo(() => {
    if (!vehicle) return "";
    return [text(vehicle.brand), text(vehicle.model)].filter(Boolean).join(" ");
  }, [vehicle]);

  const specs = useMemo(() => {
    if (!vehicle) return [];

    // kW and CV are two separate fields in the editor but one number to a
    // buyer, so they share a box instead of taking two.
    const power = [
      vehicle.power_cv ? `${vehicle.power_cv} CV` : null,
      vehicle.power_kw ? `${vehicle.power_kw} kW` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const entries: Array<{ label: string; value: string | null }> = [
      { label: "Tipo veicolo", value: text(vehicle.vehicle_category) },
      { label: "Condizioni", value: text(vehicle.vehicle_condition) },
      { label: "Carrozzeria", value: text(vehicle.body_type) },
      {
        label: "Immatricolazione",
        value: formatRegistrationLabel({ registration_date: vehicle.registration_date, year: vehicle.year }),
      },
      { label: "Chilometri", value: formatMileage(vehicle.mileage) },
      { label: "Alimentazione", value: text(vehicle.fuel) },
      { label: "Cambio", value: text(vehicle.transmission) },
      { label: "Trazione", value: text(vehicle.traction) },
      { label: "Cilindrata", value: text(vehicle.engine_size) },
      { label: "Potenza", value: text(power) },
      { label: "Classe emissioni", value: text(vehicle.emission_class) },
      { label: "Colore", value: text(vehicle.color) },
      { label: "Interni", value: text(vehicle.interior_type) },
      { label: "Porte", value: vehicle.doors ? String(vehicle.doors) : null },
      { label: "Posti", value: vehicle.seats ? String(vehicle.seats) : null },
      { label: "Garanzia", value: text(vehicle.warranty) },
      { label: "Telaio", value: text(vehicle.vin) },
    ];

    // An empty box on a windscreen reads as a mistake, so unknown values are
    // dropped rather than printed as a dash.
    return entries.filter((entry) => entry.value !== null);
  }, [vehicle]);

  const equipment = useMemo(() => normalizeEquipment(vehicle?.equipment ?? null), [vehicle]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparazione scheda...
        </p>
      </main>
    );
  }

  if (error || !vehicle) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-base font-semibold text-slate-900">Scheda non disponibile</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? "Veicolo non trovato."}</p>
          <Link
            href={`/veicoli/${vehicleId}`}
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Torna al veicolo
          </Link>
        </div>
      </main>
    );
  }

  const priceLabel = formatPrice(vehicle.price);
  const dealerName = text(dealer?.name) ?? text(dealer?.legal_name) ?? "Concessionaria";
  const dealerPlace = [text(dealer?.city), text(dealer?.province)].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      {/* Controls belong to the screen only; @media print hides them. */}
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4">
        <Link href={`/veicoli/${vehicleId}`} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          ← Torna al veicolo
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(event) => setShowPrice(event.target.checked)}
              className="h-4 w-4 rounded border-slate-400"
            />
            Mostra prezzo
          </label>

          <label
            className={`inline-flex items-center gap-2 text-sm font-medium ${coverUrl ? "text-slate-700" : "text-slate-400"}`}
            // Senza foto caricate la spunta non ha nulla da accendere: resta
            // visibile ma disattivata, cosi' il concessionario capisce che
            // manca la foto invece di cercare un'opzione che non c'e'.
            title={coverUrl ? undefined : "Questo veicolo non ha foto caricate."}
          >
            <input
              type="checkbox"
              checked={showPhoto && Boolean(coverUrl)}
              disabled={!coverUrl}
              onChange={(event) => setShowPhoto(event.target.checked)}
              className="h-4 w-4 rounded border-slate-400"
            />
            Mostra foto
          </label>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Stampa
          </button>
        </div>
      </div>

      <article className="vehicle-sheet mx-auto flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white p-[14mm] text-slate-900 shadow-lg print:min-h-0 print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-4">
          <p className="text-lg font-bold uppercase tracking-[0.2em]">{dealerName}</p>
          <p className="text-lg font-black tracking-tight">KEYAUTO</p>
        </header>

        {/* The hero stays oversized: it is the part read from a few metres
            away, through a windscreen. Everything below it is for the buyer
            who has already stopped at the car. */}
        <div className="sheet-block mt-8">
          <h1 className="text-[52px] font-black uppercase leading-[0.95] tracking-tight">{title}</h1>
          {text(vehicle.version) ? (
            <p className="mt-2 text-[24px] font-semibold leading-tight text-slate-700">{vehicle.version}</p>
          ) : null}
        </div>

        {/* Prezzo e foto condividono la stessa fascia: la foto sta a destra,
            dentro lo spazio del prezzo, e non spinge in basso i dati tecnici
            piu' di quanto serva. Le due spunte sono indipendenti, quindi la
            fascia esiste finche' almeno una delle due ha qualcosa da mostrare. */}
        {(showPrice && priceLabel) || (showPhoto && coverUrl) ? (
          <div className="sheet-block mt-6 flex items-start justify-between gap-6">
            {showPrice && priceLabel ? (
              <p className="text-[64px] font-black leading-none tracking-tight">{priceLabel}</p>
            ) : (
              // Segnaposto a altezza zero: senza prezzo la foto resta a destra
              // invece di scivolare a sinistra, e non si apre una riga vuota.
              <span aria-hidden="true" />
            )}

            {showPhoto && coverUrl ? (
              // Un <img> vero, non uno sfondo CSS: si stampa senza che il
              // concessionario debba attivare "Grafica di sfondo". eager
              // perche' window.print() non aspetta le immagini pigre.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                loading="eager"
                decoding="sync"
                // 62x42mm: la fascia e' larga 182mm, quindi al prezzo ne
                // restano 114 anche con sei cifre. Oltre questa misura la foto
                // inizia a spingere i dati tecnici sul secondo foglio.
                className="h-[42mm] w-[62mm] flex-none rounded-lg object-cover"
              />
            ) : null}
          </div>
        ) : null}

        <dl className="mt-8 grid grid-cols-4 gap-x-5 gap-y-5">
          {specs.map((spec) => (
            <div key={spec.label} className="sheet-block border-t-2 border-slate-300 pt-2">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{spec.label}</dt>
              <dd className="mt-1 break-words text-[19px] font-bold leading-tight [overflow-wrap:anywhere]">
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>

        {text(vehicle.description) ? (
          <section className="sheet-block mt-8 border-t-2 border-slate-300 pt-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Descrizione</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-slate-800 [overflow-wrap:anywhere]">
              {vehicle.description}
            </p>
          </section>
        ) : null}

        {equipment.length > 0 ? (
          <section className="mt-8 border-t-2 border-slate-300 pt-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Dotazioni</h2>
            {/* A plain three-column list rather than chips: it survives a
                black-and-white print and fits far more items per page. */}
            <ul className="mt-2 grid grid-cols-3 gap-x-5 gap-y-1">
              {equipment.map((item, index) => (
                <li
                  // An imported list can repeat an item; the index keeps the
                  // keys unique without silently dropping the duplicate.
                  key={`${item}-${index}`}
                  className="sheet-block flex gap-1.5 break-words text-[12px] leading-[1.45] text-slate-800 [overflow-wrap:anywhere]"
                >
                  <span aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Pushes the footer to the bottom of a short sheet, and guarantees a
            gap above it on a full one, where mt-auto alone collapses to zero. */}
        <div className="mt-auto min-h-8" aria-hidden="true" />

        <footer className="sheet-block flex items-end justify-between gap-8 border-t-4 border-slate-900 pt-5">
          <div>
            <p className="text-[22px] font-bold leading-tight">{dealerName}</p>
            {dealerPlace ? <p className="mt-1 text-[17px] text-slate-700">{dealerPlace}</p> : null}
            {text(dealer?.phone) ? (
              <p className="mt-1 text-[22px] font-bold tracking-tight">{dealer?.phone}</p>
            ) : null}
          </div>

          {qr ? (
            <div className="flex flex-col items-center gap-2">
              <svg
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                className="h-[34mm] w-[34mm]"
                shapeRendering="crispEdges"
                role="img"
                aria-label="Codice QR dell'annuncio"
              >
                <path d={qr.path} fill="currentColor" />
              </svg>
              <p className="max-w-[38mm] text-center text-[11px] font-semibold leading-tight text-slate-600">
                Inquadra per foto e dettagli
              </p>
            </div>
          ) : null}
        </footer>
      </article>
    </main>
  );
}
