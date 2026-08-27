"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { resizeImageForUpload } from "@/lib/image-resize";
import { VEHICLE_EQUIPMENT_OPTIONS } from "@/lib/vehicle-equipment-options";
import { canonicalizeVehicleColorLabel, VEHICLE_COLOR_OPTIONS } from "@/lib/vehicle-colors";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";
import { campiImmatricolazioneDaModulo } from "@/lib/vehicles";
import { VEHICLE_BRAND_OPTIONS } from "@/lib/vehicle-brands";
import { getVehicleModelsForBrand } from "@/lib/vehicle-models";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { evaluateVehicleHealth } from "@/lib/vehicle-health";
import { supabase } from "@/lib/supabaseClient";
import { writeVehicleTimelineEvent } from "@/lib/vehicle-timeline";
import {
  extractVehicleImagePath,
  formatVehicleStatus,
  resolveVehicleImageSource,
  normalizeVehicleTraction,
  safeText,
  validateVehicleStatusTransitionForCrud,
  VEHICLE_FUEL_OPTIONS,
  VEHICLE_TRACTION_OPTIONS,
  VEHICLE_TRANSMISSION_OPTIONS,
  type VehicleImageRow,
  type VehicleRow,
} from "@/lib/vehicles";

type VehicleEditorPageProps = {
  mode: "create" | "edit";
  vehicleId?: string;
};

const MAX_VEHICLE_IMAGES = 20;

type EditorState = {
  vehicleCategory: string;
  vehicleCondition: string;
  bodyType: string;
  brand: string;
  model: string;
  version: string;
  interiorType: string;
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
  description: string;
  equipment: string[];
  status: string;
};

/**
 * Cosa serve davvero per salvare una scheda.
 *
 * L'elenco era lungo il doppio, e il risultato era che **un veicolo importato
 * non si poteva modificare affatto**: aprire la scheda, cambiare il prezzo e
 * premere Salva rispondeva "compila i campi obbligatori mancanti".
 *
 * Misurato in produzione il 27/08/2026 sulle 232 automobili importate dai siti
 * delle concessionarie: interni, cilindrata, potenza kW e potenza CV mancavano
 * su **tutte e 232**, la data di immatricolazione pure -- quelle vetture
 * portano mese e anno, il giorno non lo dichiara nessun sito. Carrozzeria e
 * porte mancavano su dieci, i chilometri su tredici.
 *
 * Sono dati che il concessionario non ha, non dati che si e' dimenticato di
 * scrivere: pretenderli per salvare significa impedirgli di correggere un
 * prezzo. Restano tutti nel punteggio di salute della scheda -- un annuncio
 * completo vende meglio -- che e' un consiglio, non un divieto. E' la stessa
 * strada gia' presa per la descrizione.
 *
 * Qui resta cio' senza cui l'annuncio non sta in piedi, e che infatti
 * l'importazione porta sempre: che veicolo e', di che marca e modello, quanto
 * costa, come va alimentato.
 */
const CAMPI_DELLA_SCHEDA = [
  "vehicleCategory",
  "vehicleCondition",
  "bodyType",
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
  "status",
] as const satisfies ReadonlyArray<keyof EditorState>;

type RequiredFieldKey = (typeof CAMPI_DELLA_SCHEDA)[number];

// Quelli senza cui non si salva. Gli altri restano nella scheda e nel
// punteggio di salute, ma non fermano nessuno.
const CAMPI_OBBLIGATORI = new Set<RequiredFieldKey>([
  "vehicleCategory",
  "vehicleCondition",
  "brand",
  "model",
  "price",
  "fuel",
  "transmission",
  "status",
]);

const REQUIRED_EDITOR_FIELDS: readonly RequiredFieldKey[] = CAMPI_DELLA_SCHEDA.filter((campo) =>
  CAMPI_OBBLIGATORI.has(campo),
);

const REQUIRED_FIELD_LABELS: Record<RequiredFieldKey, string> = {
  vehicleCategory: "Tipo veicolo",
  vehicleCondition: "Condizioni",
  bodyType: "Carrozzeria",
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
  status: "Stato",
};

