"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  mileage: number | null;
  price: string;
  status: string;
  published: boolean;
  created_at?: string;
  vehicle_images?: VehicleImage[] | null;
  fuel?: string | null;
  transmission?: string | null;
  color?: string | null;
  plate?: string | null;
  vin?: string | null;
  description?: string | null;
  body_type?: string | null;
};

type VehicleImage = {
  id?: string;
  vehicle_id?: string;
  image_url?: string | null;
  position?: number | null;
  is_cover?: boolean | null;
};

const FILTERS = [
  { key: "all", label: "Tutti" },
  { key: "published", label: "Pubblicati" },
  { key: "draft", label: "Bozze" },
  { key: "sold", label: "Venduti" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];
type SortKey = "recent" | "oldest" | "price-asc" | "price-desc";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const rowsPerPage = 8;

  useEffect(() => {
    let isMounted = true;

    const loadVehicles = async () => {
      setLoading(true);
      setStatusMessage(null);
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, brand, model, version, year, mileage, price, status, published, created_at, fuel, transmission, color, plate, vin, description, body_type, vehicle_images(id, vehicle_id, image_url, position, is_cover)"
        )
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      setLoading(false);

      if (error) {
        setStatusMessage(error.message || "Errore nel recupero dei veicoli.");
        setStatusMessageType("error");
        return;
      }

      if (data) {
        const vehiclesWithResolvedImages = await Promise.all(
          (data as Vehicle[]).map(async (vehicle) => {
            const sourceImages = Array.isArray(vehicle.vehicle_images) ? vehicle.vehicle_images : [];
            const resolvedImages = await Promise.all(
              sourceImages.map(async (image) => ({
                ...image,
                image_url: (await resolveVehicleImageUrlForDisplay(image.image_url ?? null)) ?? image.image_url,
              }))
            );

            return {
              ...vehicle,
              vehicle_images: resolvedImages,
            };
          })
        );

        if (!isMounted) {
          return;
        }

        setVehicles(vehiclesWithResolvedImages);
      }
    };

    void loadVehicles();

    return () => {
      isMounted = false;
    };
  }, []);

  const openVehicleDetails = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setSelectedImageIndex(0);
    setZoomedImageUrl(null);
  };

  const closeVehicleDetails = () => {
    setSelectedVehicle(null);
    setSelectedImageIndex(0);
    setZoomedImageUrl(null);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Sei sicuro di voler eliminare questo veicolo?");
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);

    const { data, error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .select("id");
    setLoading(false);

    if (error) {
      console.error("DELETE VEHICLE ERROR", error);
      setStatusMessage(error.message || "Errore durante l'eliminazione del veicolo.");
      setStatusMessageType("error");
      return;
    }

    if (!data || data.length === 0) {
      setStatusMessage("Nessun veicolo eliminato: ID non trovato o non autorizzato.");
      setStatusMessageType("error");
      return;
    }

    setStatusMessage("Veicolo eliminato correttamente.");
    setStatusMessageType("success");
    setVehicles((current) => current.filter((item) => item.id !== id));
  };

  const filteredVehicles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = vehicles.filter((vehicle) => {
      const brandModelPlate = [vehicle.brand, vehicle.model, vehicle.plate]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || brandModelPlate.includes(normalizedSearch);

      const statusValue = getVehicleStatusValue(vehicle);
      const matchesFilter =
        filter === "all" ||
        (filter === "published" && statusValue === "published") ||
        (filter === "draft" && statusValue === "draft") ||
        (filter === "sold" && statusValue === "sold");

      return matchesSearch && matchesFilter;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "price-asc") {
        return Number(a.price ?? 0) - Number(b.price ?? 0);
      }
      if (sortBy === "price-desc") {
        return Number(b.price ?? 0) - Number(a.price ?? 0);
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      }
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [vehicles, search, filter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / rowsPerPage));
  const activePage = Math.min(page, totalPages);
  const startIndex = (activePage - 1) * rowsPerPage;
  const paginatedVehicles = filteredVehicles.slice(startIndex, startIndex + rowsPerPage);
  const selectedVehicleImages = selectedVehicle ? getVehicleImageGallery(selectedVehicle) : [];
  const selectedMainImage = selectedVehicleImages[selectedImageIndex] ?? null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="px-4 py-6 lg:px-8">
        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Veicoli</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Gestione parco auto</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Visualizza, filtra e gestisci i veicoli inseriti. La tabella è aggiornata in tempo reale con i dati effettivi di Supabase.
              </p>
            </div>
            <Link href="/veicoli/nuovo" className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
              Nuovo veicolo
            </Link>
          </div>
        </div>

        {statusMessage ? (
          <div
            className={`mb-6 rounded-3xl border px-5 py-4 text-sm ${
              statusMessageType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">Ricerca</label>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Cerca per marca, modello o targa"
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Filtri</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setFilter(item.key);
                        setPage(1);
                      }}
                      className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                        filter === item.key
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Ordina per</label>
                <select
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value as SortKey);
                    setPage(1);
                  }}
                  className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                >
                  <option value="recent">Più recenti</option>
                  <option value="oldest">Più vecchi</option>
                  <option value="price-asc">Prezzo crescente</option>
                  <option value="price-desc">Prezzo decrescente</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Elenco veicoli</p>
              <p className="mt-2 text-sm text-slate-600">{filteredVehicles.length} veicolo{filteredVehicles.length === 1 ? "" : "i"} trovato{filteredVehicles.length === 1 ? "" : "i"}.</p>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Stato: {filter === "all" ? "Tutti" : filter === "published" ? "Pubblicati" : filter === "draft" ? "Bozze" : "Venduti"}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-slate-500">Veicolo</th>
                  <th className="px-4 py-3 text-slate-500">Anno</th>
                  <th className="px-4 py-3 text-slate-500">Prezzo</th>
                  <th className="px-4 py-3 text-slate-500">Stato</th>
                  <th className="px-4 py-3 text-slate-500">Data inserimento</th>
                  <th className="px-4 py-3 text-slate-500">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-3">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        <span>Caricamento veicoli...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Nessun veicolo corrispondente.
                    </td>
                  </tr>
                ) : (
                  paginatedVehicles.map((vehicle) => {
                    const coverPhoto = getVehicleCoverPhoto(vehicle);
                    const statusValue = getVehicleStatusValue(vehicle);

                    return (
                      <tr
                        key={vehicle.id}
                        className="cursor-pointer rounded-[28px] border border-slate-200 bg-slate-50 transition hover:bg-slate-100"
                        onClick={() => openVehicleDetails(vehicle)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openVehicleDetails(vehicle);
                          }
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-[90px] w-[90px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
                              {coverPhoto ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={coverPhoto} alt={`${vehicle.brand} ${vehicle.model}`} className="h-full w-full object-cover" onError={handleVehicleImageLoadError} />
                              ) : (
                                <VehicleImagePlaceholder />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{vehicle.brand} {vehicle.model}</p>
                              <p className="mt-1 text-sm text-slate-600">{vehicle.version || "Versione non specificata"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{vehicle.year}</td>
                        <td className="px-4 py-4 text-slate-700">€{vehicle.price}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            statusValue === "published"
                              ? "bg-emerald-100 text-emerald-700"
                              : statusValue === "sold"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-200 text-slate-700"
                          }`}>
                            {getVehicleStatusLabel(statusValue)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{formatDate(vehicle.created_at)}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openVehicleDetails(vehicle);
                              }}
                              className="rounded-3xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                            >
                              Visualizza
                            </button>
                            <Link
                              href={`/veicoli/nuovo?id=${vehicle.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="rounded-3xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                            >
                              Modifica
                            </Link>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDelete(vehicle.id);
                              }}
                              className="rounded-3xl bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-200"
                            >
                              Elimina
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Mostrando {Math.min(startIndex + 1, filteredVehicles.length)}-{Math.min(startIndex + rowsPerPage, filteredVehicles.length)} di {filteredVehicles.length} veicoli
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="rounded-3xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Precedente
              </button>
              <span className="rounded-3xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                Pagina {page} di {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="rounded-3xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Successiva
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedVehicle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Scheda veicolo</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900">{selectedVehicle.brand} {selectedVehicle.model}</h2>
                <p className="mt-2 text-sm text-slate-600">{selectedVehicle.version || "Versione non specificata"}</p>
              </div>
              <button
                type="button"
                onClick={closeVehicleDetails}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Chiudi
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div className="h-72 overflow-hidden rounded-[24px] bg-slate-200">
                  {selectedMainImage ? (
                    <button
                      type="button"
                      onClick={() => setZoomedImageUrl(selectedMainImage)}
                      className="h-full w-full"
                      aria-label="Apri zoom immagine"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedMainImage} alt={`${selectedVehicle.brand} ${selectedVehicle.model}`} className="h-full w-full object-cover" onError={handleVehicleImageLoadError} />
                    </button>
                  ) : (
                    <VehicleImagePlaceholder />
                  )}
                </div>
                {selectedVehicleImages.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedVehicleImages.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() => setSelectedImageIndex(index)}
                        className={`h-16 w-16 overflow-hidden rounded-xl border bg-slate-200 ${
                          selectedImageIndex === index ? "border-blue-500" : "border-slate-200"
                        }`}
                        aria-label={`Mostra immagine ${index + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image} alt={`Miniatura ${index + 1}`} className="h-full w-full object-cover" onError={handleVehicleImageLoadError} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <DetailRow label="Marca" value={selectedVehicle.brand} />
                <DetailRow label="Modello" value={selectedVehicle.model} />
                <DetailRow label="Anno" value={selectedVehicle.year} />
                <DetailRow label="Prezzo" value={`€${selectedVehicle.price}`} />
                <DetailRow label="Stato" value={getVehicleStatusLabel(getVehicleStatusValue(selectedVehicle))} />
                <DetailRow label="Alimentazione" value={selectedVehicle.fuel ?? "-"} />
                <DetailRow label="Cambio" value={selectedVehicle.transmission ?? "-"} />
                <DetailRow label="Colore" value={selectedVehicle.color ?? "-"} />
                <DetailRow label="Targa" value={selectedVehicle.plate ?? "-"} />
                <DetailRow label="Telaio" value={selectedVehicle.vin ?? "-"} />
                <DetailRow label="Data inserimento" value={formatDate(selectedVehicle.created_at)} />
                <DetailRow label="Descrizione" value={selectedVehicle.description ?? "-"} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {zoomedImageUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 py-6"
          onClick={() => setZoomedImageUrl(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setZoomedImageUrl(null);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomedImageUrl}
            alt="Zoom immagine veicolo"
            className="max-h-[88vh] max-w-[92vw] rounded-3xl object-contain"
            onClick={(event) => event.stopPropagation()}
            onError={handleVehicleImageLoadError}
          />
        </div>
      ) : null}
    </main>
  );
}

