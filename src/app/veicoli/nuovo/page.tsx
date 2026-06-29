"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type VehicleState = {
  brand: string;
  model: string;
  trim: string;
  year: string;
  registrationMonth: string;
  mileage: string;
  fuelType: string;
  transmission: string;
  bodyType: string;
  color: string;
  price: string;
  vatIncluded: string;
  licensePlate: string;
  vin: string;
  description: string;
  listingStatus: "Bozza" | "Pubblicato";
  doors: string;
  seats: string;
  horsepower: string;
  engine: string;
  co2: string;
  emissionClass: string;
  previousOwners: string;
  warranty: string;
  availability: string;
  province: string;
  city: string;
};

type PhotoItem = {
  id: string;
  kind: "new" | "existing";
  vehicleImageId?: string;
  file?: File;
  previewUrl?: string;
  publicUrl?: string;
  path?: string;
  mimeType?: string;
};

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const TABS = [
  "Dati principali",
  "Foto",
  "Caratteristiche",
  "Optional",
  "Prezzo",
  "Pubblicazione",
  "Anteprima",
] as const;

type Tab = (typeof TABS)[number];

const sidebarItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Veicoli", href: "/veicoli" },
  { label: "Nuovo veicolo", href: "/veicoli/nuovo" },
  { label: "Lead", href: "/lead" },
  { label: "Clienti", href: "/clienti" },
  { label: "Agenda", href: "/agenda" },
  { label: "Statistiche", href: "/statistiche" },
  { label: "Impostazioni", href: "/registrazione" },
];

export default function NewVehiclePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-600">Caricamento...</div>}>
      <NewVehiclePageContent />
    </Suspense>
  );
}

function NewVehiclePageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasIdParam = searchParams.has("id");
  const urlVehicleId = searchParams.get("id")?.trim() || null;
  const [vehicle, setVehicle] = useState<VehicleState>({
    brand: "Volkswagen",
    model: "Golf",
    trim: "Style",
    year: "2020",
    registrationMonth: "03",
    mileage: "52000",
    fuelType: "Benzina",
    transmission: "Automatico",
    bodyType: "Berlina",
    color: "Bianco",
    price: "21990",
    vatIncluded: "Sì",
    licensePlate: "AB123CD",
    vin: "WVWZZZ1KZLW000000",
    description: "Un usato in ottime condizioni, unico proprietario, tagliandi certificati e tutti gli optional disponibili.",
    listingStatus: "Bozza",
    doors: "5",
    seats: "5",
    horsepower: "150",
    engine: "1.5 TSI",
    co2: "120 g/km",
    emissionClass: "Euro 6",
    previousOwners: "1",
    warranty: "12 mesi",
    availability: "Immediata",
    province: "MI",
    city: "Milano",
  });
  const [activeTab, setActiveTab] = useState<Tab>("Dati principali");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [photoDragId, setPhotoDragId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingVehicle, setIsLoadingVehicle] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(() => searchParams.get("id"));
  const isEditMode = hasIdParam;
  const coverPhoto = getFirstValidPhoto(photos);

  useEffect(() => {
    const currentVehicleId = urlVehicleId;
    if (!currentVehicleId) {
      return;
    }

    const fetchVehicle = async () => {
      setIsLoadingVehicle(true);
      const { data, error } = await supabase
        .from("vehicles")
        .select("*, vehicle_images(id, vehicle_id, image_url, position, is_cover)")
        .eq("id", currentVehicleId)
        .maybeSingle();
      setIsLoadingVehicle(false);

      if (error) {
        setStatusMessage(error.message || "Errore nel caricamento del veicolo.");
        setStatusMessageType("error");
        return;
      }

      if (!data) {
        setStatusMessage("Veicolo non trovato.");
        setStatusMessageType("error");
        return;
      }

      setVehicleId(currentVehicleId);
      setVehicle({
        brand: String(data.brand ?? ""),
        model: String(data.model ?? ""),
        trim: String(data.version ?? data.trim ?? ""),
        year: String(data.year ?? ""),
        registrationMonth: String(data.registration_month ?? ""),
        mileage: String(data.mileage ?? ""),
        fuelType: String(data.fuel ?? ""),
        transmission: String(data.transmission ?? ""),
        bodyType: String(data.body_type ?? ""),
        color: String(data.color ?? ""),
        price: String(data.price ?? ""),
        vatIncluded: data.vat_exposed === true ? "Sì" : data.vat_exposed === false ? "No" : "",
        licensePlate: String(data.plate ?? ""),
        vin: String(data.vin ?? ""),
        description: String(data.description ?? ""),
        listingStatus: data.status === "published" ? "Pubblicato" : "Bozza",
        doors: String(data.doors ?? ""),
        seats: String(data.seats ?? ""),
        horsepower: String(data.power_cv ?? ""),
        engine: String(data.engine_size ?? ""),
        co2: String(data.co2_emissions ?? ""),
        emissionClass: String(data.emission_class ?? ""),
        previousOwners: String(data.previous_owners ?? ""),
        warranty: String(data.warranty ?? ""),
        availability: String(data.availability ?? ""),
        province: String(data.province ?? ""),
        city: String(data.city ?? ""),
      });

      const vehicleImages = Array.isArray(data.vehicle_images)
        ? [...data.vehicle_images].sort((a, b) => {
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
        : [];

      setPhotos(
        vehicleImages
          .map((image) => {
            const storagePath = getStoragePathFromPublicUrl(String(image.image_url ?? ""));
            const persistedPublicUrl = getPublicUrlFromImageRow({
              publicUrl: null,
              imageUrl: typeof image.image_url === "string" ? image.image_url : null,
              storagePath,
            });

            return {
              ...image,
              storagePath,
              persistedPublicUrl,
            };
          })
          .filter((image) => typeof image.persistedPublicUrl === "string" && image.persistedPublicUrl.length > 0)
          .map((image) => ({
            id: String(image.id ?? `${currentVehicleId}-${Math.random().toString(36).slice(2, 8)}`),
            vehicleImageId: typeof image.id === "string" ? image.id : undefined,
            kind: "existing" as const,
            publicUrl: image.persistedPublicUrl,
            path: image.storagePath,
            mimeType: inferMimeTypeFromUrl(image.persistedPublicUrl ?? ""),
          }))
      );
    };

    void fetchVehicle();
  }, [urlVehicleId]);

  const validateVehicle = () => {
    const requiredFields = [
      { key: "marca", value: vehicle.brand.trim() },
      { key: "modello", value: vehicle.model.trim() },
      { key: "anno", value: vehicle.year.trim() },
      { key: "prezzo", value: vehicle.price.trim() },
    ];

    const missing = requiredFields.filter((field) => !field.value);
    if (missing.length > 0) {
      const missingLabel = missing.map((field) => field.key).join(", ");
      setStatusMessage(`Compila i campi obbligatori: ${missingLabel}.`);
      setStatusMessageType("error");
      return false;
    }

    return true;
  };

  const createVehicleRecord = async (status: "draft" | "published", published: boolean) => {
    setIsSaving(true);
    setStatusMessage(null);
    setStatusMessageType(null);

    if (!validateVehicle()) {
      setIsSaving(false);
      return;
    }

    const parseInteger = (value: string) => {
      const digits = value.replace(/\D/g, "");
      return digits ? parseInt(digits, 10) : null;
    };

    const parseBoolean = (value: string) => {
      const normalized = value.trim().toLowerCase();
      if (normalized === "si" || normalized === "sì" || normalized === "yes" || normalized === "true") {
        return true;
      }
      if (normalized === "no" || normalized === "false") {
        return false;
      }
      return null;
    };

    const basePayload = {
      brand: vehicle.brand,
      model: vehicle.model,
      version: vehicle.trim,
      year: vehicle.year,
      registration_month: vehicle.registrationMonth,
      mileage: parseInteger(vehicle.mileage),
      fuel: vehicle.fuelType,
      transmission: vehicle.transmission,
      body_type: vehicle.bodyType,
      color: vehicle.color,
      price: vehicle.price,
      vat_exposed: parseBoolean(vehicle.vatIncluded),
      plate: vehicle.licensePlate,
      vin: vehicle.vin,
      description: vehicle.description,
      status,
      published,
      doors: parseInteger(vehicle.doors),
      seats: parseInteger(vehicle.seats),
      power_cv: parseInteger(vehicle.horsepower),
      engine_size: parseInteger(vehicle.engine),
      co2_emissions: parseInteger(vehicle.co2),
      emission_class: vehicle.emissionClass,
      previous_owners: parseInteger(vehicle.previousOwners),
      warranty: vehicle.warranty,
      availability: vehicle.availability,
      province: vehicle.province,
      city: vehicle.city,
      updated_at: new Date().toISOString(),
    };

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Utente non autenticato.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("dealer_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      const dealerId = profile?.dealer_id ?? null;
      if (!dealerId) {
        throw new Error("dealer_id non trovato nel profilo utente.");
      }

      let currentVehicleId: string | null = null;

      if (isEditMode) {
        if (!urlVehicleId) {
          setStatusMessage("ID veicolo mancante: impossibile aggiornare.");
          setStatusMessageType("error");
          return;
        }

        console.log("EDIT VEHICLE ID", urlVehicleId);

        const updatePayload = {
          ...basePayload,
          dealer_id: dealerId,
        };

        const { data: updatedVehicles, error } = await supabase
          .from("vehicles")
          .update(updatePayload)
          .eq("id", urlVehicleId)
          .select();

        if (error) {
          setStatusMessage(error.message || "Errore durante l'aggiornamento del veicolo.");
          setStatusMessageType("error");
          return;
        }

        if (!updatedVehicles || updatedVehicles.length === 0) {
          setStatusMessage("Nessun veicolo aggiornato: ID non trovato o non autorizzato");
          setStatusMessageType("error");
          return;
        }

        currentVehicleId = String(updatedVehicles[0]?.id ?? urlVehicleId);
        setVehicleId(currentVehicleId);
      } else {
        const { data, error } = await supabase
          .from("vehicles")
          .insert([{ ...basePayload, dealer_id: dealerId, created_at: new Date().toISOString() }])
          .select("id")
          .single();
        if (error) {
          throw error;
        }
        currentVehicleId = data?.id ?? null;
        if (currentVehicleId) {
          setVehicleId(currentVehicleId);
        }
      }

      if (!currentVehicleId) {
        throw new Error("Impossibile recuperare l'identificativo del veicolo.");
      }

      const newPhotos = photos.filter((photo) => photo.kind === "new" && photo.file);
      const uploadedPhotoResults: Array<{ id: string; publicUrl: string; path: string; mimeType: string }> = [];

      for (const photo of newPhotos) {
        if (!photo.file) continue;
        const safeFileName = `${Date.now()}-${photo.file.name.replace(/\s+/g, "-").toLowerCase()}`;
        const storagePath = `${currentVehicleId}/${safeFileName}`;
        const { error: uploadError } = await supabase.storage.from("vehicle-images").upload(storagePath, photo.file, {
          cacheControl: "3600",
          upsert: false,
        });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage.from("vehicle-images").getPublicUrl(storagePath);
        uploadedPhotoResults.push({
          id: photo.id,
          publicUrl: publicUrlData.publicUrl,
          path: storagePath,
          mimeType: String(photo.file.type || "image/jpeg"),
        });
      }

      const finalImageRows = photos.flatMap((photo) => {
        if (photo.kind === "existing" && photo.publicUrl) {
          const storagePath = photo.path ?? getStoragePathFromPublicUrl(photo.publicUrl);
          const publicUrl = getPublicUrlFromImageRow({
            publicUrl: photo.publicUrl,
            imageUrl: photo.publicUrl,
            storagePath,
          });

          if (!publicUrl || !isSupportedImageReference(publicUrl)) {
            return [];
          }

          return [{
            image_url: publicUrl,
          }];
        }

        if (photo.kind === "new") {
          const uploadedPhoto = uploadedPhotoResults.find((item) => item.id === photo.id);
          if (!uploadedPhoto || !isSupportedImageReference(uploadedPhoto.publicUrl)) {
            return [];
          }

          return [{
            image_url: uploadedPhoto.publicUrl,
          }];
        }

        return [];
      });

      const { error: deleteVehicleImagesError } = await supabase
        .from("vehicle_images")
        .delete()
        .eq("vehicle_id", currentVehicleId);

      if (deleteVehicleImagesError) {
        throw deleteVehicleImagesError;
      }

      if (finalImageRows.length > 0) {
        const imageRows = finalImageRows.map((image, index) => ({
          vehicle_id: currentVehicleId,
          image_url: image.image_url,
          position: index,
          is_cover: index === 0,
        }));

        const { error: insertVehicleImagesError } = await supabase.from("vehicle_images").insert(imageRows);
        if (insertVehicleImagesError) {
          throw insertVehicleImagesError;
        }
      }

      setPhotos((current) =>
        current.map((photo) => {
          const uploadedPhoto = uploadedPhotoResults.find((item) => item.id === photo.id);
          if (!uploadedPhoto) {
            return photo;
          }
          const nextId = uploadedPhoto.path || uploadedPhoto.publicUrl || photo.id;
          return {
            ...photo,
            id: nextId,
            vehicleImageId: undefined,
            kind: "existing" as const,
            publicUrl: uploadedPhoto.publicUrl,
            path: uploadedPhoto.path,
            mimeType: uploadedPhoto.mimeType,
            file: undefined,
            previewUrl: undefined,
          };
        })
      );

      if (isEditMode) {
        setStatusMessage("Veicolo aggiornato con successo");
        setStatusMessageType("success");
        setTimeout(() => {
          router.push("/veicoli");
        }, 700);
        return;
      }

      setStatusMessage("Veicolo salvato con successo");
      setStatusMessageType("success");
    } catch (error) {
      console.error("SAVE VEHICLE ERROR", error);
      setStatusMessage(formatSaveVehicleError(error));
      setStatusMessageType("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => createVehicleRecord("draft", false);
  const handlePublishVehicle = () => createVehicleRecord("published", true);

  const handleChange = (field: keyof VehicleState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setVehicle({ ...vehicle, [field]: event.target.value });
    };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const { nextPhotos, hasUnsupported, hasConversionFailure } = await buildSupportedPhotoItems(Array.from(files));

    if (hasConversionFailure) {
      setStatusMessage("Errore nella conversione HEIC/HEIF. Riprova con un file JPG, PNG o WEBP.");
      setStatusMessageType("error");
    } else if (hasUnsupported) {
      setStatusMessage("Formato non supportato. Converti la foto in JPG, PNG o WEBP.");
      setStatusMessageType("error");
    }

    setPhotos((current) => [...current, ...nextPhotos]);
    event.target.value = "";
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const files = event.dataTransfer.files;
    if (!files) return;

    const { nextPhotos, hasUnsupported, hasConversionFailure } = await buildSupportedPhotoItems(Array.from(files));

    if (hasConversionFailure) {
      setStatusMessage("Errore nella conversione HEIC/HEIF. Riprova con un file JPG, PNG o WEBP.");
      setStatusMessageType("error");
    } else if (hasUnsupported) {
      setStatusMessage("Formato non supportato. Converti la foto in JPG, PNG o WEBP.");
      setStatusMessageType("error");
    }

    setPhotos((current) => [...current, ...nextPhotos]);
  };

  const handleMovePhoto = (photoId: string, direction: -1 | 1) => {
    setPhotos((current) => {
      const index = current.findIndex((photo) => photo.id === photoId);
      if (index < 0) return current;

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const nextPhotos = [...current];
      const [movedPhoto] = nextPhotos.splice(index, 1);
      nextPhotos.splice(nextIndex, 0, movedPhoto);
      return nextPhotos;
    });
  };

  const handleReorderPhoto = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setPhotos((current) => {
      const sourceIndex = current.findIndex((photo) => photo.id === sourceId);
      const targetIndex = current.findIndex((photo) => photo.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const nextPhotos = [...current];
      const [movedPhoto] = nextPhotos.splice(sourceIndex, 1);
      nextPhotos.splice(targetIndex, 0, movedPhoto);
      return nextPhotos;
    });
    setPhotoDragId(null);
  };

  const handleRemovePhoto = async (photoId: string) => {
    const photo = photos.find((item) => item.id === photoId);
    if (!photo) return;

    if (photo.kind === "existing" && vehicleId && photo.vehicleImageId) {
      const { error: deleteImageRowError } = await supabase
        .from("vehicle_images")
        .delete()
        .eq("id", photo.vehicleImageId)
        .eq("vehicle_id", vehicleId);

      if (deleteImageRowError) {
        setStatusMessage(deleteImageRowError.message || "Impossibile rimuovere l'immagine dal database.");
        setStatusMessageType("error");
        return;
      }
    }

    if (photo.kind === "existing" && photo.path) {
      const { error } = await supabase.storage.from("vehicle-images").remove([photo.path]);
      if (error) {
        setStatusMessage(error.message || "Impossibile rimuovere l'immagine dallo storage.");
        setStatusMessageType("error");
        return;
      }
    }

    setPhotos((current) => current.filter((item) => item.id !== photoId));
  };

  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo.previewUrl) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      });
    };
  }, [photos]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen grid-cols-[280px_1fr] gap-6 px-4 py-6 lg:px-8">
        <aside className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Dealer Manager</p>
            <h2 className="mt-4 text-2xl font-semibold text-slate-900">Concessionaria</h2>
          </div>
          <nav className="space-y-2">
            {sidebarItems.map((item) => {
              const isActive = pathname === item.href || (item.href === "/veicoli/nuovo" && pathname.startsWith("/veicoli/nuovo"));

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`block rounded-3xl px-4 py-3 text-left text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-10 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Riepilogo</p>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <StatRow label="Annunci" value="24" />
              <StatRow label="Lead" value="68" />
              <StatRow label="Clienti" value="136" />
            </dl>
          </div>
        </aside>

        <section className="space-y-6">
          <header className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Nuovo veicolo</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Scheda inserimento veicolo</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Inserisci tutti i dettagli e completa la scheda con immagini e dati rilevanti per la vendita.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Salva bozza
                </button>
                <button
                  type="button"
                  onClick={handlePublishVehicle}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isEditMode ? "Aggiorna veicolo" : "Pubblica veicolo"}
                </button>
              </div>
            </div>
          </header>

          {statusMessage ? (
            <div
              className={`rounded-3xl border px-5 py-4 text-sm ${
                statusMessageType === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {statusMessage}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Sezioni</h2>
                    <p className="mt-2 text-sm text-slate-600">Naviga per compilare le informazioni più velocemente.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`w-full rounded-3xl px-4 py-3 text-left text-sm font-semibold transition ${
                        activeTab === tab
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                {activeTab === "Dati principali" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Marca" value={vehicle.brand} onChange={handleChange("brand")} />
                      <Field label="Modello" value={vehicle.model} onChange={handleChange("model")} />
                      <Field label="Versione" value={vehicle.trim} onChange={handleChange("trim")} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Anno" type="number" value={vehicle.year} onChange={handleChange("year")} />
                      <LabelledInput
                        label="Mese immatricolazione"
                        value={`${vehicle.year}-${vehicle.registrationMonth}`}
                        type="month"
                        onChange={(event) => {
                          const [year, month] = event.target.value.split("-");
                          setVehicle({ ...vehicle, year, registrationMonth: month });
                        }}
                      />
                      <Field label="Chilometri" type="number" value={vehicle.mileage} onChange={handleChange("mileage")} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <SelectField label="Alimentazione" value={vehicle.fuelType} onChange={handleChange("fuelType")} options={["Benzina", "Diesel", "Ibrido", "Elettrico"]} />
                      <SelectField label="Cambio" value={vehicle.transmission} onChange={handleChange("transmission")} options={["Manuale", "Automatico", "Semi-automatico"]} />
                      <SelectField label="Carrozzeria" value={vehicle.bodyType} onChange={handleChange("bodyType")} options={["Berlina", "SUV", "Coupé", "Station Wagon"]} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Colore" value={vehicle.color} onChange={handleChange("color")} />
                      <Field label="Targa" value={vehicle.licensePlate} onChange={handleChange("licensePlate")} />
                      <Field label="Telaio/VIN" value={vehicle.vin} onChange={handleChange("vin")} />
                    </div>
                  </div>
                )}

                {activeTab === "Foto" && (
                  <div className="space-y-6">
                    <div
                      className={`rounded-[28px] border-2 border-dashed px-6 py-14 text-center transition ${
                        dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"
                      }`}
                      onDragEnter={() => setDragActive(true)}
                      onDragLeave={() => setDragActive(false)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-700">Drag & Drop</p>
                      <p className="mt-4 text-sm text-slate-600">Trascina qui le foto del veicolo oppure selezionale dal tuo dispositivo.</p>
                      <p className="mt-2 text-xs text-slate-500">Le immagini verranno caricate nel bucket vehicle-images e collegate al veicolo al salvataggio.</p>
                      <label className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
                        Seleziona foto
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          multiple
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">Copertina</p>
                        {coverPhoto ? (
                          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 h-48 overflow-hidden rounded-3xl bg-slate-200">
                              {coverPhoto.previewUrl || coverPhoto.publicUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={coverPhoto.publicUrl ?? coverPhoto.previewUrl}
                                  alt="Preview copertina"
                                  className="h-full w-full object-cover"
                                  onError={handleImageLoadError}
                                />
                              ) : null}
                            </div>
                            <p className="text-sm font-semibold text-slate-900">
                              {coverPhoto.file?.name ?? "Immagine caricata"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">Questa foto sarà mostrata come immagine principale.</p>
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">Carica almeno una foto per impostare la copertina.</p>
                        )}
                      </div>
                      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">Foto selezionate</p>
                        {isLoadingVehicle ? (
                          <p className="mt-4 text-sm text-slate-500">Caricamento immagini esistenti...</p>
                        ) : photos.length > 0 ? (
                          <ul className="mt-4 space-y-3">
                            {photos.map((photo, index) => (
                              <li
                                key={photo.id}
                                draggable
                                onDragStart={() => setPhotoDragId(photo.id)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => handleReorderPhoto(photoDragId ?? photo.id, photo.id)}
                                className="rounded-3xl border border-slate-200 bg-slate-50 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-slate-200">
                                      {(photo.previewUrl || photo.publicUrl) && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={photo.publicUrl ?? photo.previewUrl}
                                          alt={photo.file?.name ?? "Foto veicolo"}
                                          className="h-full w-full object-cover"
                                          onError={handleImageLoadError}
                                        />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">
                                        {photo.file?.name ?? "Immagine esistente"}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {index === 0 ? "Copertina" : `#${index + 1}`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleMovePhoto(photo.id, -1)}
                                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                    >
                                      Su
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMovePhoto(photo.id, 1)}
                                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                    >
                                      Giù
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePhoto(photo.id)}
                                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                    >
                                      Elimina
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">Nessuna foto caricata.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "Caratteristiche" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Porte" type="number" value={vehicle.doors} onChange={handleChange("doors")} />
                      <Field label="Posti" type="number" value={vehicle.seats} onChange={handleChange("seats")} />
                      <Field label="Potenza CV" type="number" value={vehicle.horsepower} onChange={handleChange("horsepower")} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Cilindrata" value={vehicle.engine} onChange={handleChange("engine")} />
                      <Field label="Emissioni CO2" value={vehicle.co2} onChange={handleChange("co2")} />
                      <Field label="Classe emissioni" value={vehicle.emissionClass} onChange={handleChange("emissionClass")} />
                    </div>
                  </div>
                )}

                {activeTab === "Optional" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Proprietari precedenti" type="number" value={vehicle.previousOwners} onChange={handleChange("previousOwners")} />
                      <SelectField label="Garanzia" value={vehicle.warranty} onChange={handleChange("warranty")} options={["12 mesi", "24 mesi", "Garanzia concessionaria"]} />
                      <SelectField label="Disponibilità" value={vehicle.availability} onChange={handleChange("availability")} options={["Immediata", "Entro 7 giorni", "Su richiesta"]} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="Provincia" value={vehicle.province} onChange={handleChange("province")} />
                      <Field label="Città" value={vehicle.city} onChange={handleChange("city")} />
                    </div>
                  </div>
                )}

                {activeTab === "Prezzo" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="Prezzo" type="number" value={vehicle.price} onChange={handleChange("price")} />
                      <SelectField label="IVA esposta" value={vehicle.vatIncluded} onChange={handleChange("vatIncluded")} options={["Sì", "No"]} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="Targa" value={vehicle.licensePlate} onChange={handleChange("licensePlate")} />
                      <Field label="Telaio/VIN" value={vehicle.vin} onChange={handleChange("vin")} />
                    </div>
                  </div>
                )}

                {activeTab === "Pubblicazione" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-700">Stato annuncio</p>
                        <div className="flex flex-wrap gap-3">
                          {(["Bozza", "Pubblicato"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setVehicle({ ...vehicle, listingStatus: status })}
                              className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                                vehicle.listingStatus === status
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="descriptionPub" className="mb-2 block text-sm font-medium text-slate-700">
                          Descrizione annuncio
                        </label>
                        <textarea
                          id="descriptionPub"
                          rows={5}
                          value={vehicle.description}
                          onChange={handleChange("description")}
                          className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "Anteprima" && (
                  <div className="space-y-6">
                    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
                      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{vehicle.listingStatus}</p>
                          <h3 className="mt-3 text-3xl font-semibold text-slate-900">{vehicle.brand} {vehicle.model} {vehicle.trim}</h3>
                          <p className="mt-2 text-sm text-slate-600">{vehicle.year} • {vehicle.bodyType} • {vehicle.transmission} • {vehicle.fuelType}</p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <PreviewStat label="Chilometri" value={`${vehicle.mileage} km`} />
                            <PreviewStat label="Potenza" value={`${vehicle.horsepower} CV`} />
                            <PreviewStat label="Emissioni" value={vehicle.co2} />
                          </div>
                        </div>
                        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center">
                          <p className="text-sm uppercase tracking-[0.26em] text-slate-500">Prezzo</p>
                          <p className="mt-4 text-4xl font-semibold text-slate-900">€{vehicle.price}</p>
                          <p className="mt-3 text-sm text-slate-600">IVA {vehicle.vatIncluded === "Sì" ? "esposta" : "non esposta"}</p>
                        </div>
                      </div>
                      <div className="mt-6 rounded-[28px] bg-white p-6">
                        <p className="text-sm font-semibold text-slate-900">Descrizione</p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{vehicle.description}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Stato veicolo</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <StatRow label="Status" value={vehicle.listingStatus} />
                  <StatRow label="Disponibilità" value={vehicle.availability} />
                  <StatRow label="Garanzia" value={vehicle.warranty} />
                </div>
              </div>
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Localizzazione</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <StatRow label="Provincia" value={vehicle.province} />
                  <StatRow label="Città" value={vehicle.city} />
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function getStoragePathFromPublicUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const publicPrefix = "/storage/v1/object/public/vehicle-images/";
    const signPrefix = "/storage/v1/object/sign/vehicle-images/";
    const publicPath = parsedUrl.pathname.split(publicPrefix)[1];
    if (publicPath) {
      return decodeURIComponent(publicPath);
    }

    const signedPath = parsedUrl.pathname.split(signPrefix)[1];
    if (signedPath) {
      return decodeURIComponent(signedPath);
    }

    return "";
  } catch {
    return url.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
  }
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-sm text-slate-600 shadow-sm">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

async function buildSupportedPhotoItems(files: File[]) {
  const nextPhotos: PhotoItem[] = [];
  let hasUnsupported = false;
  let hasConversionFailure = false;

  for (const file of files) {
    const normalized = await normalizeImageFileForUpload(file);
    if (!normalized.file) {
      hasUnsupported = true;
      if (normalized.reason === "conversion-failed") {
        hasConversionFailure = true;
      }
      continue;
    }

    nextPhotos.push({
      id: `${normalized.file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "new",
      file: normalized.file,
      previewUrl: URL.createObjectURL(normalized.file),
      mimeType: normalized.file.type,
    });
  }

  return { nextPhotos, hasUnsupported, hasConversionFailure };
}

async function normalizeImageFileForUpload(file: File) {
  type NormalizeResult = {
    file: File | null;
    reason: "conversion-failed" | "unsupported" | null;
  };

  const mime = (file.type || "").toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isHeicOrHeif = mime === "image/heic" || mime === "image/heif" || extension === "heic" || extension === "heif";

  if (isHeicOrHeif) {
    try {
      const heic2anyModule = await import("heic2any");
      const heic2any = heic2anyModule.default;
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9,
      });

      const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const convertedFile = new File([convertedBlob as BlobPart], `${baseName}.jpg`, { type: "image/jpeg" });
      const successResult: NormalizeResult = { file: convertedFile, reason: null };
      return successResult;
    } catch {
      return { file: null, reason: "conversion-failed" as const };
    }
  }

  if (!isSupportedImageFile(file)) {
    return { file: null, reason: "unsupported" as const };
  }

  const passthroughResult: NormalizeResult = { file, reason: null };
  return passthroughResult;
}

function isSupportedImageFile(file: File) {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

function isSupportedImageReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const directExt = trimmed.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  if (SUPPORTED_IMAGE_EXTENSIONS.has(directExt)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
    return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

function getFirstValidPhoto(photos: PhotoItem[]) {
  return photos.find((photo) => {
    const src = photo.publicUrl ?? photo.previewUrl ?? "";
    return src.length > 0 && isSupportedImageReference(src);
  }) ?? null;
}

function getPublicUrlFromImageRow({
  publicUrl,
  imageUrl,
  storagePath,
}: {
  publicUrl: string | null;
  imageUrl: string | null;
  storagePath: string | null;
}) {
  if (publicUrl && publicUrl.length > 0) {
    return publicUrl;
  }

  if (storagePath && storagePath.length > 0) {
    const { data } = supabase.storage.from("vehicle-images").getPublicUrl(storagePath);
    if (data.publicUrl) {
      return data.publicUrl;
    }
  }

  return imageUrl && imageUrl.length > 0 ? imageUrl : null;
}

function inferMimeTypeFromUrl(url: string) {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function handleImageLoadError(event: React.SyntheticEvent<HTMLImageElement>) {
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

function formatSaveVehicleError(error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      typeof maybeError.message === "string" ? maybeError.message : null,
      typeof maybeError.details === "string" ? `details: ${maybeError.details}` : null,
      typeof maybeError.hint === "string" ? `hint: ${maybeError.hint}` : null,
      typeof maybeError.code === "string" ? `code: ${maybeError.code}` : null,
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Errore durante il salvataggio del veicolo.";
}