function getFieldInputClass(missing: boolean): string {
  return `h-11 w-full rounded-xl border px-3 text-sm text-slate-900 outline-none transition ${
    missing ? "border-red-300 bg-red-50 focus:border-red-400" : "border-slate-200 bg-white focus:border-blue-300"
  }`;
}

function getFieldLabelClass(missing: boolean): string {
  return `text-xs font-semibold uppercase tracking-[0.14em] ${missing ? "text-red-600" : "text-slate-500"}`;
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
  vehicleCategory: "",
  vehicleCondition: "",
  bodyType: "",
  brand: "",
  model: "",
  version: "",
  interiorType: "",
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

  const [dealerName, setDealerName] = useState("");
  const [currentDealerId, setCurrentDealerId] = useState<string | null>(null);
  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [images, setImages] = useState<ViewImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [plateLookupLoading, setPlateLookupLoading] = useState(false);
  const [licensePlate, setLicensePlate] = useState("");
  const [missingFields, setMissingFields] = useState<RequiredFieldKey[]>([]);
  // L'anno e il mese che la scheda porta gia': il modulo non li mostra -- ha
  // un solo campo, la data piena -- ma salvando non devono sparire.
  const [annoInArchivio, setAnnoInArchivio] = useState<string | null>(null);
  const [meseInArchivio, setMeseInArchivio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [originalStatus, setOriginalStatus] = useState<string | null>(mode === "create" ? "draft" : null);
  const [originalPublished, setOriginalPublished] = useState<boolean>(false);
  const [existingVehicleDealerId, setExistingVehicleDealerId] = useState<string | null>(null);
  const [showCustomModelField, setShowCustomModelField] = useState(false);

  const title = useMemo(() => (mode === "create" ? "Nuovo Veicolo" : "Modifica Veicolo"), [mode]);
  const maxRegistrationDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fuelOptions = useMemo(() => [...VEHICLE_FUEL_OPTIONS], []);
  const selectedFuel = state.fuel.trim();
  const hasCustomSelectedFuel = selectedFuel.length > 0 && !fuelOptions.includes(selectedFuel as (typeof VEHICLE_FUEL_OPTIONS)[number]);
  const brandOptions = useMemo(() => [...VEHICLE_BRAND_OPTIONS], []);
  const selectedBrand = state.brand.trim();
  const hasCustomSelectedBrand = selectedBrand.length > 0 && !brandOptions.includes(selectedBrand as (typeof VEHICLE_BRAND_OPTIONS)[number]);
  const modelOptions = useMemo(() => getVehicleModelsForBrand(selectedBrand), [selectedBrand]);
  const selectedModel = state.model.trim();
  const hasCustomSelectedModel = selectedModel.length > 0 && !modelOptions.includes(selectedModel);
  const colorOptions = useMemo(() => [...VEHICLE_COLOR_OPTIONS], []);
  const tractionOptions = useMemo(() => [...VEHICLE_TRACTION_OPTIONS], []);
  const selectedTraction = state.traction.trim();
  const hasCustomSelectedTraction = selectedTraction.length > 0 && !tractionOptions.includes(selectedTraction as (typeof VEHICLE_TRACTION_OPTIONS)[number]);
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
          "id, dealer_id, vehicle_category, vehicle_condition, body_type, brand, model, version, interior_type, year, registration_month, engine_size, traction, power_kw, power_cv, doors, emission_class, registration_date, color, vin, mileage, fuel, transmission, price, description, equipment, status, published"
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
        .eq("dealer_id", currentDealerId)
        .order("position", { ascending: true });

      // Production's "vehicle-images" bucket is actually private (drifted
      // from the migration that declares it public -- verified against the
      // Storage API). getPublicUrl() alone builds a URL the browser can't
      // load there, which shows the broken <img>'s alt text instead of the
      // photo. createSignedUrl() works regardless of the bucket's
      // public/private setting, so try that first.
      const resolvedImages = await Promise.all(
        (imageRows ?? []).map(async (row) => {
          // Le foto delle auto importate dal sito della concessionaria non
          // stanno nel nostro archivio, e in produzione sono la quasi
          // totalita': qui finivano dentro createSignedUrl come se fossero un
          // percorso, la firma falliva, e getPublicUrl costruiva un indirizzo
          // senza senso -- ".../vehicle-images/https://cdn.esterno.it/foto.jpg"
          // -- che il browser non poteva caricare. Il riquadro restava vuoto, e
          // senza vedere una foto non si puo' sceglierla ne' sostituirla.
          //
          // L'elenco veicoli questa distinzione la faceva gia': e' il motivo
          // per cui le stesse foto si vedevano li' e non qui. Adesso la fa
          // resolveVehicleImageSource per tutti e due.
          const source = resolveVehicleImageSource(row.image_url);

          if (source.kind === "proxy") {
            return { ...row, previewUrl: source.url } as ViewImage;
          }

          if (source.kind === "nessuna") {
            return { ...row, previewUrl: null } as ViewImage;
          }

          const { data: signed } = await supabase.storage.from("vehicle-images").createSignedUrl(source.path, 3600);
          if (signed?.signedUrl) {
            return { ...row, previewUrl: signed.signedUrl } as ViewImage;
          }

          const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(source.path);
          return { ...row, previewUrl: publicData.publicUrl || null } as ViewImage;
        })
      );

      if (!alive) return;

      setState({
        vehicleCategory: String((data as Record<string, unknown>).vehicle_category ?? ""),
        vehicleCondition: String((data as Record<string, unknown>).vehicle_condition ?? ""),
        bodyType: String((data as Record<string, unknown>).body_type ?? ""),
        brand: String(data.brand ?? ""),
        model: String(data.model ?? ""),
        version: String(data.version ?? ""),
        interiorType: String((data as Record<string, unknown>).interior_type ?? ""),
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
        description: String(data.description ?? ""),
        equipment: normalizeEquipment((data as Record<string, unknown>).equipment),
        status: String(data.status ?? (data.published ? "published" : "draft")),
      });
      setAnnoInArchivio(String((data as Record<string, unknown>).year ?? "").trim() || null);
      setMeseInArchivio(String((data as Record<string, unknown>).registration_month ?? "").trim() || null);
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
    if (REQUIRED_EDITOR_FIELDS.includes(key as RequiredFieldKey)) {
      setMissingFields((prev) => prev.filter((field) => field !== key));
    }
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

    if (images.length + pendingFiles.length > MAX_VEHICLE_IMAGES) {
      setError(`Puoi caricare al massimo ${MAX_VEHICLE_IMAGES} foto per veicolo. Rimuovine alcune prima di continuare.`);
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
      vehicle_category: state.vehicleCategory.trim() || null,
      vehicle_condition: state.vehicleCondition.trim() || null,
      body_type: state.bodyType.trim() || null,
      brand: state.brand.trim() || null,
      model: state.model.trim() || null,
      version: state.version.trim() || null,
      interior_type: state.interiorType.trim() || null,
      // "Anno" non e' un campo compilabile a parte: si ricava dalla data di
      // immatricolazione, cosi' i due valori non possono disallinearsi. Ma le
      // vetture importate la data piena non ce l'hanno, e senza questa
      // funzione salvarle ne cancellava l'anno.
      year: campiImmatricolazioneDaModulo({
        registrationDate: state.registrationDate,
        annoInArchivio: annoInArchivio,
      }).year,
      engine_size: state.engineSize.trim() || null,
      traction: normalizeVehicleTraction(state.traction),
      power_kw: state.powerKw.trim() ? Number(state.powerKw) : null,
      power_cv: state.powerCv.trim() ? Number(state.powerCv) : null,
      doors: state.doors.trim() ? Number(state.doors) : null,
      emission_class: state.emissionClass.trim() || null,
      registration_date: campiImmatricolazioneDaModulo({
        registrationDate: state.registrationDate,
        annoInArchivio: annoInArchivio,
      }).registration_date,
      color: canonicalizeVehicleColorLabel(state.color) || null,
      vin: state.vin.trim() || null,
      mileage: parseMileageForSave(state.mileage),
      fuel: state.fuel.trim() || null,
      transmission: state.transmission.trim() || null,
      price: state.price.trim() ? Number(state.price) : null,
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
        setError(createError?.message || "Errore durante creazione veicolo.");
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
        // Downscale before upload: phone photos arrive at 4K (~3.8 MB) but are
        // only ever rendered into ~400px cards, and decoding one of those
        // stalls scrolling on the public pages. Falls back to the original
        // file if the browser can't do the resize, so an upload never fails
        // because of this.
        const file = await resizeImageForUpload(pendingFiles[index]);
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

    // L'identificativo della fotografia non basta a dire che sia nostra.
    const { error: deleteError } = await supabase
      .from("vehicle_images")
      .delete()
      .eq("id", image.id)
      .eq("dealer_id", currentDealerId ?? "");
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
      .eq("dealer_id", currentDealerId ?? "")
      .order("position", { ascending: true });

    const allIds = (imageRows ?? []).map((row) => row.id);
    if (allIds.length === 0) return;

    await supabase.from("vehicle_images").update({ is_cover: false }).in("id", allIds).eq("dealer_id", currentDealerId ?? "");
    await supabase
      .from("vehicle_images")
      .update({ is_cover: true })
      .eq("id", imageId)
      .eq("dealer_id", currentDealerId ?? "");

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
    <DealerDashboardShell title={title} dealerName={dealerName}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Editor veicolo</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">Compila i dati del veicolo e gestisci le foto dell&apos;annuncio.</p>
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
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                />
                <button
                  type="button"
                  onClick={handlePlateLookup}
                  disabled={plateLookupLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {plateLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Compila da targa
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 sm:col-span-2">
                <span className={getFieldLabelClass(missingFieldSet.has("vehicleCategory"))}>Tipo veicolo *</span>
                <select
                  value={state.vehicleCategory}
                  onChange={(event) => updateField("vehicleCategory", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("vehicleCategory"))}
                >
                  <option value="">Seleziona tipo...</option>
                  <option value="Auto">Auto</option>
                  <option value="Veicolo commerciale">Veicolo commerciale</option>
                </select>
              </label>
              <label className="block space-y-2 sm:col-span-2">
                <span className={getFieldLabelClass(missingFieldSet.has("vehicleCondition"))}>Condizioni *</span>
                <select
                  value={state.vehicleCondition}
                  onChange={(event) => updateField("vehicleCondition", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("vehicleCondition"))}
                >
                  <option value="">Seleziona condizioni...</option>
                  <option value="Nuovo">Nuovo</option>
                  <option value="Usato">Usato</option>
                  <option value="Aziendale">Aziendale</option>
                  <option value="Km/0">Km/0</option>
                </select>
              </label>
              <label className="block space-y-2 sm:col-span-2">
                <span className={getFieldLabelClass(missingFieldSet.has("bodyType"))}>Carrozzeria</span>
                <select
                  value={state.bodyType}
                  onChange={(event) => updateField("bodyType", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("bodyType"))}
                >
                  <option value="">Seleziona carrozzeria...</option>
                  {VEHICLE_BODY_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("brand"))}>Marca *</span>
                <select
                  value={state.brand}
                  onChange={(event) => updateField("brand", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("brand"))}
                >
                  <option value="">Seleziona marca</option>
                  {hasCustomSelectedBrand ? <option value={state.brand}>{state.brand}</option> : null}
                  {brandOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("model"))}>Modello *</span>
                {showCustomModelField || hasCustomSelectedModel ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={state.model}
                      onChange={(event) => updateField("model", event.target.value)}
                      placeholder="Inserisci modello"
                      className={getFieldInputClass(missingFieldSet.has("model"))}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomModelField(false);
                        updateField("model", "");
                      }}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Scegli dalla lista
                    </button>
                  </div>
                ) : (
                  <select
                    value={state.model}
                    onChange={(event) => {
                      if (event.target.value === "__custom__") {
                        setShowCustomModelField(true);
                        updateField("model", "");
                        return;
                      }
                      updateField("model", event.target.value);
                    }}
                    className={getFieldInputClass(missingFieldSet.has("model"))}
                  >
                    <option value="">{selectedBrand ? "Seleziona modello" : "Seleziona prima la marca"}</option>
                    {modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value="__custom__">Altro (inserisci manualmente)</option>
                  </select>
                )}
              </label>
              <EditorField label="Versione" value={state.version} onChange={(value) => updateField("version", value)} missing={missingFieldSet.has("version")} />
              <EditorField
                label="Cilindrata"
                value={state.engineSize}
                onChange={(value) => updateField("engineSize", value)}
                inputMode="numeric"
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
                missing={missingFieldSet.has("powerKw")}
              />
              <EditorField
                label="Potenza CV"
                value={state.powerCv}
                onChange={(value) => updateField("powerCv", value)}
                inputMode="numeric"
                missing={missingFieldSet.has("powerCv")}
              />
              <EditorField
                label="Porte"
                value={state.doors}
                onChange={(value) => updateField("doors", value)}
                inputMode="numeric"
                missing={missingFieldSet.has("doors")}
              />
              <EditorField label="Classe Euro" value={state.emissionClass} onChange={(value) => updateField("emissionClass", value)} />
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("registrationDate"))}>Data immatricolazione</span>
                <input
                  type="date"
                  value={state.registrationDate}
                  min="1950-01-01"
                  max={maxRegistrationDate}
                  onChange={(event) => updateField("registrationDate", event.target.value)}
                  className={getFieldInputClass(missingFieldSet.has("registrationDate"))}
                />
                {/* Le vetture importate portano mese e anno, non il giorno: il
                    campo qui sopra risulta vuoto e sembra un dato perso.
                    Dirlo evita che qualcuno ne inventi uno per riempirlo. */}
                {!state.registrationDate && annoInArchivio ? (
                  <span className="block text-xs text-slate-500">
                    Dal sito della concessionaria: {meseInArchivio ? `${meseInArchivio}/` : ""}
                    {annoInArchivio}. Resta cosi&apos; se non compili il giorno.
                  </span>
                ) : null}
              </label>
              <label className="block space-y-2">
                <span className={getFieldLabelClass(missingFieldSet.has("color"))}>Colore</span>
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
                <span className={getFieldLabelClass(missingFieldSet.has("interiorType"))}>Interni</span>
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
                <span className={getFieldLabelClass(missingFieldSet.has("mileage"))}>Chilometri</span>
                <input
                  type="text"
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
                  {state.transmission && !VEHICLE_TRANSMISSION_OPTIONS.includes(state.transmission as (typeof VEHICLE_TRANSMISSION_OPTIONS)[number]) ? (
                    <option value={state.transmission}>{state.transmission}</option>
                  ) : null}
                  {VEHICLE_TRANSMISSION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
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
                  {/* A vehicle can still hold another lifecycle state (set by
                      feed import or an earlier version of this form), so keep
                      that value selectable rather than silently rewriting it. */}
                  {state.status !== "draft" && state.status !== "published" ? (
                    <option value={state.status}>{formatVehicleStatus(state.status)}</option>
                  ) : null}
                </select>
                <p className="text-xs text-slate-500">Stato attuale: {formatVehicleStatus(state.status)}</p>
              </label>
            </div>

            <label className="mt-3 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Descrizione <span className="font-normal normal-case tracking-normal text-slate-400">(consigliata)</span>
              </span>
              <textarea
                rows={5}
                value={state.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Descrizione commerciale del veicolo: aiuta a vendere, ma non e' obbligatoria"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-300"
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
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                <ImagePlus className="h-4 w-4 text-blue-600" />
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
              <p className={`mt-1 text-xs ${images.length + pendingFiles.length > MAX_VEHICLE_IMAGES ? "font-semibold text-red-600" : "text-slate-500"}`}>
                {images.length + pendingFiles.length} / {MAX_VEHICLE_IMAGES} foto totali per il veicolo
              </p>
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
                          <img src={image.previewUrl} alt={safeText(image.image_url)} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
