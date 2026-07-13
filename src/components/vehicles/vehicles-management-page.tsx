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
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { evaluateVehicleHealth } from "@/lib/vehicle-health";
import { supabase } from "@/lib/supabaseClient";
import { writeVehicleTimelineEvent } from "@/lib/vehicle-timeline";
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
  validateVehicleStatusTransitionForCrud,
  resolveCoverImage,
} from "@/lib/vehicles";

type ViewMode = "card" | "table";

type SelectOptions = {
  brands: string[];
  models: string[];
  fuelTypes: string[];
  transmissionTypes: string[];
};

type VehicleOptionKey = {
  brand: string;
  model: string;
  fuel: string;
};

const PAGE_SIZE = 9;

export function VehiclesManagementPage() {
  const [filters, setFilters] = useState<VehicleFilters>(defaultVehicleFilters);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sort, setSort] = useState<VehicleSortState>({ field: "created_at", direction: "desc" });
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState<VehicleKpi[]>([]);
  const [options, setOptions] = useState<SelectOptions>({ brands: [], models: [], fuelTypes: [], transmissionTypes: [] });
  const [vehicleOptionKeys, setVehicleOptionKeys] = useState<VehicleOptionKey[]>([]);

  const [dealerName, setDealerName] = useState("Dealer Console");
  const [currentDealerId, setCurrentDealerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyVehicleId, setBusyVehicleId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const ensureDemoWriteAllowed = useCallback(async (feature: "vehicle" | "write" | "integration") => {
    if (!currentDealerId) {
      return { allowed: false, message: "Concessionaria non associata all'utente." };
    }

    const { count: vehicleCount, error: vehicleCountError } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", currentDealerId);

    if (vehicleCountError) {
      return {
        allowed: false,
        message: vehicleCountError.message || "Impossibile verificare i limiti demo per i veicoli.",
      };
    }

    const demoAccessContext = await resolveDemoAccessContext(supabase, currentDealerId, {
      vehicleCount: vehicleCount ?? 0,
    });
    const block = getDemoFeatureBlockReason(demoAccessContext, feature);

    if (block) {
      return { allowed: false, message: block.message };
    }

    return { allowed: true, message: null };
  }, [currentDealerId]);

  const resolveFuelOptionsForFilters = useCallback(
    (nextFilters: VehicleFilters) => {
      const normalizedBrand = nextFilters.brand.trim().toLowerCase();
      const normalizedModel = nextFilters.model.trim().toLowerCase();

      const scoped = vehicleOptionKeys.filter((key) => {
        const matchesBrand = !normalizedBrand || normalizedBrand === "all" || key.brand.trim().toLowerCase() === normalizedBrand;
        const matchesModel = !normalizedModel || normalizedModel === "all" || key.model.trim().toLowerCase() === normalizedModel;
        return matchesBrand && matchesModel;
      });

      if (scoped.length === 0) {
        return options.fuelTypes;
      }

      return Array.from(new Set(scoped.map((key) => key.fuel).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it-IT"));
    },
    [options.fuelTypes, vehicleOptionKeys]
  );

  const updateFilters = useCallback(
    (next: VehicleFilters) => {
      const normalizedFuel = next.fuel.trim().toLowerCase();
      const allowedFuelOptions = resolveFuelOptionsForFilters(next);
      const isFuelValid =
        !normalizedFuel ||
        normalizedFuel === "all" ||
        allowedFuelOptions.some((fuel) => fuel.trim().toLowerCase() === normalizedFuel);

      setFilters(isFuelValid ? next : { ...next, fuel: "all" });
      setPage(1);
    },
    [resolveFuelOptionsForFilters]
  );

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

    const resolveDealerContext = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (authError || !userId) {
        if (alive) {
          setCurrentDealerId(null);
          setError("Sessione non valida. Effettua di nuovo il login.");
        }
        return;
      }

      const resolvedDealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!resolvedDealerId) {
        if (alive) {
          setCurrentDealerId(null);
          setError("Concessionaria non associata all'utente.");
        }
        return;
      }

      if (alive) {
        setCurrentDealerId(resolvedDealerId);
      }
    };

    void resolveDealerContext();

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
      if (!currentDealerId) {
        if (alive) {
          setItems([]);
          setTotalCount(0);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      const { minPrice, maxPrice } = applyPriceBandFilters({ minPrice: null, maxPrice: null }, filters.priceBand);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("vehicles")
        .select(
          "id, dealer_id, brand, model, version, interior_type, engine_size, power_kw, power_cv, doors, registration_date, year, mileage, fuel, transmission, price, status, published, city, province, description, created_at, updated_at, vehicle_images(id, image_url, position, is_cover)",
          { count: "exact" }
        )
        .eq("dealer_id", currentDealerId)
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
      const signedUrlCache = new Map<string, Promise<string | null>>();

      const resolveSignedVehicleImageUrl = (rawValue: string) => {
        const normalized = rawValue.trim();
        if (!normalized) {
          return Promise.resolve(null);
        }

        if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
          if (!normalized.includes(".supabase.co")) {
            return Promise.resolve(`/api/image-proxy?url=${encodeURIComponent(normalized)}`);
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
          const { data: signed, error } = await supabase.storage
            .from("vehicle-images")
            .createSignedUrl(path, 3600);

          if (!error && signed?.signedUrl) {
            return signed.signedUrl;
          }

          return null;
        })();

        signedUrlCache.set(path, pending);
        return pending;
      };

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
              imageMap.set(row.id, await resolveSignedVehicleImageUrl(cover));
              return;
            }

            imageMap.set(row.id, `/api/image-proxy?url=${encodeURIComponent(cover)}`);
            return;
          }

          imageMap.set(row.id, await resolveSignedVehicleImageUrl(cover));
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
  }, [currentDealerId, filters, page, refreshKey, sort]);

  useEffect(() => {
    let alive = true;

    const fetchOptionsAndKpis = async () => {
      if (!currentDealerId) {
        if (alive) {
          setVehicleOptionKeys([]);
          setOptions({ brands: [], models: [], fuelTypes: [], transmissionTypes: [] });
          setKpis([
            { id: "published", label: "Veicoli pubblicati", value: "0", delta: "Totale live" },
            { id: "drafts", label: "Bozze", value: "0", delta: "Da completare" },
            { id: "sold", label: "Venduti", value: "0", delta: "Storico" },
            { id: "leads", label: "Lead ricevuti", value: "0", delta: "Su inventario" },
          ]);
        }
        return;
      }

      const [optionRowsRes, publishedRes, draftRes, soldRes, leadsRes] = await Promise.all([
        supabase.from("vehicles").select("brand, model, fuel, transmission, interior_type").eq("dealer_id", currentDealerId).limit(1000),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("dealer_id", currentDealerId).or("status.eq.published,published.eq.true"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("dealer_id", currentDealerId).or("status.eq.draft,published.eq.false,status.is.null"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("dealer_id", currentDealerId).eq("status", "sold"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealer_id", currentDealerId),
      ]);

      if (!alive) return;

      const rawOptions = optionRowsRes.data ?? [];
      const keys = rawOptions
        .map((row) => ({
          brand: String((row as { brand?: string | null }).brand ?? "").trim(),
          model: String((row as { model?: string | null }).model ?? "").trim(),
          fuel: String((row as { fuel?: string | null }).fuel ?? "").trim(),
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

      setVehicleOptionKeys(keys);
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
  }, [currentDealerId, refreshKey]);

  const handleDelete = useCallback(async (vehicleId: string) => {
    if (!currentDealerId) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    const confirmed = globalThis.confirm("Confermi l'eliminazione del veicolo?");
    if (!confirmed) return;

    const demoWrite = await ensureDemoWriteAllowed("integration");
    if (!demoWrite.allowed) {
      setError(demoWrite.message);
      return;
    }

    setBusyVehicleId(vehicleId);

    const { error: deleteError } = await supabase.from("vehicles").delete().eq("id", vehicleId).eq("dealer_id", currentDealerId);

    if (deleteError) {
      setError(deleteError.message || "Errore durante eliminazione veicolo.");
      setBusyVehicleId(null);
      return;
    }

    setBusyVehicleId(null);
    refreshData();
  }, [currentDealerId, ensureDemoWriteAllowed, refreshData]);

  const handleDeleteSelected = useCallback(async () => {
    if (!currentDealerId) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    const ids = [...selectedVehicleIds];
    if (ids.length === 0) {
      return;
    }

    const confirmed = globalThis.confirm(`Vuoi eliminare ${ids.length} veicoli selezionati?`);
    if (!confirmed) {
      return;
    }

    const demoWrite = await ensureDemoWriteAllowed("integration");
    if (!demoWrite.allowed) {
      setError(demoWrite.message);
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

    const { error: vehiclesError } = await supabase.from("vehicles").delete().eq("dealer_id", currentDealerId).in("id", ids);

    if (vehiclesError) {
      setError(vehiclesError.message || "Errore durante eliminazione veicoli selezionati.");
      setBulkDeleting(false);
      return;
    }

    setSelectedVehicleIds([]);
    setBulkDeleting(false);
    refreshData();
  }, [currentDealerId, ensureDemoWriteAllowed, refreshData, selectedVehicleIds]);

  const handleDuplicate = useCallback(async (vehicleId: string) => {
    if (!currentDealerId) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    setBusyVehicleId(vehicleId);
    setError(null);

    const demoWrite = await ensureDemoWriteAllowed("vehicle");
    if (!demoWrite.allowed) {
      setError(demoWrite.message);
      setBusyVehicleId(null);
      return;
    }

    const { data: source, error: sourceError } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .eq("dealer_id", currentDealerId)
      .maybeSingle<VehicleRow>();

    if (sourceError || !source) {
      setError(sourceError?.message || "Veicolo da duplicare non trovato.");
      setBusyVehicleId(null);
      return;
    }

    const payload: Record<string, unknown> = { ...source };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;

    const { data: inserted, error: insertError } = await supabase
      .from("vehicles")
      .insert({
        ...payload,
        dealer_id: currentDealerId,
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
  }, [currentDealerId, ensureDemoWriteAllowed, refreshData]);

  const handleTogglePublished = useCallback(async (vehicle: VehicleListItem) => {
    if (!currentDealerId) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    setBusyVehicleId(vehicle.id);
    setError(null);

    const demoWrite = await ensureDemoWriteAllowed("integration");
    if (!demoWrite.allowed) {
      setError(demoWrite.message);
      setBusyVehicleId(null);
      return;
    }

    const nextPublished = vehicle.status !== "published";
    if (nextPublished) {
      const health = evaluateVehicleHealth({ vehicle: vehicle.raw });
      if (!health.publishable) {
        const firstIssue = health.issues[0]?.message ?? "La scheda veicolo non e ancora pubblicabile.";
        setError(`Pubblicazione bloccata: ${firstIssue}`);
        setBusyVehicleId(null);
        return;
      }
    }

    const transition = validateVehicleStatusTransitionForCrud({
      fromStatus: vehicle.raw.status,
      fromPublished: vehicle.raw.published,
      toStatus: nextPublished ? "published" : "draft",
      toPublished: nextPublished,
    });

    if (!transition.allowed) {
      setError(transition.message || "Transizione stato non consentita.");
      setBusyVehicleId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("vehicles")
      .update({
        status: transition.nextStatus,
        published: transition.nextPublished,
      })
      .eq("id", vehicle.id)
      .eq("dealer_id", currentDealerId);

    if (updateError) {
      setError(updateError.message || "Errore aggiornamento stato veicolo.");
      setBusyVehicleId(null);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;

    if (vehicle.raw.dealer_id) {
      await writeVehicleTimelineEvent(supabase, {
        dealerId: vehicle.raw.dealer_id,
        vehicleId: vehicle.id,
        action: transition.nextPublished ? "vehicle.published" : "vehicle.unpublished",
        actorType: "user",
        actorProfileId,
        metadata: {
          fromStatus: String(vehicle.raw.status ?? "draft"),
          toStatus: transition.nextStatus,
        },
        before: {
          status: vehicle.raw.status,
          published: vehicle.raw.published,
        },
        after: {
          status: transition.nextStatus,
          published: transition.nextPublished,
        },
      });
    }

    setBusyVehicleId(null);
    refreshData();
  }, [currentDealerId, ensureDemoWriteAllowed, refreshData]);

  const emptyState = useMemo(() => !loading && items.length === 0, [items.length, loading]);
  const filteredModelOptions = useMemo(() => {
    const normalizedBrand = filters.brand.trim().toLowerCase();

    if (!normalizedBrand || normalizedBrand === "all") {
      return options.models;
    }

    return Array.from(
      new Set(
        vehicleOptionKeys
          .filter((pair) => pair.brand.trim().toLowerCase() === normalizedBrand)
          .map((pair) => pair.model)
      )
    ).sort((a, b) => a.localeCompare(b, "it-IT"));
  }, [filters.brand, options.models, vehicleOptionKeys]);

  const filteredFuelOptions = useMemo(() => {
    const normalizedBrand = filters.brand.trim().toLowerCase();
    const normalizedModel = filters.model.trim().toLowerCase();

    const scoped = vehicleOptionKeys.filter((key) => {
      const matchesBrand = !normalizedBrand || normalizedBrand === "all" || key.brand.trim().toLowerCase() === normalizedBrand;
      const matchesModel = !normalizedModel || normalizedModel === "all" || key.model.trim().toLowerCase() === normalizedModel;
      return matchesBrand && matchesModel;
    });

    if (scoped.length === 0) {
      return options.fuelTypes;
    }

    return Array.from(new Set(scoped.map((key) => key.fuel).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it-IT"));
  }, [filters.brand, filters.model, options.fuelTypes, vehicleOptionKeys]);

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
        options={{ ...options, models: filteredModelOptions, fuelTypes: filteredFuelOptions }}
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
