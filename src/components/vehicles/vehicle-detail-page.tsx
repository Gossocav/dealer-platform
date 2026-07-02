"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, PencilLine, Rocket, Users } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { supabase } from "@/lib/supabaseClient";
import {
  extractVehicleImagePath,
  formatCurrency,
  formatDate,
  formatVehicleStatus,
  safeText,
  type VehicleImageRow,
  type VehicleRow,
} from "@/lib/vehicles";

type VehicleDetailPageProps = {
  vehicleId: string;
};

type VehicleWithEquipment = VehicleRow & {
  body_type?: string | null;
  engine_size?: string | number | null;
  power_kw?: number | null;
  color?: string | null;
  power_cv?: number | null;
  doors?: number | null;
  seats?: number | null;
  warranty?: string | null;
  availability?: string | null;
  emission_class?: string | null;
  registration_date?: string | null;
  vin?: string | null;
  equipment?: string[] | string | null;
};

type ViewImage = VehicleImageRow & { previewUrl: string | null };

function mapImageUrlForDisplay(imageUrl: string): string {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    const isSupabaseDomain = parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co");

    if (isSupabaseDomain) {
      return imageUrl;
    }
  } catch {
    return imageUrl;
  }

  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

function normalizeEquipment(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return [];
    return normalized
      .split(/[,\n;|]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export function VehicleDetailPage({ vehicleId }: VehicleDetailPageProps) {
  const [dealerName, setDealerName] = useState("Dealer Console");
  const [vehicle, setVehicle] = useState<VehicleWithEquipment | null>(null);
  const [images, setImages] = useState<ViewImage[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverImageFailed, setCoverImageFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (userId) {
        const { data: dealer } = await supabase
          .from("dealers")
          .select("name, legal_name")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle<{ name: string | null; legal_name: string | null }>();
        const nextDealerName = String(dealer?.name ?? dealer?.legal_name ?? "").trim();
        if (nextDealerName && alive) setDealerName(nextDealerName);
      }

      const [{ data: vehicleData, error: vehicleError }, { data: leadRows }, { data: imageRows }] = await Promise.all([
        supabase
          .from("vehicles")
          .select(
            "id, dealer_id, brand, model, version, year, mileage, fuel, transmission, price, status, published, city, province, description, body_type, engine_size, power_kw, power_cv, doors, seats, warranty, availability, emission_class, registration_date, color, vin, equipment, created_at, updated_at"
          )
          .eq("id", vehicleId)
          .maybeSingle<VehicleWithEquipment>(),
        supabase.from("leads").select("id").eq("vehicle_id", vehicleId),
        supabase.from("vehicle_images").select("id, image_url, position, is_cover").eq("vehicle_id", vehicleId).order("position", { ascending: true }),
      ]);

      if (!alive) return;

      if (vehicleError || !vehicleData) {
        setError(vehicleError?.message || "Veicolo non trovato.");
        setLoading(false);
        return;
      }

      const resolvedImages = await Promise.all(
        (imageRows ?? []).map(async (row) => {
          const raw = String(row.image_url ?? "").trim();

          if (!raw) {
            return { ...row, previewUrl: null } as ViewImage;
          }

          if (raw.startsWith("http://") || raw.startsWith("https://")) {
            if (raw.includes(".supabase.co")) {
              const path = extractVehicleImagePath(raw);

              if (!path) {
                return { ...row, previewUrl: null } as ViewImage;
              }

              const { data: signed, error } = await supabase.storage.from("vehicle-images").createSignedUrl(path, 3600);
              if (!error && signed?.signedUrl) {
                return { ...row, previewUrl: signed.signedUrl } as ViewImage;
              }

              const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
              return { ...row, previewUrl: publicData.publicUrl || null } as ViewImage;
            }

            return { ...row, previewUrl: mapImageUrlForDisplay(raw) } as ViewImage;
          }

          const path = extractVehicleImagePath(raw);

          if (!path) {
            return { ...row, previewUrl: null } as ViewImage;
          }

          const { data: signed } = await supabase.storage.from("vehicle-images").createSignedUrl(path, 3600);
          if (signed?.signedUrl) {
            return { ...row, previewUrl: signed.signedUrl } as ViewImage;
          }

          const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
          return { ...row, previewUrl: publicData.publicUrl || raw } as ViewImage;
        })
      );

      setVehicle(vehicleData);
      setImages(resolvedImages);
      setLeadCount((leadRows ?? []).length);
      setLoading(false);
    };

    void fetchData();

    return () => {
      alive = false;
    };
  }, [vehicleId]);

  const coverUrl = useMemo(() => images.find((image) => image.is_cover)?.previewUrl ?? images[0]?.previewUrl ?? null, [images]);
  const equipmentList = useMemo(() => {
    if (!vehicle) return [];

    const source = vehicle as Record<string, unknown>;
    return normalizeEquipment(source.equipment);
  }, [vehicle]);

  useEffect(() => {
    setCoverImageFailed(false);
  }, [coverUrl]);

  const togglePublished = async () => {
    if (!vehicle) return;

    setUpdating(true);
    setError(null);

    const isPublished = String(vehicle.status ?? "").toLowerCase() === "published" || vehicle.published;
    const nextPublished = !isPublished;

    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ status: nextPublished ? "published" : "draft", published: nextPublished })
      .eq("id", vehicle.id);

    if (updateError) {
      setError(updateError.message || "Errore aggiornamento stato.");
      setUpdating(false);
      return;
    }

    setVehicle((prev) => (prev ? { ...prev, status: nextPublished ? "published" : "draft", published: nextPublished } : prev));
    setUpdating(false);
  };

  return (
    <DealerDashboardShell title="Dettaglio Veicolo" dealerName={dealerName} avatarInitials="DC" unreadNotifications={3}>
      {loading ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">Caricamento dettaglio veicolo...</section>
      ) : null}

      {error ? <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</section> : null}

      {!loading && vehicle ? (
        <>
          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Scheda completa</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {safeText(vehicle.brand)} {safeText(vehicle.model)} {safeText(vehicle.version)}
            </h2>
            <p className="mt-2 text-sm text-slate-600">Inserito il {formatDate(vehicle.created_at)}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/veicoli/modifica/${vehicle.id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <PencilLine className="h-4 w-4" /> Modifica
              </Link>
              <button
                type="button"
                onClick={togglePublished}
                disabled={updating}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {formatVehicleStatus(vehicle.status, vehicle.published) === "Pubblicato" ? "Passa a bozza" : "Pubblica"}
              </button>
              <Link
                href="/veicoli"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Torna alla lista
              </Link>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="dashboard-fade-up overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
              <div className="h-[420px] max-w-full overflow-hidden bg-slate-200">
                {coverUrl && !coverImageFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt={`${safeText(vehicle.brand)} ${safeText(vehicle.model)}`}
                    className="h-full w-full max-w-full object-cover"
                    onError={() => setCoverImageFailed(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">Foto non disponibile</div>
                )}
              </div>
              {images.length > 1 ? (
                <div className="grid grid-cols-4 gap-2 p-3">
                  {images.map((image) => (
                    <div key={image.id} className="h-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {image.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.previewUrl} alt={safeText(image.image_url)} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="dashboard-fade-up min-w-0 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Marca" value={safeText(vehicle.brand)} />
                <Detail label="Modello" value={safeText(vehicle.model)} />
                <Detail label="Versione" value={safeText(vehicle.version)} />
                <Detail label="Anno" value={safeText(vehicle.year)} />
                <Detail label="Prezzo" value={formatCurrency(Number(vehicle.price ?? 0))} />
                <Detail label="Stato" value={formatVehicleStatus(vehicle.status, vehicle.published)} />
                <Detail label="Alimentazione" value={safeText(vehicle.fuel)} />
                <Detail label="Cambio" value={safeText(vehicle.transmission)} />
                <Detail label="Cilindrata" value={safeText(vehicle.engine_size)} />
                <Detail label="Potenza kW" value={safeText(vehicle.power_kw)} />
                <Detail label="Potenza CV" value={safeText(vehicle.power_cv)} />
                <Detail label="Porte" value={safeText(vehicle.doors)} />
                <Detail label="Classe Euro" value={safeText(vehicle.emission_class)} />
                <Detail label="Data immatricolazione" value={safeText(vehicle.registration_date)} />
                <Detail label="Colore" value={safeText(vehicle.color)} />
                <Detail label="Telaio" value={safeText(vehicle.vin)} />
                <Detail label="Citta" value={safeText(vehicle.city)} />
                <Detail label="Provincia" value={safeText(vehicle.province)} />
                <Detail label="Lead" value={`${leadCount}`} icon={<Users className="h-3.5 w-3.5" />} />
              </div>

              <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Descrizione</p>
                <p className="mt-2 min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">
                  {safeText(vehicle.description)}
                </p>
              </div>

              {equipmentList.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Dotazioni</p>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    {equipmentList.map((item) => (
                      <span
                        key={item}
                        className="max-w-full break-words rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 [overflow-wrap:anywhere]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          </section>
        </>
      ) : null}
    </DealerDashboardShell>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
