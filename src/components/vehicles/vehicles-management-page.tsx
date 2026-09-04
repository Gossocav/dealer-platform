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
import { caricaTutto } from "@/lib/carica-tutto";
import {
  pianoCambioStatoDiGruppo,
  riassumiLasciateStare,
  type VersoDelCambio,
} from "@/lib/cambio-stato-di-gruppo";
import { supabase } from "@/lib/supabaseClient";
import { writeVehicleTimelineEvent } from "@/lib/vehicle-timeline";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyPriceBandFilters,
  defaultVehicleFilters,
  formatCurrency,
  formatMileage,
  formatRegistrationLabel,
  formatVehicleStatus,
  resolveVehicleImageSource,
  vehicleSortFromValue,
  vehicleSortToValue,
  normalizeVehicleStatus,
  priceBandOptions,
  conditionOptions,
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

/**
 * Le colonne che servono a disegnare una riga **e** a decidere se e'
 * pubblicabile. Sono una costante perche' le legge anche il comando di
 * gruppo: `evaluateVehicleHealth` guarda prezzo, chilometri, dati tecnici e
 * fotografie, e con un elenco piu' corto direbbe "scheda incompleta" su
 * vetture che invece sono a posto.
 */
const COLONNE_VEICOLO =
  "id, dealer_id, brand, model, version, interior_type, engine_size, power_kw, power_cv, doors, registration_date, registration_month, year, mileage, fuel, transmission, price, status, published, city, province, description, created_at, updated_at, import_missing_since, vehicle_images(id, image_url, position, is_cover)";

/**
 * Filtri, pagina, ordinamento e vista scritti nell'indirizzo.
 *
 * Prima vivevano solo in memoria: uscendo da un veicolo e tornando indietro
 * l'elenco ripartiva dalla prima pagina, senza filtri -- anche premendo la
 * freccia del browser, perche' quello che si riapriva era la stessa pagina
 * ricostruita da zero.
 *
 * Nell'indirizzo servono anche a un'altra cosa: un elenco filtrato si puo'
 * mandare a qualcuno o tenere fra i preferiti.
 */
function statoDaIndirizzo(params: URLSearchParams) {
  const testo = (chiave: string, predefinito: string) => params.get(chiave)?.trim() || predefinito;

  const filtri: VehicleFilters = {
    query: testo("cerca", defaultVehicleFilters.query),
    brand: testo("marca", defaultVehicleFilters.brand),
    model: testo("modello", defaultVehicleFilters.model),
    fuel: testo("alimentazione", defaultVehicleFilters.fuel),
    transmission: testo("cambio", defaultVehicleFilters.transmission),
    condition: testo("condizione", defaultVehicleFilters.condition),
    status: testo("stato", defaultVehicleFilters.status),
    priceBand: testo("prezzo", defaultVehicleFilters.priceBand),
  };

  const paginaGrezza = Number(params.get("pagina"));
  const pagina = Number.isFinite(paginaGrezza) && paginaGrezza >= 1 ? Math.floor(paginaGrezza) : 1;

  const vista: ViewMode = params.get("vista") === "table" ? "table" : "card";
  const ordinamento = vehicleSortFromValue(testo("ordine", "")) ?? { field: "created_at" as const, direction: "desc" as const };

  return { filtri, pagina, vista, ordinamento };
}

function indirizzoDaStato(filters: VehicleFilters, page: number, viewMode: ViewMode, sort: VehicleSortState) {
  const params = new URLSearchParams();
  const aggiungi = (chiave: string, valore: string, predefinito: string) => {
    if (valore && valore !== predefinito) params.set(chiave, valore);
  };

  aggiungi("cerca", filters.query, defaultVehicleFilters.query);
  aggiungi("marca", filters.brand, defaultVehicleFilters.brand);
  aggiungi("modello", filters.model, defaultVehicleFilters.model);
  aggiungi("alimentazione", filters.fuel, defaultVehicleFilters.fuel);
  aggiungi("cambio", filters.transmission, defaultVehicleFilters.transmission);
  aggiungi("condizione", filters.condition, defaultVehicleFilters.condition);
  aggiungi("stato", filters.status, defaultVehicleFilters.status);
  aggiungi("prezzo", filters.priceBand, defaultVehicleFilters.priceBand);

  if (page > 1) params.set("pagina", String(page));
  if (viewMode !== "card") params.set("vista", viewMode);

  const ordine = vehicleSortToValue(sort);
  if (ordine !== "created_at:desc") params.set("ordine", ordine);

  return params.toString();
}

