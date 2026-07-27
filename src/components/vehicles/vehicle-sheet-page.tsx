"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import { buildVehicleSheetQr } from "@/lib/vehicle-sheet-qr";

type SheetVehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: number | string | null;
  mileage: number | null;
  price: number | string | null;
  fuel: string | null;
  transmission: string | null;
  traction: string | null;
  color: string | null;
  power_cv: number | null;
  doors: number | null;
  seats: number | null;
  warranty: string | null;
  emission_class: string | null;
  body_type: string | null;
};

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

export function VehicleSheetPage({ vehicleId }: { vehicleId: string }) {
  const [vehicle, setVehicle] = useState<SheetVehicle | null>(null);
  const [dealer, setDealer] = useState<SheetDealer | null>(null);
  const [showPrice, setShowPrice] = useState(true);
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

      const [{ data: vehicleRow, error: vehicleError }, { data: dealerRow }] = await Promise.all([
        supabase
          .from("vehicles")
          .select(
            "id, brand, model, version, year, mileage, price, fuel, transmission, traction, color, power_cv, doors, seats, warranty, emission_class, body_type"
          )
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
      ]);

      if (!alive) return;

      if (vehicleError || !vehicleRow) {
        setError(vehicleError?.message || "Veicolo non trovato.");
        setLoading(false);
        return;
      }

      setVehicle(vehicleRow);
      setDealer(dealerRow ?? null);
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

    const entries: Array<{ label: string; value: string | null }> = [
      { label: "Anno", value: text(vehicle.year) },
      { label: "Chilometri", value: formatMileage(vehicle.mileage) },
      { label: "Alimentazione", value: text(vehicle.fuel) },
      { label: "Cambio", value: text(vehicle.transmission) },
      { label: "Potenza", value: vehicle.power_cv ? `${vehicle.power_cv} CV` : null },
      { label: "Trazione", value: text(vehicle.traction) },
      { label: "Carrozzeria", value: text(vehicle.body_type) },
      { label: "Colore", value: text(vehicle.color) },
      { label: "Porte", value: vehicle.doors ? String(vehicle.doors) : null },
      { label: "Posti", value: vehicle.seats ? String(vehicle.seats) : null },
      { label: "Classe emissioni", value: text(vehicle.emission_class) },
      { label: "Garanzia", value: text(vehicle.warranty) },
    ];

    // An empty box on a windscreen reads as a mistake, so unknown values are
    // dropped rather than printed as a dash.
    return entries.filter((entry) => entry.value !== null);
  }, [vehicle]);

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

        <div className="mt-10">
          <h1 className="text-[64px] font-black uppercase leading-[0.95] tracking-tight">{title}</h1>
          {text(vehicle.version) ? (
            <p className="mt-3 text-[28px] font-semibold leading-tight text-slate-700">{vehicle.version}</p>
          ) : null}
        </div>

        {showPrice && priceLabel ? (
          <p className="mt-8 text-[80px] font-black leading-none tracking-tight">{priceLabel}</p>
        ) : null}

        <dl className="mt-12 grid grid-cols-3 gap-x-6 gap-y-7">
          {specs.map((spec) => (
            <div key={spec.label} className="border-t-2 border-slate-300 pt-3">
              <dt className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">{spec.label}</dt>
              <dd className="mt-1 text-[26px] font-bold leading-tight">{spec.value}</dd>
            </div>
          ))}
        </dl>

        <footer className="mt-auto flex items-end justify-between gap-8 border-t-4 border-slate-900 pt-5">
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
