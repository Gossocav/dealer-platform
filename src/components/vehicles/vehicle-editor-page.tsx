"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { VEHICLE_EQUIPMENT_OPTIONS } from "@/lib/vehicle-equipment-options";
import { canonicalizeVehicleColorLabel, VEHICLE_COLOR_OPTIONS } from "@/lib/vehicle-colors";
import { ITALIAN_CITIES_BY_PROVINCE, ITALIAN_PROVINCES, type ItalianProvinceCode } from "@/lib/italian-locations";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { demoAccessMessageFromUnknown, getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { evaluateVehicleHealth } from "@/lib/vehicle-health";
import { supabase } from "@/lib/supabaseClient";
import { writeVehicleTimelineEvent } from "@/lib/vehicle-timeline";
import {
  extractVehicleImagePath,
  formatVehicleStatus,
  normalizeVehicleTraction,
  safeText,
  validateVehicleStatusTransitionForCrud,
  VEHICLE_TRACTION_OPTIONS,
  type VehicleImageRow,
  type VehicleRow,
} from "@/lib/vehicles";

type VehicleEditorPageProps = {
  mode: "create" | "edit";
  vehicleId?: string;
};

type EditorState = {
  brand: string;
  model: string;
  version: string;
  interiorType: string;
  year: string;
  engineSize: string;
  traction: string;
  powerKw: string;
  powerCv: string;
  doors: string;
  emissionClass: string;
  registrationDate: string;
  color: string;
  vin: string;
  mileage: string;
  fuel: string;
  transmission: string;
  price: string;
  city: string;
  province: string;
  description: string;
  equipment: string[];
  status: string;
};

const REQUIRED_EDITOR_FIELDS = [
  "brand",
  "model",
  "version",
  "interiorType",
  "price",
  "mileage",
  "fuel",
  "transmission",
  "engineSize",
  "powerKw",
  "powerCv",
  "doors",
  "registrationDate",
  "color",
  "city",
  "province",
  "status",
  "description",
] as const satisfies ReadonlyArray<keyof EditorState>;

type RequiredEditorFieldKey = (typeof REQUIRED_EDITOR_FIELDS)[number];
type RequiredFieldKey = RequiredEditorFieldKey;

const REQUIRED_FIELD_LABELS: Record<RequiredFieldKey, string> = {
  brand: "Marca",
  model: "Modello",
  version: "Versione",
  interiorType: "Interni",
  price: "Prezzo",
  mileage: "Chilometri",
  fuel: "Alimentazione",
  transmission: "Cambio",
  engineSize: "Cilindrata",
  powerKw: "Potenza kW",
  powerCv: "Potenza CV",
  doors: "Porte",
  registrationDate: "Data immatricolazione",
  color: "Colore",
  city: "Citta",
  province: "Provincia",
  status: "Stato",
  description: "Descrizione",
};

function getFieldInputClass(missing: boolean): string {
  return `h-11 w-full rounded-xl border px-3 text-sm text-slate-900 outline-none transition ${
    missing ? "border-red-300 bg-red-50 focus:border-red-400" : "border-slate-200 bg-white focus:border-sky-300"
  }`;
}

function getFieldLabelClass(missing: boolean): string {
  return `text-xs font-semibold uppercase tracking-[0.14em] ${missing ? "text-red-600" : "text-slate-500"}`;
}

function normalizeProvinceCode(value: unknown): string {
  if (typeof value !== "string") return "";

  const normalized = value.trim();
  if (!normalized) return "";

  const upper = normalized.toUpperCase();
  if (ITALIAN_PROVINCES.some((province) => province.code === upper)) {
    return upper;
  }

  const fromBracket = upper.match(/\(([A-Z]{2})\)$/)?.[1] ?? "";
  if (fromBracket && ITALIAN_PROVINCES.some((province) => province.code === fromBracket)) {
    return fromBracket;
  }

  const byName = ITALIAN_PROVINCES.find((province) => province.name.toLowerCase() === normalized.toLowerCase());
  return byName?.code ?? "";
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

type PlateLookupVehicle = {
  brand?: string;
  model?: string;
  version?: string;
  year?: string;
  fuel?: string;
  transmission?: string;
  engineSize?: string;
  powerKw?: string;
  powerHp?: string;
  doors?: string;
  euroClass?: string;
  registrationDate?: string;
  color?: string;
  vin?: string;
};

function normalizeTransmission(value: unknown): "Automatico" | "Manuale" | "" {
  if (typeof value !== "string") return "";

  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  if (normalized === "automatic" || normalized === "automatico") return "Automatico";
  if (normalized === "manual" || normalized === "manuale") return "Manuale";

  return "";
}

function normalizeDateForInput(value: unknown): string {
  if (typeof value !== "string") return "";

  const normalized = value.trim();
  if (!normalized) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return normalized.slice(0, 10);
  }

  const ddMmYyyy = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddMmYyyy) {
    return `${ddMmYyyy[3]}-${ddMmYyyy[2]}-${ddMmYyyy[1]}`;
  }

  const yyyyMmDdSlash = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (yyyyMmDdSlash) {
    return `${yyyyMmDdSlash[1]}-${yyyyMmDdSlash[2]}-${yyyyMmDdSlash[3]}`;
  }

  return "";
}