/**
 * I filtri dell'elenco, applicati a una interrogazione qualsiasi.
 *
 * Erano scritti dentro l'effetto che carica la pagina. Sono usciti di li'
 * quando sono arrivati i comandi "pubblica tutte" e "metti tutte in bozza":
 * quei due devono agire **esattamente** sull'elenco che il concessionario ha
 * davanti, e due copie degli stessi filtri prima o poi divergono -- il giorno
 * che divergono, il bottone tocca vetture che non erano nell'elenco.
 */
function applicaFiltriVeicoli<
  Q extends {
    or(filtro: string): Q;
    eq(colonna: string, valore: string): Q;
    gte(colonna: string, valore: number): Q;
    lte(colonna: string, valore: number): Q;
  },
>(query: Q, filters: VehicleFilters, minPrice: number | null, maxPrice: number | null): Q {
  let q = query;

  if (filters.query.trim().length > 0) {
    const cercato = filters.query.trim();
    q = q.or(`brand.ilike.%${cercato}%,model.ilike.%${cercato}%,version.ilike.%${cercato}%`);
  }

  if (filters.brand !== "all") q = q.eq("brand", filters.brand);
  if (filters.model !== "all") q = q.eq("model", filters.model);
  if (filters.fuel !== "all") q = q.eq("fuel", filters.fuel);
  if (filters.transmission !== "all") q = q.eq("transmission", filters.transmission);
  // Confronto esatto: nel database la condizione e' sempre una delle quattro
  // scritte in `vehicle-conditions.ts`, perche' tutte e tre le strade che
  // scrivono una vettura -- modulo, importazione da file e sincronizzazione
  // dal sito -- passano di li'.
  if (filters.condition !== "all") q = q.eq("vehicle_condition", filters.condition);

  if (filters.status === "published") {
    q = q.or("status.eq.published,published.eq.true");
  } else if (filters.status === "draft") {
    q = q.or("status.eq.draft,published.eq.false,status.is.null");
  } else if (filters.status !== "all") {
    q = q.eq("status", filters.status);
  }

  if (typeof minPrice === "number") q = q.gte("price", minPrice);
  if (typeof maxPrice === "number") q = q.lte("price", maxPrice);

  return q;
}

