"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, PencilLine, Rocket, Send } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { SendToClientDialog } from "@/components/vehicles/send-to-client-dialog";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { supabase } from "@/lib/supabaseClient";
import { evaluateVehicleHealth } from "@/lib/vehicle-health";
import { buildVehicleTimelineEvents, listVehicleTimelineAuditEvents, writeVehicleTimelineEvent, type VehicleTimelineEvent } from "@/lib/vehicle-timeline";
import {
  extractVehicleImagePath,
  formatCurrency,
  formatDate,
  formatVehicleStatus,
  safeText,
  validateVehicleStatusTransitionForCrud,
  type VehicleImageRow,
  type VehicleRow,
} from "@/lib/vehicles";

type VehicleDetailPageProps = {
  vehicleId: string;
};

type VehicleWithEquipment = VehicleRow & {
  body_type?: string | null;
  engine_size?: string | number | null;
  traction?: string | null;
  interior_type?: string | null;
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

function formatMileageForDetail(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Non indicato";
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return "Non indicato";
  }

  return `${new Intl.NumberFormat("it-IT").format(normalized)} km`;
}

function getHealthLevelPill(level: "eccellente" | "buono" | "incompleto" | "critico") {
  if (level === "eccellente") return "bg-emerald-100 text-emerald-700";
  if (level === "buono") return "bg-blue-100 text-blue-700";
  if (level === "incompleto") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function VehicleDetailPage({ vehicleId }: VehicleDetailPageProps) {
  const [dealerName, setDealerName] = useState("Dealer Console");
  const [vehicle, setVehicle] = useState<VehicleWithEquipment | null>(null);
  const [images, setImages] = useState<ViewImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<VehicleTimelineEvent[]>([]);
  const [currentDealerId, setCurrentDealerId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        setError("Sessione non valida. Effettua di nuovo il login.");
        setLoading(false);
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!dealerId) {
        setError("Concessionaria non associata all'utente.");
        setLoading(false);
        return;
      }

      setCurrentDealerId(dealerId);

      const { data: dealer } = await supabase
        .from("dealers")
        .select("name, legal_name")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ name: string | null; legal_name: string | null }>();
      const nextDealerName = String(dealer?.name ?? dealer?.legal_name ?? "").trim();
      if (nextDealerName && alive) setDealerName(nextDealerName);

      const [{ data: vehicleData, error: vehicleError }, { data: imageRows }] = await Promise.all([
        supabase
          .from("vehicles")
          .select(
            "id, dealer_id, brand, model, version, year, mileage, fuel, transmission, traction, price, status, published, city, province, description, body_type, engine_size, interior_type, power_kw, power_cv, doors, seats, warranty, availability, emission_class, registration_date, color, vin, equipment, created_at, updated_at"
          )
          .eq("id", vehicleId)
          .eq("dealer_id", dealerId)
          .maybeSingle<VehicleWithEquipment>(),
        supabase.from("vehicle_images").select("id, image_url, position, is_cover").eq("vehicle_id", vehicleId).order("position", { ascending: true }),
      ]);

      if (!alive) return;

      if (vehicleError || !vehicleData) {
        setError(vehicleError?.message || "Veicolo non trovato.");
        setLoading(false);
        return;
      }

      const signedUrlCache = new Map<string, Promise<string | null>>();

      const resolveSignedVehicleImageUrl = (rawValue: string) => {
        const normalized = rawValue.trim();
        if (!normalized) {
          return Promise.resolve(null);
        }

        if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
          if (!normalized.includes(".supabase.co")) {
            return Promise.resolve(mapImageUrlForDisplay(normalized));
          }
        }

        const path = extractVehicleImagePath(normalized);
        if (!path) {
          return Promise.resolve(null);
        }

        const cached = signedUrlCache.get(path);
        if (cached) {
          return cached;
        }

        const pending = (async () => {
          const { data: signed, error } = await supabase.storage.from("vehicle-images").createSignedUrl(path, 3600);
          if (!error && signed?.signedUrl) {
            return signed.signedUrl;
          }

          const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
          return publicData.publicUrl || null;
        })();

        signedUrlCache.set(path, pending);
        return pending;
      };

      const resolvedImages = await Promise.all(
        (imageRows ?? []).map(async (row) => {
          const raw = String(row.image_url ?? "").trim();

          if (!raw) {
            return { ...row, previewUrl: null } as ViewImage;
          }

          if (raw.startsWith("http://") || raw.startsWith("https://")) {
            if (raw.includes(".supabase.co")) {
              return { ...row, previewUrl: await resolveSignedVehicleImageUrl(raw) } as ViewImage;
            }

            return { ...row, previewUrl: mapImageUrlForDisplay(raw) } as ViewImage;
          }

          return { ...row, previewUrl: (await resolveSignedVehicleImageUrl(raw)) || raw } as ViewImage;
        })
      );

      const auditTimelineEvents = vehicleData.dealer_id
        ? await listVehicleTimelineAuditEvents(supabase, vehicleData.dealer_id, vehicleData.id)
        : [];
      const nextTimelineEvents = buildVehicleTimelineEvents({
        auditEvents: auditTimelineEvents,
        vehicleCreatedAt: vehicleData.created_at,
        vehicleUpdatedAt: vehicleData.updated_at,
      });

      setVehicle(vehicleData);
      setImages(resolvedImages);
      setTimelineEvents(nextTimelineEvents);
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
  const vehicleHealth = useMemo(() => {
    if (!vehicle) return null;
    return evaluateVehicleHealth({
      vehicle,
      imagesCount: images.length,
    });
  }, [images.length, vehicle]);
  const isCurrentlyPublished = useMemo(() => {
    if (!vehicle) return false;
    return String(vehicle.status ?? "").toLowerCase() === "published" || Boolean(vehicle.published);
  }, [vehicle]);

  const togglePublished = async () => {
    if (!vehicle) return;
    if (!currentDealerId) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    setUpdating(true);
    setError(null);

    const demoAccessContext = await resolveDemoAccessContext(supabase, currentDealerId);
    const demoBlock = getDemoFeatureBlockReason(demoAccessContext, "integration");
    if (demoBlock) {
      setError(demoBlock.message);
      setUpdating(false);
      return;
    }

    const isPublished = String(vehicle.status ?? "").toLowerCase() === "published" || vehicle.published;
    const nextPublished = !isPublished;

    if (nextPublished && vehicleHealth && !vehicleHealth.publishable) {
      const firstIssue = vehicleHealth.issues[0]?.message ?? "La scheda veicolo non e ancora pubblicabile.";
      setError(`Pubblicazione bloccata: ${firstIssue}`);
      setUpdating(false);
      return;
    }

    const transition = validateVehicleStatusTransitionForCrud({
      fromStatus: vehicle.status,
      fromPublished: vehicle.published,
      toStatus: nextPublished ? "published" : "draft",
      toPublished: nextPublished,
    });

    if (!transition.allowed) {
      setError(transition.message || "Transizione stato non consentita.");
      setUpdating(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ status: transition.nextStatus, published: transition.nextPublished })
      .eq("id", vehicle.id)
      .eq("dealer_id", currentDealerId);

    if (updateError) {
      setError(updateError.message || "Errore aggiornamento stato.");
      setUpdating(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;
    const action = transition.nextPublished ? "vehicle.published" : "vehicle.unpublished";

    if (vehicle.dealer_id) {
      await writeVehicleTimelineEvent(supabase, {
        dealerId: vehicle.dealer_id,
        vehicleId: vehicle.id,
        action,
        actorType: "user",
        actorProfileId,
        metadata: {
          fromStatus: String(vehicle.status ?? "draft"),
          toStatus: transition.nextStatus,
        },
        before: {
          status: vehicle.status,
          published: vehicle.published,
        },
        after: {
          status: transition.nextStatus,
          published: transition.nextPublished,
        },
      });
    }

    setVehicle((prev) => (prev ? { ...prev, status: transition.nextStatus, published: transition.nextPublished } : prev));
    setTimelineEvents((prev) =>
      buildVehicleTimelineEvents({
        auditEvents: [
          {
            id: `local-${action}-${new Date().toISOString()}`,
            action,
            title: action === "vehicle.published" ? "Veicolo pubblicato" : "Veicolo non pubblicato",
            description: action === "vehicle.published" ? "Il veicolo è ora visibile ai canali di pubblicazione." : "Il veicolo è stato rimosso dai canali di pubblicazione.",
            createdAt: new Date().toISOString(),
            actorType: "user",
            metadata: {
              fromStatus: String(vehicle.status ?? "draft"),
              toStatus: transition.nextStatus,
            },
          },
          ...prev,
        ],
      })
    );
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
                disabled={updating || (!isCurrentlyPublished && !vehicleHealth?.publishable)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {isCurrentlyPublished ? "Passa a bozza" : "Pubblica"}
              </button>
              <button
                type="button"
                onClick={() => setSendDialogOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Send className="h-4 w-4" /> Invia al cliente
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
                {coverUrl && failedCoverUrl !== coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt={`${safeText(vehicle.brand)} ${safeText(vehicle.model)}`}
                    className="h-full w-full max-w-full object-cover"
                    onError={() => setFailedCoverUrl(coverUrl)}
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
                <Detail label="Chilometraggio" value={formatMileageForDetail(vehicle.mileage)} />
                <Detail label="Trazione" value={safeText(vehicle.traction)} />
                <Detail label="Cilindrata" value={safeText(vehicle.engine_size)} />
                <Detail label="Potenza kW" value={safeText(vehicle.power_kw)} />
                <Detail label="Potenza CV" value={safeText(vehicle.power_cv)} />
                <Detail label="Porte" value={safeText(vehicle.doors)} />
                <Detail label="Classe Euro" value={safeText(vehicle.emission_class)} />
                <Detail label="Data immatricolazione" value={safeText(vehicle.registration_date)} />
                <Detail label="Colore" value={safeText(vehicle.color)} />
                <Detail label="Interni" value={safeText(vehicle.interior_type)} />
                <Detail label="Telaio" value={safeText(vehicle.vin)} />
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

          {vehicleHealth ? (
            <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Salute veicolo</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Score {vehicleHealth.score}/100</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] ${getHealthLevelPill(vehicleHealth.level)}`}>
                  {vehicleHealth.level}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] ${
                    vehicleHealth.publishable ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {vehicleHealth.publishable ? "Pubblicabile" : "Non pubblicabile"}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  Completezza {vehicleHealth.completeness.filled}/{vehicleHealth.completeness.total}
                </span>
              </div>

              {vehicleHealth.issues.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">Problemi da correggere</p>
                  <ul className="mt-2 space-y-1 text-sm text-red-700">
                    {vehicleHealth.issues.map((issue) => (
                      <li key={issue.code}>- {issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                  Scheda completa: nessun problema bloccante rilevato.
                </div>
              )}

              {vehicleHealth.suggestions.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Suggerimenti operativi</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {vehicleHealth.suggestions.map((suggestion) => (
                      <li key={suggestion}>- {suggestion}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Timeline veicolo</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Cronologia lifecycle</h3>
            <div className="mt-4 space-y-3">
              {timelineEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                    <p className="text-xs font-medium text-slate-500">{formatDate(event.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{event.description}</p>
                </div>
              ))}
            </div>
          </section>

          <SendToClientDialog
            open={sendDialogOpen}
            onOpenChange={setSendDialogOpen}
            vehicle={{
              id: vehicle.id,
              coverImageUrl: coverUrl,
              brand: vehicle.brand,
              model: vehicle.model,
              version: vehicle.version,
              year: vehicle.year,
              mileage: vehicle.mileage,
              fuel: vehicle.fuel,
              transmission: vehicle.transmission,
              price: vehicle.price,
            }}
          />
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