function getVehicleStatusValue(vehicle: Vehicle) {
  const normalizedStatus = String(vehicle.status ?? "").trim().toLowerCase();
  if (normalizedStatus === "published" || normalizedStatus === "pubblicato") {
    return "published";
  }
  if (normalizedStatus === "sold" || normalizedStatus === "venduto") {
    return "sold";
  }
  if (vehicle.published) {
    return "published";
  }
  return "draft";
}

function getVehicleCoverPhoto(vehicle: Vehicle) {
  const images = getVehicleImageGallery(vehicle);
  return images[0] ?? null;
}

function getVehicleImageGallery(vehicle: Vehicle) {
  if (!Array.isArray(vehicle.vehicle_images) || vehicle.vehicle_images.length === 0) {
    return [] as string[];
  }

  return [...vehicle.vehicle_images]
    .sort((a, b) => {
      const aCover = a.is_cover ? 1 : 0;
      const bCover = b.is_cover ? 1 : 0;
      if (aCover !== bCover) {
        return bCover - aCover;
      }

      const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      if (aPosition !== bPosition) {
        return aPosition - bPosition;
      }

      return 0;
    })
    .map((image) => resolveVehicleImageUrl(image.image_url ?? null))
    .filter((image): image is string => image !== null && isSupportedImageReference(image));
}