export function VehiclesManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Si legge una volta sola, all'apertura: da li' in poi comanda lo stato, e
  // l'indirizzo lo segue.
  const [iniziale] = useState(() => statoDaIndirizzo(new URLSearchParams(searchParams.toString())));

  const [filters, setFilters] = useState<VehicleFilters>(iniziale.filtri);
  const [viewMode, setViewMode] = useState<ViewMode>(iniziale.vista);
  const [sort, setSort] = useState<VehicleSortState>(iniziale.ordinamento);
  const [page, setPage] = useState(iniziale.pagina);

  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState<VehicleKpi[]>([]);
  const [options, setOptions] = useState<SelectOptions>({ brands: [], models: [], fuelTypes: [], transmissionTypes: [] });
  const [vehicleOptionKeys, setVehicleOptionKeys] = useState<VehicleOptionKey[]>([]);

  const [dealerName, setDealerName] = useState("");
  const [currentDealerId, setCurrentDealerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyVehicleId, setBusyVehicleId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  // Il comando su tutto il parco lavora una vettura per volta e puo' durare
  // un minuto: senza un avanzamento a schermo sembra bloccato, e il
  // concessionario ricarica la pagina a meta' strada.
  const [avanzamentoTutti, setAvanzamentoTutti] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // L'indirizzo segue lo stato. "replace" e non "push": cambiare un filtro
  // non deve riempire la cronologia del browser di passaggi intermedi, o la
  // freccia indietro diventerebbe inutilizzabile.
  useEffect(() => {
    const query = indirizzoDaStato(filters, page, viewMode, sort);
    const attuale = searchParams.toString();

    if (query === attuale) return;

    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, page, viewMode, sort, pathname, router, searchParams]);

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

  // Dalle intestazioni della tabella si sceglie il campo e il verso si
  // alterna; dalla tendina si sceglie la coppia gia' fatta.
  const handleSortSelection = useCallback((next: VehicleSortState) => {
    setSort(next);
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
        .select(COLONNE_VEICOLO, { count: "exact" })
        .eq("dealer_id", currentDealerId)
        .range(from, to)
        // I veicoli senza prezzo o senza chilometri finiscono in fondo in
        // entrambi i versi. Senza questo, Postgres considera il valore
        // mancante come il piu' grande: in ordine decrescente le auto senza
        // prezzo aprirebbero l'elenco.
        .order(sort.field, { ascending: sort.direction === "asc", nullsFirst: false });

      query = applicaFiltriVeicoli(query, filters, minPrice, maxPrice);

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
        const { data: leadsRows } = await supabase.from("leads").select("vehicle_id").eq("dealer_id", currentDealerId).in("vehicle_id", ids);
        leadsMap = new Map<string, number>();
        for (const row of leadsRows ?? []) {
          const vehicleId = String((row as { vehicle_id?: string | null }).vehicle_id ?? "").trim();
          if (!vehicleId) continue;
          leadsMap.set(vehicleId, (leadsMap.get(vehicleId) ?? 0) + 1);
        }
      }

      const imageMap = new Map<string, string | null>();
      const imageUrlCache = new Map<string, Promise<string | null>>();

      const resolveVehiclePhotoUrl = (rawValue: string) => {
        // La stessa decisione dell'editor veicolo, adesso presa in un posto
        // solo: qui cercava ".supabase.co" dentro la stringa, e un indirizzo
        // esterno con quel testo nel percorso l'avrebbe ingannata.
        const source = resolveVehicleImageSource(rawValue);

        if (source.kind === "proxy") {
          return Promise.resolve(source.url);
        }

        if (source.kind === "nessuna") {
          return Promise.resolve(null);
        }

        const path = source.path;
        const cached = imageUrlCache.get(path);
        if (cached) {
          return cached;
        }

        // Production's "vehicle-images" bucket is actually private (drifted
        // from the migration that declares it public -- verified against the
        // Storage API). getPublicUrl() alone builds a URL the browser can't
        // load there, which shows the broken <img>'s alt text instead of the
        // photo. createSignedUrl() works regardless of the bucket's
        // public/private setting, so try that first, with the public URL as
        // a fallback rather than leaving the thumbnail blank.
        const pending = (async () => {
          const { data: signed, error } = await supabase.storage.from("vehicle-images").createSignedUrl(path, 3600);
          if (!error && signed?.signedUrl) {
            return signed.signedUrl;
          }

          const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
          return publicData.publicUrl || null;
        })();

        imageUrlCache.set(path, pending);
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

          // La distinzione fra foto nostra e foto importata era scritta due
          // volte, qui e dentro resolveVehiclePhotoUrl, con due controlli
          // diversi. Ne basta uno: quella funzione le tratta gia' entrambe.
          imageMap.set(row.id, await resolveVehiclePhotoUrl(cover));
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
          registration:
            formatRegistrationLabel({
              registration_date: row.registration_date,
              registration_month: row.registration_month,
              year: row.year,
            }) ?? "-",
          priceValue: normalizedPrice,
          priceLabel: formatCurrency(normalizedPrice),
          status,
          statusLabel: formatVehicleStatus(row.status, row.published),
          // Un veicolo che la sincronizzazione ha tolto dalla vetrina deve
          // dire perche': senza, il concessionario lo trova "in revisione"
          // senza aver toccato niente, e sembra un guasto.
          badge: row.import_missing_since
            ? "Non piu' sul tuo sito"
            : status === "published"
              ? "Pubblicato"
              : status === "sold"
                ? "Venduto"
                : "Bozza",
          fuel: safeText(row.fuel),
          transmission: safeText(row.transmission),
          mileageLabel: formatMileage(row.mileage),
          mainImageUrl: imageMap.get(row.id) ?? null,
          leadCount: leadsMap.get(row.id) ?? 0,
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

  /**
   * Pubblica in una volta sola i veicoli selezionati.
   *
   * Con un catalogo importato dal sito della concessionaria, pubblicare uno
   * per uno significa centocinque clic. Le verifiche restano quelle della
   * pubblicazione singola -- scheda completa, passaggio di stato consentito --
   * e vengono fatte veicolo per veicolo: uno incompleto non blocca gli altri,
   * viene saltato e alla fine si dice quanti e perche'.
   *
   * Il tetto di annunci del piano lo impone il database. Quando scatta, ci si
   * ferma li' e lo si riporta con le sue parole: continuare significherebbe
   * accumulare rifiuti identici.
   */
  const handlePublishSelected = useCallback(async () => {
    if (!currentDealerId) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    const daPubblicare = items.filter(
      (vehicle) => selectedVehicleIds.includes(vehicle.id) && vehicle.status !== "published"
    );

    if (daPubblicare.length === 0) {
      setNotice("I veicoli selezionati sono gia' pubblicati.");
      return;
    }

    const confermato = globalThis.confirm(
      `Vuoi pubblicare ${daPubblicare.length} veicoli? Compariranno sul marketplace pubblico.`
    );
    if (!confermato) return;

    setBulkPublishing(true);
    setError(null);
    setNotice(null);

    const demoWrite = await ensureDemoWriteAllowed("integration");
    if (!demoWrite.allowed) {
      setError(demoWrite.message);
      setBulkPublishing(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;

    let pubblicati = 0;
    const saltati: string[] = [];
    let limiteDelPiano: string | null = null;

    for (const vehicle of daPubblicare) {
      const etichetta = `${vehicle.brand} ${vehicle.model}`.trim() || vehicle.id;

      const health = evaluateVehicleHealth({ vehicle: vehicle.raw });
      if (!health.publishable) {
        saltati.push(`${etichetta}: ${health.issues[0]?.message ?? "scheda non pubblicabile"}`);
        continue;
      }

      const transition = validateVehicleStatusTransitionForCrud({
        fromStatus: vehicle.raw.status,
        fromPublished: vehicle.raw.published,
        toStatus: "published",
        toPublished: true,
      });

      if (!transition.allowed) {
        saltati.push(`${etichetta}: ${transition.message ?? "passaggio di stato non consentito"}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("vehicles")
        .update({ status: transition.nextStatus, published: transition.nextPublished })
        .eq("id", vehicle.id)
        .eq("dealer_id", currentDealerId);

      if (updateError) {
        // Il tetto del piano non e' un errore del singolo veicolo: e' la fine
        // dello spazio disponibile, e vale per tutti quelli dopo.
        if (updateError.message.includes("limite di")) {
          limiteDelPiano = updateError.message;
          break;
        }

        saltati.push(`${etichetta}: ${updateError.message}`);
        continue;
      }

      pubblicati += 1;

      if (vehicle.raw.dealer_id) {
        await writeVehicleTimelineEvent(supabase, {
          dealerId: vehicle.raw.dealer_id,
          vehicleId: vehicle.id,
          action: "vehicle.published",
          actorType: "user",
          actorProfileId,
          metadata: { fromStatus: String(vehicle.raw.status ?? "draft"), toStatus: transition.nextStatus },
          before: { status: vehicle.raw.status, published: vehicle.raw.published },
          after: { status: transition.nextStatus, published: transition.nextPublished },
        });
      }
    }

    setBulkPublishing(false);
    setSelectedVehicleIds([]);

    const riepilogo = [`Pubblicati ${pubblicati} veicoli su ${daPubblicare.length}.`];
    if (limiteDelPiano) riepilogo.push(limiteDelPiano);
    if (saltati.length > 0) {
      riepilogo.push(`Saltati ${saltati.length}: ${saltati.slice(0, 3).join("; ")}${saltati.length > 3 ? "; ..." : ""}`);
    }

    const messaggio = riepilogo.join(" ");
    if (limiteDelPiano || saltati.length > 0) {
      setError(messaggio);
    } else {
      setNotice(messaggio);
    }

    await refreshData();
  }, [currentDealerId, ensureDemoWriteAllowed, items, refreshData, selectedVehicleIds]);

  /**
   * Pubblica, oppure rimette in bozza, **tutte** le vetture dell'elenco che il
   * concessionario ha davanti -- non solo le nove della pagina.
   *
   * Chiesto dal titolare il 04/09/2026: la pagina ne mostra nove per volta, e
   * con duecento automobili l'azione sui selezionati vuole ventotto passaggi.
   *
   * Tre cautele, tutte necessarie:
   *
   * 1. **Si tocca solo la sponda giusta.** Chi decide e' il piano puro in
   *    `cambio-stato-di-gruppo`: pubblicando si toccano le bozze, mettendo in
   *    bozza le pubblicate. Vendute, prenotate, in trattativa e "da
   *    controllare" restano dove sono, e si dice quante sono. La macchina a
   *    stati da sola non lo impedirebbe: consente il passaggio anche da
   *    "venduta", perche' e' pensata per un comando dato guardando una
   *    vettura, non per uno che ne tocca duecento alla cieca.
   * 2. **Il tetto del piano ferma tutto, non salta una riga.** Quando il
   *    database rifiuta per il limite di annunci, non c'e' piu' posto per
   *    nessuna delle successive: si smette e lo si scrive.
   * 3. **Una scheda per volta.** Il tetto e' un controllo che il database fa
   *    riga per riga: un aggiornamento unico su duecento righe verrebbe
   *    rifiutato per intero alla cinquantunesima, e non ne pubblicherebbe
   *    nessuna.
   */
  const handleCambiaStatoDiTutti = useCallback(
    async (verso: VersoDelCambio) => {
      if (!currentDealerId) {
        setError("Concessionaria non associata all'utente.");
        return;
      }

      setError(null);
      setNotice(null);
      setAvanzamentoTutti("Conto le vetture...");

      const { minPrice, maxPrice } = applyPriceBandFilters({ minPrice: null, maxPrice: null }, filters.priceBand);

      // Si rilegge dal database invece di usare `items`: quello e' solo la
      // pagina corrente, nove vetture. I filtri sono gli stessi dell'elenco.
      const { righe, error: erroreLettura } = await caricaTutto<VehicleRow>(async (da, a) => {
        const query = supabase
          .from("vehicles")
          .select(COLONNE_VEICOLO)
          .eq("dealer_id", currentDealerId)
          .range(da, a)
          .order(sort.field, { ascending: sort.direction === "asc", nullsFirst: false });

        const { data, error: erroreBlocco } = await applicaFiltriVeicoli(query, filters, minPrice, maxPrice);
        return { data: (data ?? []) as VehicleRow[], error: erroreBlocco };
      });

      if (erroreLettura) {
        setAvanzamentoTutti(null);
        setError(erroreLettura.message || "Non siamo riusciti a leggere il parco auto.");
        return;
      }

      const piano = pianoCambioStatoDiGruppo(righe, verso);
      const azione = verso === "published" ? "pubblicare" : "mettere in bozza";

      if (piano.daCambiare.length === 0) {
        setAvanzamentoTutti(null);
        const lasciate = riassumiLasciateStare(piano.lasciateStare);
        setNotice(
          `Nessuna vettura da ${azione}.` +
            (piano.giaCosi > 0 ? ` ${piano.giaCosi} sono gia' cosi'.` : "") +
            (lasciate ? ` Restano fuori: ${lasciate}.` : "")
        );
        return;
      }

      const lasciate = riassumiLasciateStare(piano.lasciateStare);
      const conferma =
        verso === "published"
          ? `Vuoi pubblicare ${piano.daCambiare.length} vetture? Compariranno sul marketplace pubblico.`
          : `Vuoi mettere in bozza ${piano.daCambiare.length} vetture? Spariranno dal marketplace pubblico.`;

      const confermato = globalThis.confirm(
        conferma + (lasciate ? `\n\nNon vengono toccate: ${lasciate}.` : "")
      );
      if (!confermato) {
        setAvanzamentoTutti(null);
        return;
      }

      const demoWrite = await ensureDemoWriteAllowed("integration");
      if (!demoWrite.allowed) {
        setAvanzamentoTutti(null);
        setError(demoWrite.message);
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const actorProfileId = authData.user?.id ?? null;

      let fatte = 0;
      const saltate: string[] = [];
      let limiteDelPiano: string | null = null;

      for (const [indice, riga] of piano.daCambiare.entries()) {
        setAvanzamentoTutti(`${indice + 1} di ${piano.daCambiare.length}...`);

        const etichetta = `${riga.brand ?? ""} ${riga.model ?? ""}`.trim() || riga.id;

        if (verso === "published") {
          const salute = evaluateVehicleHealth({ vehicle: riga });
          if (!salute.publishable) {
            saltate.push(`${etichetta}: ${salute.issues[0]?.message ?? "scheda non pubblicabile"}`);
            continue;
          }
        }

        const transizione = validateVehicleStatusTransitionForCrud({
          fromStatus: riga.status,
          fromPublished: riga.published,
          toStatus: verso,
          toPublished: verso === "published",
        });

        if (!transizione.allowed) {
          saltate.push(`${etichetta}: ${transizione.message ?? "passaggio di stato non consentito"}`);
          continue;
        }

        const { error: erroreScrittura } = await supabase
          .from("vehicles")
          .update({ status: transizione.nextStatus, published: transizione.nextPublished })
          .eq("id", riga.id)
          .eq("dealer_id", currentDealerId);

        if (erroreScrittura) {
          if (erroreScrittura.message.includes("limite di")) {
            limiteDelPiano = erroreScrittura.message;
            break;
          }
          saltate.push(`${etichetta}: ${erroreScrittura.message}`);
          continue;
        }

        fatte += 1;

        if (riga.dealer_id) {
          await writeVehicleTimelineEvent(supabase, {
            dealerId: riga.dealer_id,
            vehicleId: riga.id,
            action: verso === "published" ? "vehicle.published" : "vehicle.unpublished",
            actorType: "user",
            actorProfileId,
            metadata: { fromStatus: String(riga.status ?? "draft"), toStatus: transizione.nextStatus },
            before: { status: riga.status, published: riga.published },
            after: { status: transizione.nextStatus, published: transizione.nextPublished },
          });
        }
      }

      setAvanzamentoTutti(null);
      setSelectedVehicleIds([]);

      const verbo = verso === "published" ? "Pubblicate" : "Messe in bozza";
      const riepilogo = [`${verbo} ${fatte} vetture su ${piano.daCambiare.length}.`];
      if (limiteDelPiano) riepilogo.push(limiteDelPiano);
      if (lasciate) riepilogo.push(`Non toccate: ${lasciate}.`);
      if (saltate.length > 0) {
        riepilogo.push(
          `Saltate ${saltate.length}: ${saltate.slice(0, 3).join("; ")}${saltate.length > 3 ? "; ..." : ""}`
        );
      }

      const messaggio = riepilogo.join(" ");
      if (limiteDelPiano || saltate.length > 0) setError(messaggio);
      else setNotice(messaggio);

      await refreshData();
    },
    [currentDealerId, ensureDemoWriteAllowed, filters, refreshData, sort]
  );

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

    const { error: imagesError } = await supabase.from("vehicle_images").delete().eq("dealer_id", currentDealerId).in("vehicle_id", ids);

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
      .eq("dealer_id", currentDealerId)
      .order("position", { ascending: true });

    if (Array.isArray(sourceImages) && sourceImages.length > 0) {
      await supabase.from("vehicle_images").insert(
        sourceImages.map((image, index) => ({
          vehicle_id: inserted.id,
          // Le copie nascono con la concessionaria scritta sopra: una
          // fotografia senza proprietario non e' di nessuno, e da quando le
          // regole del database legano la lettura al proprietario non
          // sarebbe piu' visibile nemmeno a chi l'ha duplicata.
          dealer_id: currentDealerId,
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
    <DealerDashboardShell title="Gestione Veicoli" dealerName={dealerName}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inventory Hub</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Gestisci il tuo parco auto</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ricerca, filtri, ordinamento e pagine per trovare in fretta il veicolo che cerchi.
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
        conditionOptions={conditionOptions}
        statusOptions={statusOptions}
        priceBandOptions={priceBandOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sort={sort}
        onSortChange={handleSortSelection}
      />

      <section className="dashboard-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <CarFront className="h-4 w-4 text-blue-600" />
            {totalCount} veicoli totali, {items.length} visualizzati in pagina.
          </span>

          {/* I comandi su tutto il parco stanno qui, e spariscono appena si
              seleziona qualcosa: due file di bottoni che dicono "pubblica"
              con portate diverse, una accanto all'altra, sono un errore che
              aspetta di essere commesso. */}
          {selectedCount === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCambiaStatoDiTutti("published")}
                disabled={avanzamentoTutti !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {avanzamentoTutti ?? "Pubblica tutte"}
              </button>
              <button
                type="button"
                onClick={() => void handleCambiaStatoDiTutti("draft")}
                disabled={avanzamentoTutti !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Metti tutte in bozza
              </button>
            </div>
          ) : null}

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePublishSelected}
              disabled={bulkPublishing || bulkDeleting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkPublishing ? "Pubblicazione in corso..." : `Pubblica selezionati (${selectedCount})`}
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Elimina selezionati ({selectedCount})
            </button>
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</section>
      ) : null}

      {notice ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</section>
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