function normalizeFuelFromLookup(value: unknown): string {
  if (typeof value !== "string") return "";

  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  if (normalized === "diesel") return "Diesel";
  if (normalized === "benzina" || normalized === "petrol" || normalized === "gasoline") return "Benzina";
  if (normalized === "gpl" || normalized === "lpg") return "GPL";
  if (normalized === "metano" || normalized === "cng" || normalized === "natural gas") return "Metano";
  if (normalized === "elettrica" || normalized === "electric") return "Elettrica";
  if (normalized === "hybrid benzina" || normalized === "petrol hybrid") return "Elettrica/Benzina (Ibrida)";
  if (normalized === "hybrid diesel") return "Elettrica/Diesel (Ibrida)";
  if (normalized === "hydrogen") return "Idrogeno";
  if (normalized === "ethanol" || normalized === "bioethanol") return "Etanolo";

  return "Altro";
}

function normalizeResolvedDealerId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "null" || lowered === "undefined") {
    return null;
  }

  return normalized;
}

function sanitizeMileageDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatMileageInput(value: string) {
  const digits = sanitizeMileageDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("it-IT").format(Number(digits));
}

function parseMileageForSave(value: string) {
  const digits = sanitizeMileageDigits(value);
  if (!digits) return null;

  const normalized = Number(digits);
  return Number.isFinite(normalized) ? normalized : null;
}

const INITIAL_STATE: EditorState = {
  brand: "",
  model: "",
  version: "",
  interiorType: "",
  year: String(new Date().getFullYear()),
  engineSize: "",
  traction: "",
  powerKw: "",
  powerCv: "",
  doors: "",
  emissionClass: "",
  registrationDate: "",
  color: "",
  vin: "",
  mileage: "",
  fuel: "",
  transmission: "",
  price: "",
  city: "",
  province: "",
  description: "",
  equipment: [],
  status: "draft",
};

type ViewImage = VehicleImageRow & { previewUrl: string | null };

function resolveStatusAction(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "published") return "vehicle.published" as const;
  if (normalized === "sold") return "vehicle.sold" as const;
  if (normalized === "archived") return "vehicle.archived" as const;
  return "vehicle.unpublished" as const;
}