function resolveVehicleImageUrl(rawValue?: string | null) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const normalizedPath = value.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
  const { data } = supabase.storage.from("vehicle-images").getPublicUrl(normalizedPath);
  return data.publicUrl;
}

function handleVehicleImageLoadError(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.src = getImageFallbackDataUri();
}

function getImageFallbackDataUri() {
  return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e2e8f0"/><path d="M29 44a13 13 0 0 0-13 13v20a13 13 0 0 0 13 13h8.5a10.5 10.5 0 1 0 21 0h4a10.5 10.5 0 1 0 21 0H91a13 13 0 0 0 13-13V57a13 13 0 0 0-13-13h-9.8a4 4 0 0 1-3.3-1.8l-2.6-4A8 8 0 0 0 68.9 34H48.4a8 8 0 0 0-6.6 3.5l-2.6 4A4 4 0 0 1 35.9 44H29Zm16 38a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm28 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" fill="#64748b"/></svg>');
}

function isSupportedImageReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const allowed = new Set(["jpg", "jpeg", "png", "webp"]);
  const directExt = trimmed.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  if (allowed.has(directExt)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
    return allowed.has(ext);
  } catch {
    return false;
  }
}

async function resolveVehicleImageUrlForDisplay(rawValue?: string | null, explicitStoragePath?: string | null) {
  const value = String(rawValue ?? "").trim();
  const storagePath = explicitStoragePath && explicitStoragePath.length > 0
    ? explicitStoragePath
    : (value ? extractVehicleImagePath(value) : null);

  if (!storagePath) {
    return value || null;
  }

  const { data: signedData, error: signedError } = await supabase
    .storage
    .from("vehicle-images")
    .createSignedUrl(storagePath, 60 * 60);

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  const { data: publicUrlData } = supabase.storage.from("vehicle-images").getPublicUrl(storagePath);
  return publicUrlData.publicUrl || value;
}

function extractVehicleImagePath(value: string) {
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const publicPrefix = "/storage/v1/object/public/vehicle-images/";
      const signedPrefix = "/storage/v1/object/sign/vehicle-images/";

      if (parsed.pathname.includes(publicPrefix)) {
        const path = parsed.pathname.split(publicPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      if (parsed.pathname.includes(signedPrefix)) {
        const path = parsed.pathname.split(signedPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  return value.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
}

function getVehicleStatusLabel(status: string) {
  if (status === "published") return "Pubblicato";
  if (status === "sold") return "Venduto";
  return "Bozza";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function VehicleImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center text-slate-500">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 fill-current">
        <path d="M5 6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5a2.5 2.5 0 1 0 5 0h1a2.5 2.5 0 1 0 5 0H19a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.35a1 1 0 0 1-.83-.45l-.64-.97A2 2 0 0 0 14.53 4h-5.1a2 2 0 0 0-1.65.88l-.64.97A1 1 0 0 1 6.31 6H5Zm4 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
    </div>
  );
}
