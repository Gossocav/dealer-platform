"use client";

import Link from "next/link";
import { CarFront, Plus, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { VehiclesCardGrid } from "@/components/vehicles/vehicles-card-grid";
import { VehiclesKpiGrid } from "@/components/vehicles/vehicles-kpi-grid";
import { VehiclesPagination } from "@/components/vehicles/vehicles-pagination";
import { VehiclesTable } from "@/components/vehicles/vehicles-table";
import { VehiclesToolbar } from "@/components/vehicles/vehicles-toolbar";
import { supabase } from "@/lib/supabaseClient";
import {
  applyPriceBandFilters,
  defaultVehicleFilters,
  extractVehicleImagePath,
  formatCurrency,
  formatVehicleStatus,
  normalizeVehicleStatus,
  priceBandOptions,
  safeText,
  statusOptions,
  type VehicleFilters,
  type VehicleKpi,
  type VehicleListItem,
  type VehicleRow,
  type VehicleSortState,
  resolveCoverImage,
} from "@/lib/vehicles";

type ViewMode = "card" | "table";

type SelectOptions = {
  brands: string[];
  models: string[];
  fuelTypes: string[];
  transmissionTypes: string[];
};

type BrandModelPair = {
  brand: string;
  model: string;
};

const PAGE_SIZE = 9;

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

export function VehiclesManagementPage() {
  const [filters, setFilters] = useState<VehicleFilters>(defaultVehicleFilters);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sort, setSort] = useState<VehicleSortState>({ field: "created_at", direction: "desc" });
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState<VehicleKpi[]>([]);
  const [options, setOptions] = useState<SelectOptions>({ brands: [], models: [], fuelTypes: [], transmissionTypes: [] });
  const [brandModelPairs, setBrandModelPairs] = useState<BrandModelPair[]>([]);

  const [dealerName, setDealerName] = useState("Dealer Console");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyVehicleId, setBusyVehicleId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const updateFilters = useCallback((next: VehicleFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((field: VehicleSortState["field"]) => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { field, direction: "asc" };
    });
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultVehicleFilters);
    setPage(1);
  }, []);

  const toggleVehicleSelection = useCallback((vehicleId: string) => {
    setSelectedVehicleIds((prev) => {
      if (prev.includes(vehicleId)) {
        return prev.filter((id) => id !== vehicleId);
      }
      return [...prev, vehicleId];
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedVehicleIds((prev) => {
      const visibleIds = items.map((item) => item.id);
      if (visibleIds.length === 0) {
        return prev;
      }

      const everyVisibleSelected = visibleIds.every((id) => prev.includes(id));
      if (everyVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }

      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  }, [items]);

  useEffect(() => {
    let alive = true;

    const fetchDealerName = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        return;
      }

      const { data, error: dealersError } = await supabase
        .from("dealers")
        .select("name, legal_name")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ name: string | null; legal_name: string | null }>();

      if (dealersError || !alive) {
        return;
      }

      const resolved = String(data?.name ?? data?.legal_name ?? "").trim();
      if (resolved) {
        setDealerName(resolved);
      }
    };

    void fetchDealerName();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const timeoutId = setTimeout(() => {
      void fetchVehicles();
    }, 250);

    async function fetchVehicles() {
      setLoading(true);
      setError(null);

      const { minPrice, maxPrice } = applyPriceBandFilters({ minPrice: null, maxPrice: null }, filters.priceBand);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("vehicles")
        .select(
          "id, dealer_id, brand, model, version, year, mileage, fuel, transmission, price, status, published, city, province, description, created_at, updated_at, vehicle_images(id, image_url, position, is_cover)",
          { count: "exact" }
        )
        .range(from, to)
        .order(sort.field, { ascending: sort.direction === "asc" });

      if (filters.query.trim().length > 0) {
        const q = filters.query.trim();
        query = query.or(`brand.ilike.%${q}%,model.ilike.%${q}%,version.ilike.%${q}%`);
      }

      if (filters.brand !== "all") query = query.eq("brand", filters.brand);
      if (filters.model !== "all") query = query.eq("model", filters.model);
      if (filters.fuel !== "all") query = query.eq("fuel", filters.fuel);
      if (filters.transmission !== "all") query = query.eq("transmission", filters.transmission);

      if (filters.status === "published") {
        query = query.or("status.eq.published,published.eq.true");
      } else if (filters.status === "draft") {
        query = query.or("status.eq.draft,published.eq.false,status.is.null");
      } else if (filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (typeof minPrice === "number") query = query.gte("price", minPrice);
      if (typeof maxPrice === "number") query = query.lte("price", maxPrice);

      const { data, error: vehiclesError, count } = await query;

      if (vehiclesError) {
        if (alive) {
          setError(vehiclesError.message || "Errore nel caricamento veicoli.");
          setItems([]);
          setTotalCount(0);
          setLoading(false);
        }
        return;
      }

      const rows = (data ?? []) as VehicleRow[];

      const ids = rows.map((row) => row.id);

      let leadsMap = new Map<string, number>();
      if (ids.length > 0) {
        const { data: leadsRows } = await supabase.from("leads").select("vehicle_id").in("vehicle_id", ids);
        leadsMap = new Map<string, number>();
        for (const row of leadsRows ?? []) {
          const vehicleId = String((row as { vehicle_id?: string | null }).vehicle_id ?? "").trim();
          if (!vehicleId) continue;
          leadsMap.set(vehicleId, (leadsMap.get(vehicleId) ?? 0) + 1);
        }
      }

      const imageMap = new Map<string, string | null>();

      await Promise.all(
        rows.map(async (row) => {
          const vehicleImages = Array.isArray(row.vehicle_images) ? row.vehicle_images : [];
          const cover = resolveCoverImage(vehicleImages);

          if (!cover) {
            imageMap.set(row.id, null);
            return;
          }

          if (cover.startsWith("http://") || cover.startsWith("https://")) {
            if (cover.includes(".supabase.co")) {
              const path = extractVehicleImagePath(cover);

              if (!path) {
                imageMap.set(row.id, null);
                return;
              }

              const { data: signed, error } = await supabase.storage
                .from("vehicle-images")
                .createSignedUrl(path, 3600);

              if (!error && signed?.signedUrl) {
                imageMap.set(row.id, signed.signedUrl);
                return;
              }

              imageMap.set(row.id, null);
              return;
            }

            imageMap.set(row.id, `/api/image-proxy?url=${encodeURIComponent(cover)}`);
            return;
          }

          const path = extractVehicleImagePath(cover);

          if (!path) {
            imageMap.set(row.id, null);
            return;
          }

          const { data: signed, error } = await supabase.storage
            .from("vehicle-images")
            .createSignedUrl(path, 3600);

          if (!error && signed?.signedUrl) {
            imageMap.set(row.id, signed.signedUrl);
            return;
          }

          imageMap.set(row.id, null);
        })
      );

      const nextItems = rows.map((row) => {
        const priceValue = Number(row.price ?? 0);
        const normalizedPrice = Number.isFinite(priceValue) ? priceValue : 0;
        const status = normalizeVehicleStatus(row.status, row.published);

        return {
          id: row.id,
          brand: safeText(row.brand),
          model: safeText(row.model),
          version: safeText(row.version),
          year: safeText(row.year),
          priceValue: normalizedPrice,
          priceLabel: formatCurrency(normalizedPrice),
          status,
          statusLabel: formatVehicleStatus(row.status, row.published),
          badge: status === "published" ? "Pubblicato" : status === "sold" ? "Venduto" : "Bozza",
          fuel: safeText(row.fuel),
          transmission: safeText(row.transmission),
          mainImageUrl: imageMap.get(row.id) ?? null,
          leadCount: leadsMap.get(row.id) ?? 0,
          viewsCount: 0,
          insertedAt: String(row.created_at ?? ""),
          raw: row,
        } as VehicleListItem;
      });

      if (!alive) {
        return;
      }

      setItems(nextItems);
      setSelectedVehicleIds((prev) => prev.filter((id) => nextItems.some((item) => item.id === id)));
      setTotalCount(count ?? 0);
      setLoading(false);
    }

    return () => {
      alive = false;
      clearTimeout(timeoutId);
    };
  }, [filters, page, refreshKey, sort]);

  useEffect(() => {
    let alive = true;

    const fetchOptionsAndKpis = async () => {
      const [optionRowsRes, publishedRes, draftRes, soldRes, leadsRes] = await Promise.all([
        supabase.from("vehicles").select("brand, model, fuel, transmission").limit(1000),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).or("status.eq.published,published.eq.true"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).or("status.eq.draft,published.eq.false,status.is.null"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("status", "sold"),
        supabase.from("leads").select("id", { count: "exact", head: true }),
      ]);

      if (!alive) return;

      const rawOptions = optionRowsRes.data ?? [];
      const pairs = rawOptions
        .map((row) => ({
          brand: String((row as { brand?: string | null }).brand ?? "").trim(),
          model: String((row as { model?: string | null }).model ?? "").trim(),
        }))
        .filter((row) => row.brand.length > 0 && row.model.length > 0);
      const brands = Array.from(new Set(rawOptions.map((row) => String((row as { brand?: string | null }).brand ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it-IT")
      );
      const models = Array.from(new Set(rawOptions.map((row) => String((row as { model?: string | null }).model ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it-IT")
      );
      const fuelTypes = Array.from(new Set(rawOptions.map((row) => String((row as { fuel?: string | null }).fuel ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "it-IT")
      );
      const transmissionTypes = Array.from(
        new Set(rawOptions.map((row) => String((row as { transmission?: string | null }).transmission ?? "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "it-IT"));

      setBrandModelPairs(pairs);
      setOptions({ brands, models, fuelTypes, transmissionTypes });

      setKpis([
        { id: "published", label: "Veicoli pubblicati", value: String(publishedRes.count ?? 0), delta: "Totale live" },
        { id: "drafts", label: "Bozze", value: String(draftRes.count ?? 0), delta: "Da completare" },
        { id: "sold", label: "Venduti", value: String(soldRes.count ?? 0), delta: "Storico" },
        { id: "leads", label: "Lead ricevuti", value: String(leadsRes.count ?? 0), delta: "Su inventario" },
      ]);
    };

    void fetchOptionsAndKpis();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const handleDelete = useCallback(async (vehicleId: string) => {
    const confirmed = globalThis.confirm("Confermi l'eliminazione del veicolo?");
    if (!confirmed) return;

    setBusyVehicleId(vehicleId);

    const { error: deleteError } = await supabase.from("vehicles").delete().eq("id", vehicleId);

    if (deleteError) {
      setError(deleteError.message || "Errore durante eliminazione veicolo.");
      setBusyVehicleId(null);
      return;
    }

    setBusyVehicleId(null);
    refreshData();
  }, [refreshData]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = [...selectedVehicleIds];
    if (ids.length === 0) {
      return;
    }

    const confirmed = globalThis.confirm(`Vuoi eliminare ${ids.length} veicoli selezionati?`);
    if (!confirmed) {
      return;
    }

    setBulkDeleting(true);
    setError(null);

    const { error: imagesError } = await supabase.from("vehicle_images").delete().in("vehicle_id", ids);

    if (imagesError) {
      setError(imagesError.message || "Errore durante eliminazione immagini dei veicoli selezionati.");
      setBulkDeleting(false);
      return;
    }

    const { error: vehiclesError } = await supabase.from("vehicles").delete().in("id", ids);

    if (vehiclesError) {
      setError(vehiclesError.message || "Errore durante eliminazione veicoli selezionati.");
      setBulkDeleting(false);
      return;
    }

    setSelectedVehicleIds([]);
    setBulkDeleting(false);
    refreshData();
  }, [refreshData, selectedVehicleIds]);

  const handleDuplicate = useCallback(async (vehicleId: string) => {
    setBusyVehicleId(vehicleId);
    setError(null);

    const { data: source, error: sourceError } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle<VehicleRow>();

    if (sourceError || !source) {
      setError(sourceError?.message || "Veicolo da duplicare non trovato.");
      setBusyVehicleId(null);
      return;
    }

    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...payload } = source;

    const { data: inserted, error: insertError } = await supabase
      .from("vehicles")
      .insert({
        ...payload,
        status: "draft",
        published: false,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !inserted?.id) {
      setError(insertError?.message || "Errore nella duplicazione del veicolo.");
      setBusyVehicleId(null);
      return;
    }

    const { data: sourceImages } = await supabase
      .from("vehicle_images")
      .select("image_url, position, is_cover")
      .eq("vehicle_id", vehicleId)
      .order("position", { ascending: true });

    if (Array.isArray(sourceImages) && sourceImages.length > 0) {
      await supabase.from("vehicle_images").insert(
        sourceImages.map((image, index) => ({
          vehicle_id: inserted.id,
          image_url: image.image_url,
          position: typeof image.position === "number" ? image.position : index,
          is_cover: Boolean(image.is_cover) && index === 0,
        }))
      );
    }

    setBusyVehicleId(null);
    refreshData();
  }, [refreshData]);

  const handleTogglePublished = useCallback(async (vehicle: VehicleListItem) => {
    setBusyVehicleId(vehicle.id);
    setError(null);

    const nextPublished = vehicle.status !== "published";

    const { error: updateError } = await supabase
      .from("vehicles")
      .update({
        status: nextPublished ? "published" : "draft",
        published: nextPublished,
      })
      .eq("id", vehicle.id);

    if (updateError) {
      setError(updateError.message || "Errore aggiornamento stato veicolo.");
      setBusyVehicleId(null);
      return;
    }

    setBusyVehicleId(null);
    refreshData();
  }, [refreshData]);

  const emptyState = useMemo(() => !loading && items.length === 0, [items.length, loading]);
  const filteredModelOptions = useMemo(() => {
    const normalizedBrand = filters.brand.trim().toLowerCase();

    if (!normalizedBrand || normalizedBrand === "all") {
      return options.models;
    }

    return Array.from(
      new Set(
        brandModelPairs
          .filter((pair) => pair.brand.trim().toLowerCase() === normalizedBrand)
          .map((pair) => pair.model)
      )
    ).sort((a, b) => a.localeCompare(b, "it-IT"));
  }, [brandModelPairs, filters.brand, options.models]);
  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const selectedCount = selectedVehicleIds.length;
  const everyVisibleSelected = useMemo(() => {
    if (visibleIds.length === 0) {
      return false;
    }
    return visibleIds.every((id) => selectedVehicleIds.includes(id));
  }, [selectedVehicleIds, visibleIds]);

  return (
    <DealerDashboardShell title="Gestione Veicoli" dealerName={dealerName} avatarInitials="DC" unreadNotifications={3}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inventory Hub</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Gestisci il tuo parco auto</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ricerca istantanea, filtri evoluti, ordinamento e paginazione collegati a Supabase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/veicoli/importa"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" /> Importa veicoli
            </Link>
            <Link
              href="/veicoli/nuovo"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Nuovo Veicolo
            </Link>
          </div>
        </div>
      </section>

      <VehiclesKpiGrid items={kpis} />

      <VehiclesToolbar
        filters={filters}
        onFiltersChange={updateFilters}
        options={{ ...options, models: filteredModelOptions }}
        statusOptions={statusOptions}
        priceBandOptions={priceBandOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <section className="dashboard-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <CarFront className="h-4 w-4 text-sky-600" />
            {totalCount} veicoli totali, {items.length} visualizzati in pagina.
          </span>

          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Elimina selezionati ({selectedCount})
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</section>
      ) : null}

      {loading ? (
        <section className="rounded-3xl border border-slate-200/70 bg-white px-4 py-6 text-sm text-slate-600">Caricamento veicoli in corso...</section>
      ) : null}

      {emptyState ? (
        <section className="rounded-3xl border border-slate-200/70 bg-white px-4 py-8 text-center text-sm text-slate-600">
          Nessun veicolo trovato con i filtri correnti.
          <div className="mt-3">
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset filtri
            </button>
          </div>
        </section>
      ) : null}

      {!loading && items.length > 0 ? (
        viewMode === "card" ? (
          <VehiclesCardGrid
            items={items}
            selectedVehicleIds={selectedVehicleIds}
            onToggleSelect={toggleVehicleSelection}
            onDuplicate={handleDuplicate}
            onTogglePublished={handleTogglePublished}
            onDelete={handleDelete}
            busyVehicleId={busyVehicleId}
          />
        ) : (
          <VehiclesTable
            items={items}
            sort={sort}
            selectedVehicleIds={selectedVehicleIds}
            allVisibleSelected={everyVisibleSelected}
            onToggleSelect={toggleVehicleSelection}
            onToggleSelectAll={toggleSelectAllVisible}
            onSortChange={handleSortChange}
            onDuplicate={handleDuplicate}
            onTogglePublished={handleTogglePublished}
            onDelete={handleDelete}
            busyVehicleId={busyVehicleId}
          />
        )
      ) : null}

      <VehiclesPagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
    </DealerDashboardShell>
  );
}