export function VehicleEditorPage({ mode, vehicleId }: VehicleEditorPageProps) {
  const router = useRouter();
  const imageInputId = useId();
  const cityDatalistId = useId();

  const [dealerName, setDealerName] = useState("Dealer Console");
  const [currentDealerId, setCurrentDealerId] = useState<string | null>(null);
  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [images, setImages] = useState<ViewImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [plateLookupLoading, setPlateLookupLoading] = useState(false);
  const [licensePlate, setLicensePlate] = useState("");
  const [missingFields, setMissingFields] = useState<RequiredFieldKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [originalStatus, setOriginalStatus] = useState<string | null>(mode === "create" ? "draft" : null);
  const [originalPublished, setOriginalPublished] = useState<boolean>(false);
  const [existingVehicleDealerId, setExistingVehicleDealerId] = useState<string | null>(null);

  const title = useMemo(() => (mode === "create" ? "Nuovo Veicolo" : "Modifica Veicolo"), [mode]);
  const maxRegistrationDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fuelOptions = useMemo(
    () => [
      "Benzina",
      "Diesel",
      "GPL",
      "Metano",
      "Elettrica",
      "Elettrica/Benzina (Ibrida)",
      "Elettrica/Diesel (Ibrida)",
      "Idrogeno",
      "Etanolo",
      "Altro",
    ],
    []
  );
  const selectedFuel = state.fuel.trim();
  const hasCustomSelectedFuel = selectedFuel.length > 0 && !fuelOptions.includes(selectedFuel);
  const colorOptions = useMemo(() => [...VEHICLE_COLOR_OPTIONS], []);
  const tractionOptions = useMemo(() => [...VEHICLE_TRACTION_OPTIONS], []);
  const selectedTraction = state.traction.trim();
  const hasCustomSelectedTraction = selectedTraction.length > 0 && !tractionOptions.includes(selectedTraction as (typeof VEHICLE_TRACTION_OPTIONS)[number]);
  const selectedProvince = normalizeProvinceCode(state.province) || state.province.trim().toUpperCase();
  const hasCustomSelectedProvince = selectedProvince.length > 0 && !ITALIAN_PROVINCES.some((province) => province.code === selectedProvince.toUpperCase());
  const cityOptions = useMemo(() => {
    if (!selectedProvince || !(selectedProvince in ITALIAN_CITIES_BY_PROVINCE)) {
      return [];
    }

    return ITALIAN_CITIES_BY_PROVINCE[selectedProvince as ItalianProvinceCode];
  }, [selectedProvince]);
  const interiorTypeOptions = useMemo(
    () => ["Interni in pelle", "Interni in pelle e Alcantara", "Interni in tessuto e Alcantara", "Interni in tessuto"],
    []
  );
  const missingFieldSet = useMemo(() => new Set(missingFields), [missingFields]);

  useEffect(() => {
    let alive = true;

    const fetchDealer = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) return;

      const resolvedDealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (resolvedDealerId) {
        setCurrentDealerId(resolvedDealerId);
      }

      const { data } = await supabase
        .from("dealers")
        .select("name, legal_name")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ name: string | null; legal_name: string | null }>();

      if (!alive) return;
      const nextDealerName = String(data?.name ?? data?.legal_name ?? "").trim();
      if (nextDealerName) setDealerName(nextDealerName);
    };

    void fetchDealer();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !vehicleId || !currentDealerId) return;

    let alive = true;

    const fetchVehicle = async () => {
      setLoading(true);
      setError(null);

      const { data, error: vehicleError } = await supabase
        .from("vehicles")
        .select(
          "id, dealer_id, brand, model, version, interior_type, year, engine_size, traction, power_kw, power_cv, doors, emission_class, registration_date, color, vin, mileage, fuel, transmission, price, city, province, description, equipment, status, published"
        )
        .eq("id", vehicleId)
        .eq("dealer_id", currentDealerId)
        .maybeSingle<VehicleRow>();

      if (vehicleError || !data) {
        if (alive) {
          setError(vehicleError?.message || "Veicolo non trovato.");
          setLoading(false);
        }
        return;
      }

      const { data: imageRows } = await supabase
        .from("vehicle_images")
        .select("id, image_url, position, is_cover, created_at")
        .eq("vehicle_id", vehicleId)
        .order("position", { ascending: true });

      const resolvedImages = await Promise.all(
        (imageRows ?? []).map(async (row) => {
          const raw = String(row.image_url ?? "").trim();
          const path = extractVehicleImagePath(raw);

          if (!path) {
            return { ...row, previewUrl: raw || null } as ViewImage;
          }

          const { data: signed } = await supabase.storage.from("vehicle-images").createSignedUrl(path, 3600);
          if (signed?.signedUrl) {
            return { ...row, previewUrl: signed.signedUrl } as ViewImage;
          }

          const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
          return { ...row, previewUrl: publicData.publicUrl || raw } as ViewImage;
        })
      );

      if (!alive) return;

      setState({
        brand: String(data.brand ?? ""),
        model: String(data.model ?? ""),
        version: String(data.version ?? ""),
        interiorType: String((data as Record<string, unknown>).interior_type ?? ""),
        year: data.year === null || data.year === undefined ? "" : String(data.year),
        engineSize: String((data as Record<string, unknown>).engine_size ?? ""),
        traction: String((data as Record<string, unknown>).traction ?? ""),
        powerKw: String((data as Record<string, unknown>).power_kw ?? ""),
        powerCv: String((data as Record<string, unknown>).power_cv ?? ""),
        doors: String((data as Record<string, unknown>).doors ?? ""),
        emissionClass: String((data as Record<string, unknown>).emission_class ?? ""),
        registrationDate: normalizeDateForInput((data as Record<string, unknown>).registration_date),
        color: canonicalizeVehicleColorLabel((data as Record<string, unknown>).color),
        vin: String((data as Record<string, unknown>).vin ?? ""),
        mileage: typeof data.mileage === "number" ? formatMileageInput(String(data.mileage)) : "",
        fuel: String(data.fuel ?? ""),
        transmission: String(data.transmission ?? ""),
        price: data.price === null || data.price === undefined ? "" : String(data.price),
        city: String(data.city ?? ""),
        province: normalizeProvinceCode(data.province) || String(data.province ?? "").trim(),
        description: String(data.description ?? ""),
        equipment: normalizeEquipment((data as Record<string, unknown>).equipment),
        status: String(data.status ?? (data.published ? "published" : "draft")),
      });
      setOriginalStatus(String(data.status ?? (data.published ? "published" : "draft")));
      setOriginalPublished(Boolean(data.published));
      setExistingVehicleDealerId(String(data.dealer_id ?? "").trim() || null);
      setImages(resolvedImages);
      setLoading(false);
    };

    void fetchVehicle();

    return () => {
      alive = false;
    };
  }, [currentDealerId, mode, vehicleId]);

  const updateField = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    if (REQUIRED_EDITOR_FIELDS.includes(key as RequiredEditorFieldKey)) {
      setMissingFields((prev) => prev.filter((field) => field !== key));
    }
  };

  const handleProvinceChange = (value: string) => {
    const normalized = normalizeProvinceCode(value) || value.trim().toUpperCase();

    setState((prev) => ({
      ...prev,
      province: normalized,
      city: normalizeProvinceCode(prev.province) === normalized ? prev.city : "",
    }));

    setMissingFields((prev) => prev.filter((field) => field !== "province" && field !== "city"));
  };

  const toggleEquipment = (item: string) => {
    setState((prev) => {
      const exists = prev.equipment.includes(item);
      return {
        ...prev,
        equipment: exists ? prev.equipment.filter((value) => value !== item) : [...prev.equipment, item],
      };
    });
  };

  const handlePlateLookup = async () => {
    setPlateLookupLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      if (!accessToken) {
        setError("Sessione non valida.");
        return;
      }

      const response = await fetch("/api/vehicles/plate-lookup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ licensePlate }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        vehicle?: PlateLookupVehicle;
        data?: Record<string, unknown>;
      };

      if (!response.ok) {
        setError(payload.error || payload.message || "Ricerca targa non disponibile.");
        return;
      }

      const toRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
      const vehicleSource = toRecord(payload.vehicle);
      const dataSource = toRecord(payload.data);

      const pick = (...values: unknown[]) => {
        for (const value of values) {
          if (typeof value === "number") {
            return String(value);
          }

          if (typeof value === "string") {
            const normalized = value.trim();
            if (normalized) {
              return normalized;
            }
          }
        }

        return "";
      };

      setState((prev) => ({
        ...prev,
        brand: pick(vehicleSource.brand, dataSource.CarMake, dataSource.MakeDescription) || prev.brand,
        model: pick(vehicleSource.model, dataSource.CarModel, dataSource.ModelDescription) || prev.model,
        version: pick(vehicleSource.version, dataSource.Version, dataSource.Description) || prev.version,
        year: pick(vehicleSource.year, dataSource.RegistrationYear) || prev.year,
        engineSize: pick(vehicleSource.engineSize, dataSource.EngineSize) || prev.engineSize,
        powerKw: pick(vehicleSource.powerKw, dataSource.PowerKW) || prev.powerKw,
        powerCv: pick(vehicleSource.powerHp, dataSource.PowerCV) || prev.powerCv,
        doors: pick(vehicleSource.doors, dataSource.NumberOfDoors) || prev.doors,
        emissionClass: pick(vehicleSource.euroClass, dataSource.EuroClass, dataSource.EmissionClass) || prev.emissionClass,
        registrationDate: normalizeDateForInput(pick(vehicleSource.registrationDate, dataSource.RegistrationDate)) || prev.registrationDate,
        color: canonicalizeVehicleColorLabel(pick(vehicleSource.color, dataSource.Color, dataSource.ExteriorColor)) || prev.color,
        vin: pick(vehicleSource.vin, dataSource.VIN, dataSource.Vin) || prev.vin,
        fuel: normalizeFuelFromLookup(pick(vehicleSource.fuel, dataSource.FuelType)) || prev.fuel,
        transmission: normalizeTransmission(pick(vehicleSource.transmission, dataSource.TransmissionType, dataSource.Gearbox)) || prev.transmission,
      }));

      setSuccess("Dati veicolo compilati da targa.");
    } catch {
      setError("Errore durante la ricerca targa.");
    } finally {
      setPlateLookupLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const nextMissing: RequiredFieldKey[] = [];

    for (const field of REQUIRED_EDITOR_FIELDS) {
      if (!state[field].trim()) {
        nextMissing.push(field);
      }
    }

    if (state.traction.trim() && !normalizeVehicleTraction(state.traction)) {
      setError("Valore trazione non valido. Seleziona Anteriore, Posteriore o Integrale 4x4.");
      setSaving(false);
      return;
    }

    if (nextMissing.length > 0) {
      setMissingFields(nextMissing);
      setError(`Compila i campi obbligatori mancanti:\n- ${nextMissing.map((field) => REQUIRED_FIELD_LABELS[field]).join("\n- ")}`);
      return;
    }

    setMissingFields([]);
    setSaving(true);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!userId) {
      setError("Sessione non valida.");
      setSaving(false);
      return;
    }

    let resolvedDealerId: string | null = null;
    try {
      resolvedDealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });
    } catch (dealerResolveError) {
      const message = dealerResolveError instanceof Error ? dealerResolveError.message : "Errore risoluzione dealer.";
      setError(message);
      setSaving(false);
      return;
    }

    const resolvedDealerIdNormalized = normalizeResolvedDealerId(resolvedDealerId);
    let normalizedExistingDealerId = normalizeResolvedDealerId(existingVehicleDealerId);

    if (mode === "edit" && !normalizedExistingDealerId && vehicleId) {
      let existingQuery = supabase.from("vehicles").select("dealer_id").eq("id", vehicleId);
      if (resolvedDealerIdNormalized) {
        existingQuery = existingQuery.eq("dealer_id", resolvedDealerIdNormalized);
      }

      const { data: existingRow, error: existingRowError } = await existingQuery.maybeSingle<{ dealer_id: string | null }>();

      if (existingRowError) {
        setError(existingRowError.message || "Errore nel recupero dealer del veicolo.");
        setSaving(false);
        return;
      }

      normalizedExistingDealerId = normalizeResolvedDealerId(existingRow?.dealer_id);
      if (normalizedExistingDealerId) {
        setExistingVehicleDealerId(normalizedExistingDealerId);
      }
    }

    const vehicleDealerId = mode === "edit"
      ? (normalizedExistingDealerId ?? resolvedDealerIdNormalized)
      : resolvedDealerIdNormalized;

    if (!vehicleDealerId) {
      setError("Concessionaria non associata all’account.");
      setSaving(false);
      return;
    }

    const { count: vehicleCount, error: vehicleCountError } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", vehicleDealerId);

    if (vehicleCountError) {
      setError(vehicleCountError.message || "Impossibile verificare il limite demo.");
      setSaving(false);
      return;
    }

    const demoAccessContext = await resolveDemoAccessContext(supabase, vehicleDealerId, {
      vehicleCount: vehicleCount ?? 0,
    });
    const demoBlock = getDemoFeatureBlockReason(demoAccessContext, mode === "create" ? "vehicle" : "write");

    if (demoBlock) {
      setError(demoBlock.message);
      setSaving(false);
      return;
    }

    const vehiclePayload = {
      dealer_id: vehicleDealerId,
      brand: state.brand.trim() || null,
      model: state.model.trim() || null,
      version: state.version.trim() || null,
      interior_type: state.interiorType.trim() || null,
      year: state.year.trim() || null,
      engine_size: state.engineSize.trim() || null,
      traction: normalizeVehicleTraction(state.traction),
      power_kw: state.powerKw.trim() ? Number(state.powerKw) : null,
      power_cv: state.powerCv.trim() ? Number(state.powerCv) : null,
      doors: state.doors.trim() ? Number(state.doors) : null,
      emission_class: state.emissionClass.trim() || null,
      registration_date: state.registrationDate.trim() || null,
      color: canonicalizeVehicleColorLabel(state.color) || null,
      vin: state.vin.trim() || null,
      mileage: parseMileageForSave(state.mileage),
      fuel: state.fuel.trim() || null,
      transmission: state.transmission.trim() || null,
      price: state.price.trim() ? Number(state.price) : null,
      city: state.city.trim() || null,
      province: normalizeProvinceCode(state.province) || state.province.trim() || null,
      description: state.description.trim() || null,
      equipment: state.equipment,
      status: state.status,
      published: state.status === "published",
    };

    const statusTransition = validateVehicleStatusTransitionForCrud({
      fromStatus: mode === "create" ? "draft" : originalStatus,
      fromPublished: mode === "create" ? false : originalPublished,
      toStatus: state.status,
      toPublished: state.status === "published",
    });

    if (!statusTransition.allowed) {
      setError(statusTransition.message || "Transizione stato non consentita.");
      setSaving(false);
      return;
    }

    vehiclePayload.status = statusTransition.nextStatus;
    vehiclePayload.published = statusTransition.nextPublished;

    if (statusTransition.nextPublished) {
      const healthVehicle: VehicleRow = {
        id: vehicleId ?? "pending",
        dealer_id: vehicleDealerId,
        brand: vehiclePayload.brand,
        model: vehiclePayload.model,
        version: vehiclePayload.version,
        interior_type: vehiclePayload.interior_type,
        engine_size: vehiclePayload.engine_size,
        power_kw: vehiclePayload.power_kw,
        power_cv: vehiclePayload.power_cv,
        doors: vehiclePayload.doors,
        registration_date: vehiclePayload.registration_date,
        year: vehiclePayload.year,
        mileage: vehiclePayload.mileage,
        fuel: vehiclePayload.fuel,
        transmission: vehiclePayload.transmission,
        price: vehiclePayload.price,
        status: vehiclePayload.status,
        published: vehiclePayload.published,
        city: vehiclePayload.city,
        province: vehiclePayload.province,
        description: vehiclePayload.description,
        created_at: null,
        updated_at: null,
      };

      const expectedImageCount = images.length + pendingFiles.length;
      const health = evaluateVehicleHealth({
        vehicle: healthVehicle,
        imagesCount: expectedImageCount,
      });

      if (!health.publishable) {
        const firstIssue = health.issues[0]?.message ?? "La scheda veicolo non e ancora pubblicabile.";
        setError(`Pubblicazione bloccata: ${firstIssue}`);
        setSaving(false);
        return;
      }
    }

    let targetVehicleId = vehicleId;
    const previousStatus = mode === "create" ? "draft" : String(originalStatus ?? "draft").trim().toLowerCase();
    const nextStatus = String(statusTransition.nextStatus ?? "draft").trim().toLowerCase();
    const statusChanged = previousStatus !== nextStatus;

    if (mode === "create") {
      const payload = vehiclePayload;

      const { data, error: createError } = await supabase
        .from("vehicles")
        .insert(payload)
        .select("id, dealer_id")
        .single<{ id: string; dealer_id: string | null }>();

      if (createError || !data?.id) {
        setError(demoAccessMessageFromUnknown(createError, createError?.message || "Errore durante creazione veicolo."));
        setSaving(false);
        return;
      }

      const insertedDealerId = normalizeResolvedDealerId(data.dealer_id);

      if (!insertedDealerId) {
        const { error: recoverDealerError } = await supabase
          .from("vehicles")
          .update({ dealer_id: vehicleDealerId })
          .eq("id", data.id);

        if (recoverDealerError) {
          setError("Concessionaria non associata all’account.");
          setSaving(false);
          return;
        }
      }

      targetVehicleId = data.id;

      await writeVehicleTimelineEvent(supabase, {
        dealerId: vehicleDealerId,
        vehicleId: data.id,
        action: "vehicle.created",
        actorType: "user",
        actorProfileId: userId,
        after: {
          status: statusTransition.nextStatus,
          published: statusTransition.nextPublished,
        },
      });

      if (statusChanged || nextStatus !== "draft") {
        await writeVehicleTimelineEvent(supabase, {
          dealerId: vehicleDealerId,
          vehicleId: data.id,
          action: "vehicle.status_changed",
          actorType: "user",
          actorProfileId: userId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: nextStatus,
          },
          before: {
            status: previousStatus,
            published: false,
          },
          after: {
            status: statusTransition.nextStatus,
            published: statusTransition.nextPublished,
          },
        });

        await writeVehicleTimelineEvent(supabase, {
          dealerId: vehicleDealerId,
          vehicleId: data.id,
          action: resolveStatusAction(nextStatus),
          actorType: "user",
          actorProfileId: userId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: nextStatus,
          },
        });
      }
    } else {
      const { error: updateError } = await supabase
        .from("vehicles")
        .update(vehiclePayload)
        .eq("id", vehicleId)
        .eq("dealer_id", vehicleDealerId);
      if (updateError) {
        setError(updateError.message || "Errore durante aggiornamento veicolo.");
        setSaving(false);
        return;
      }

      if (targetVehicleId) {
        await writeVehicleTimelineEvent(supabase, {
          dealerId: vehicleDealerId,
          vehicleId: targetVehicleId,
          action: "vehicle.updated",
          actorType: "user",
          actorProfileId: userId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: nextStatus,
          },
        });

        if (statusChanged) {
          await writeVehicleTimelineEvent(supabase, {
            dealerId: vehicleDealerId,
            vehicleId: targetVehicleId,
            action: "vehicle.status_changed",
            actorType: "user",
            actorProfileId: userId,
            metadata: {
              fromStatus: previousStatus,
              toStatus: nextStatus,
            },
            before: {
              status: previousStatus,
              published: originalPublished,
            },
            after: {
              status: statusTransition.nextStatus,
              published: statusTransition.nextPublished,
            },
          });

          await writeVehicleTimelineEvent(supabase, {
            dealerId: vehicleDealerId,
            vehicleId: targetVehicleId,
            action: resolveStatusAction(nextStatus),
            actorType: "user",
            actorProfileId: userId,
            metadata: {
              fromStatus: previousStatus,
              toStatus: nextStatus,
            },
          });
        }
      }
    }

    if (targetVehicleId && pendingFiles.length > 0) {
      const { data: vehicleForImages, error: vehicleForImagesError } = await supabase
        .from("vehicles")
        .select("dealer_id")
        .eq("id", targetVehicleId)
        .maybeSingle<{ dealer_id: string | null }>();

      if (vehicleForImagesError) {
        setError(vehicleForImagesError.message || "Errore nel recupero dealer per immagini veicolo.");
        setSaving(false);
        return;
      }

      let imageDealerId = String(vehicleForImages?.dealer_id ?? "").trim();

      if (!imageDealerId) {
        try {
          imageDealerId = String(
            (await resolveDealerIdFromTenantSources(supabase, userId, {
              activeDealerId: getActiveDealerId(),
            })) ?? ""
          ).trim();
        } catch (dealerResolveError) {
          setError(dealerResolveError instanceof Error ? dealerResolveError.message : "Errore nel recupero concessionario per upload immagini.");
          setSaving(false);
          return;
        }
      }

      if (!imageDealerId) {
        setError("Impossibile caricare immagini: dealer non associato al veicolo o all'utente.");
        setSaving(false);
        return;
      }

      const uploadedRows: Array<{ vehicle_id: string; dealer_id: string; image_url: string; position: number; is_cover: boolean }> = [];

      for (let index = 0; index < pendingFiles.length; index += 1) {
        const file = pendingFiles[index];
        const path = `${userId}/${targetVehicleId}/${Date.now()}-${index}-${file.name.replace(/\s+/g, "-")}`;

        const { error: uploadError } = await supabase.storage.from("vehicle-images").upload(path, file, {
          upsert: false,
        });

        if (uploadError) {
          setError(uploadError.message || "Errore upload immagini.");
          setSaving(false);
          return;
        }

        uploadedRows.push({
          vehicle_id: targetVehicleId,
          dealer_id: imageDealerId,
          image_url: path,
          position: images.length + index,
          is_cover: images.length === 0 && index === 0,
        });
      }

      const { error: imageInsertError } = await supabase.from("vehicle_images").insert(uploadedRows);
      if (imageInsertError) {
        setError(imageInsertError.message || "Errore salvataggio immagini veicolo.");
        setSaving(false);
        return;
      }

      await writeVehicleTimelineEvent(supabase, {
        dealerId: imageDealerId,
        vehicleId: targetVehicleId,
        action: "vehicle.images_updated",
        actorType: "user",
        actorProfileId: userId,
        metadata: {
          operation: "upload",
          imagesCount: uploadedRows.length,
        },
      });
    }

    setPendingFiles([]);
    setSaving(false);
    setOriginalStatus(statusTransition.nextStatus);
    setOriginalPublished(statusTransition.nextPublished);
    setSuccess(mode === "create" ? "Veicolo creato correttamente." : "Veicolo aggiornato correttamente.");

    if (targetVehicleId) {
      router.push(`/veicoli/${targetVehicleId}`);
      router.refresh();
    }
  };

  const handleDeleteImage = async (image: ViewImage) => {
    if (!image.id) return;

    const confirmDelete = globalThis.confirm("Confermi la rimozione dell'immagine?");
    if (!confirmDelete) return;

    const { error: deleteError } = await supabase.from("vehicle_images").delete().eq("id", image.id);
    if (deleteError) {
      setError(deleteError.message || "Errore eliminazione immagine.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;

    if (vehicleId && existingVehicleDealerId) {
      await writeVehicleTimelineEvent(supabase, {
        dealerId: existingVehicleDealerId,
        vehicleId,
        action: "vehicle.images_updated",
        actorType: "user",
        actorProfileId,
        metadata: {
          operation: "delete",
          imagesCount: 1,
        },
      });
    }

    const path = extractVehicleImagePath(String(image.image_url ?? ""));
    if (path) {
      await supabase.storage.from("vehicle-images").remove([path]);
    }

    setImages((prev) => prev.filter((item) => item.id !== image.id));
  };

  const handleCoverImage = async (imageId: string) => {
    if (!vehicleId) return;

    const { data: imageRows } = await supabase
      .from("vehicle_images")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .order("position", { ascending: true });

    const allIds = (imageRows ?? []).map((row) => row.id);
    if (allIds.length === 0) return;

    await supabase.from("vehicle_images").update({ is_cover: false }).in("id", allIds);
    await supabase.from("vehicle_images").update({ is_cover: true }).eq("id", imageId);

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;

    if (existingVehicleDealerId) {
      await writeVehicleTimelineEvent(supabase, {
        dealerId: existingVehicleDealerId,
        vehicleId,
        action: "vehicle.images_updated",
        actorType: "user",
        actorProfileId,
        metadata: {
          operation: "set_cover",
          imagesCount: 1,
        },
      });
    }

    setImages((prev) => prev.map((image) => ({ ...image, is_cover: image.id === imageId })));
  };

  return (
    <DealerDashboardShell title={title} dealerName={dealerName} avatarInitials="DC" unreadNotifications={3}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Editor veicolo</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">Compila i dati del veicolo e gestisci immagini da Supabase Storage.</p>
      </section>

      {loading ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">Caricamento dati veicolo...</section>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ricerca da targa</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={licensePlate}
                  onChange={(event) => setLicensePlate(event.target.value.toUpperCase())}
                  placeholder="AA123BB"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
                />
                <button
                  type="button"
                  onClick={handlePlateLookup}
                  disabled={plateLookupLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {plateLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Compila da targa
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <EditorField label="Marca" value={state.brand} onChange={(value) => updateField("brand", value)} required missing={missingFieldSet.has("brand")} />
              <EditorField label="Modello" value={state.model} onChange={(value) => updateField("model", value)} required missing={missingFieldSet.has("model")} />
              <EditorField label="Versione" value={state.version} onChange={(value) => updateField("version", value)} required missing={missingFieldSet.has("version")} />
              <EditorField
                label="Cilindrata"
                value={state.engineSize}
                onChange={(value) => updateField("engineSize", value)}
                inputMode="numeric"
                required
                missing={missingFieldSet.has("engineSize")}
              />
              <label className="block space-y-2">
                <span className={getFieldLabelClass(false)}>Trazione</span>
                <select
                  value={state.traction}
                  onChange={(event) => updateField("traction", event.target.value)}
                  className={getFieldInputClass(false)}
                >
                  <option value="">Seleziona trazione</option>
                  {hasCustomSelectedTraction ? <option value={state.traction}>{state.traction}</option> : null}
                  {tractionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <EditorField
                label="Potenza kW"
                value={state.powerKw}
                onChange={(value) => updateField("powerKw", value)}
                inputMode="numeric"
                required
                missing={missingFieldSet.has("powerKw")}
              />
              <EditorField
                label="Potenza CV"
                value={state.powerCv}
                onChange={(value) => updateField("powerCv", value)}
                inputMode="numeric"
                required
                missing={missingFieldSet.has("powerCv")}
              />
              <EditorField
                label="Porte"
                value={state.doors}
                onChange={(value) => updateField("doors", value)}
                inputMode="numeric"
                required
                missing={missingFieldSet.has("doors")}
              />
              <EditorField label="Classe Euro" value={state.emissionClass} onChange={(value) => updateField("emissionClass", value)} />
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("registrationDate"))}>Data immatricolazione *</span>
                <input
                  type="date"
                  value={state.registrationDate}
                  min="1950-01-01"
                  max={maxRegistrationDate}
                  onChange={(event) => updateField("registrationDate", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("registrationDate"))}
                />
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("color"))}>Colore *</span>
                <select
                  value={state.color}
                  onChange={(event) => updateField("color", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("color"))}
                >
                  <option value="">Seleziona colore</option>
                  {colorOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("interiorType"))}>Interni *</span>
                <select
                  value={state.interiorType}
                  onChange={(event) => updateField("interiorType", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("interiorType"))}
                >
                  <option value="">Seleziona...</option>
                  {interiorTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <EditorField label="Telaio" value={state.vin} onChange={(value) => updateField("vin", value)} />
              <EditorField
                label="Prezzo"
                value={state.price}
                onChange={(value) => updateField("price", value)}
                inputMode="numeric"
                required
                missing={missingFieldSet.has("price")}
              />
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("mileage"))}>Chilometri *</span>
                <input
                  type="text"
                  required
                  value={state.mileage}
                  inputMode="numeric"
                  onFocus={() => updateField("mileage", sanitizeMileageDigits(state.mileage))}
                  onChange={(event) => updateField("mileage", sanitizeMileageDigits(event.target.value))}
                  onBlur={() => updateField("mileage", formatMileageInput(state.mileage))}
                  placeholder="Inserisci chilometri"
                  className={getFieldInputClass(missingFieldSet.has("mileage"))}
                />
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("fuel"))}>Alimentazione *</span>
                <select
                  value={state.fuel}
                  onChange={(event) => updateField("fuel", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("fuel"))}
                >
                  <option value="">Seleziona alimentazione</option>
                  {hasCustomSelectedFuel ? <option value={state.fuel}>{state.fuel}</option> : null}
                  {fuelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("transmission"))}>Cambio *</span>
                <select
                  value={state.transmission}
                  onChange={(event) => updateField("transmission", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("transmission"))}
                >
                  <option value="">Seleziona cambio</option>
                  {state.transmission && state.transmission !== "Automatico" && state.transmission !== "Manuale" ? (
                    <option value={state.transmission}>{state.transmission}</option>
                  ) : null}
                  <option value="Automatico">Automatico</option>
                  <option value="Manuale">Manuale</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("city"))}>Citta *</span>
                <input
                  type="text"
                  list={cityDatalistId}
                  required
                  disabled={!selectedProvince}
                  value={state.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  placeholder={selectedProvince ? "Seleziona o cerca comune" : "Seleziona prima la provincia"}
                  className={getFieldInputClass(missingFieldSet.has("city"))}
                />
                <datalist id={cityDatalistId}>
                  {cityOptions.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("province"))}>Provincia *</span>
                <select
                  value={state.province}
                  onChange={(event) => handleProvinceChange(event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("province"))}
                >
                  <option value="">Seleziona provincia</option>
                  {hasCustomSelectedProvince ? <option value={selectedProvince}>{selectedProvince}</option> : null}
                  {ITALIAN_PROVINCES.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.name} ({province.code})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 sm:col-span-2">
                <span className={getFieldLabelClass(missingFieldSet.has("status"))}>Stato *</span>
                <select
                  value={state.status}
                  onChange={(event) => updateField("status", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("status"))}
                >
                  <option value="draft">Bozza</option>
                  <option value="published">Pubblicato</option>
                  <option value="review">In revisione</option>
                  <option value="sold">Venduto</option>
                  <option value="archived">Archiviato</option>
                </select>
                <p className="text-xs text-slate-500">Stato attuale: {formatVehicleStatus(state.status)}</p>
              </label>
            </div>

            <label className="mt-3 block space-y-2">
              <span className={getFieldLabelClass(missingFieldSet.has("description"))}>Descrizione *</span>
              <textarea
                rows={5}
                value={state.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Descrizione commerciale del veicolo"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 outline-none transition ${
                  missingFieldSet.has("description") ? "border-red-300 bg-red-50 focus:border-red-400" : "border-slate-200 bg-white focus:border-sky-300"
                }`}
              />
            </label>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Dotazioni</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {VEHICLE_EQUIPMENT_OPTIONS.map((item) => {
                  const checked = state.equipment.includes(item);

                  return (
                    <label key={item} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEquipment(item)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{item}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="dashboard-fade-up space-y-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <ImagePlus className="h-4 w-4 text-sky-600" />
                Upload immagini
              </p>
              <input
                id={imageInputId}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                className="sr-only"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label
                  htmlFor={imageInputId}
                  className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Scegli i file
                </label>
                <span className="text-sm text-slate-500">
                  {pendingFiles.length > 0 ? `${pendingFiles.length} file selezionati` : "Nessun file selezionato"}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{pendingFiles.length} file pronti al caricamento.</p>
            </div>

            {images.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Immagini correnti</p>
                <div className="grid grid-cols-2 gap-2">
                  {images.map((image) => (
                    <article key={image.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <div className="h-20 overflow-hidden rounded-lg bg-slate-200">
                        {image.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image.previewUrl} alt={safeText(image.image_url)} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => handleCoverImage(image.id)}
                          className={`rounded-lg px-2 py-1 text-xs font-medium ${image.is_cover ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}
                        >
                          {image.is_cover ? "Copertina" : "Imposta copertina"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(image)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-medium text-red-700"
                        >
                          <Trash2 className="h-3 w-3" /> Elimina
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              {error ? <p className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              {success ? (
                <p className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> {success}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {mode === "create" ? "Crea veicolo" : "Salva modifiche"}
              </button>
              <Link
                href="/veicoli"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Torna ai veicoli
              </Link>
            </div>
          </section>
        </form>
      )}
    </DealerDashboardShell>
  );
}

function EditorField({
  label,
  value,
  onChange,
  required,
  missing,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  missing?: boolean;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label className="block space-y-2">
      <span className={getFieldLabelClass(Boolean(missing))}>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="text"
        required={required}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Inserisci ${label.toLowerCase()}`}
        className={getFieldInputClass(Boolean(missing))}
      />
    </label>
  );
}
