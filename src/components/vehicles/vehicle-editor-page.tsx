"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { supabase } from "@/lib/supabaseClient";
import { extractVehicleImagePath, formatVehicleStatus, safeText, type VehicleImageRow, type VehicleRow } from "@/lib/vehicles";

type VehicleEditorPageProps = {
  mode: "create" | "edit";
  vehicleId?: string;
};

type EditorState = {
  brand: string;
  model: string;
  version: string;
  year: string;
  mileage: string;
  fuel: string;
  transmission: string;
  price: string;
  city: string;
  province: string;
  description: string;
  status: string;
};

const INITIAL_STATE: EditorState = {
  brand: "",
  model: "",
  version: "",
  year: "",
  mileage: "",
  fuel: "",
  transmission: "",
  price: "",
  city: "",
  province: "",
  description: "",
  status: "draft",
};

type ViewImage = VehicleImageRow & { previewUrl: string | null };

export function VehicleEditorPage({ mode, vehicleId }: VehicleEditorPageProps) {
  const router = useRouter();

  const [dealerName, setDealerName] = useState("Dealer Console");
  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [images, setImages] = useState<ViewImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const title = useMemo(() => (mode === "create" ? "Nuovo Veicolo" : "Modifica Veicolo"), [mode]);

  useEffect(() => {
    let alive = true;

    const fetchDealer = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) return;

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
    if (mode !== "edit" || !vehicleId) return;

    let alive = true;

    const fetchVehicle = async () => {
      setLoading(true);
      setError(null);

      const { data, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, brand, model, version, year, mileage, fuel, transmission, price, city, province, description, status, published")
        .eq("id", vehicleId)
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
        year: data.year === null || data.year === undefined ? "" : String(data.year),
        mileage: typeof data.mileage === "number" ? String(data.mileage) : "",
        fuel: String(data.fuel ?? ""),
        transmission: String(data.transmission ?? ""),
        price: data.price === null || data.price === undefined ? "" : String(data.price),
        city: String(data.city ?? ""),
        province: String(data.province ?? ""),
        description: String(data.description ?? ""),
        status: String(data.status ?? (data.published ? "published" : "draft")),
      });
      setImages(resolvedImages);
      setLoading(false);
    };

    void fetchVehicle();

    return () => {
      alive = false;
    };
  }, [mode, vehicleId]);

  const updateField = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const vehiclePayload = {
      brand: state.brand.trim() || null,
      model: state.model.trim() || null,
      version: state.version.trim() || null,
      year: state.year.trim() || null,
      mileage: state.mileage.trim() ? Number(state.mileage) : null,
      fuel: state.fuel.trim() || null,
      transmission: state.transmission.trim() || null,
      price: state.price.trim() ? Number(state.price) : null,
      city: state.city.trim() || null,
      province: state.province.trim() || null,
      description: state.description.trim() || null,
      status: state.status,
      published: state.status === "published",
    };

    let targetVehicleId = vehicleId;

    if (mode === "create") {
      const { data, error: createError } = await supabase.from("vehicles").insert(vehiclePayload).select("id").single<{ id: string }>();

      if (createError || !data?.id) {
        setError(createError?.message || "Errore durante creazione veicolo.");
        setSaving(false);
        return;
      }

      targetVehicleId = data.id;
    } else {
      const { error: updateError } = await supabase.from("vehicles").update(vehiclePayload).eq("id", vehicleId);
      if (updateError) {
        setError(updateError.message || "Errore durante aggiornamento veicolo.");
        setSaving(false);
        return;
      }
    }

    if (targetVehicleId && pendingFiles.length > 0) {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        setError("Sessione non valida per upload immagini.");
        setSaving(false);
        return;
      }

      const uploadedRows: Array<{ vehicle_id: string; image_url: string; position: number; is_cover: boolean }> = [];

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
    }

    setPendingFiles([]);
    setSaving(false);
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

    setImages((prev) => prev.map((image) => ({ ...image, is_cover: image.id === imageId })));
  };

  return (
    <DealerDashboardShell title={title} dealerName={dealerName} avatarInitials="DC" unreadNotifications={3}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Vehicle editor</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">Compila i dati del veicolo e gestisci immagini da Supabase Storage.</p>
      </section>

      {loading ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">Caricamento dati veicolo...</section>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <EditorField label="Marca" value={state.brand} onChange={(value) => updateField("brand", value)} required />
              <EditorField label="Modello" value={state.model} onChange={(value) => updateField("model", value)} required />
              <EditorField label="Versione" value={state.version} onChange={(value) => updateField("version", value)} />
              <EditorField label="Anno" value={state.year} onChange={(value) => updateField("year", value)} />
              <EditorField label="Prezzo" value={state.price} onChange={(value) => updateField("price", value)} inputMode="numeric" />
              <EditorField label="Chilometri" value={state.mileage} onChange={(value) => updateField("mileage", value)} inputMode="numeric" />
              <EditorField label="Alimentazione" value={state.fuel} onChange={(value) => updateField("fuel", value)} />
              <EditorField label="Cambio" value={state.transmission} onChange={(value) => updateField("transmission", value)} />
              <EditorField label="Citta" value={state.city} onChange={(value) => updateField("city", value)} />
              <EditorField label="Provincia" value={state.province} onChange={(value) => updateField("province", value)} />

              <label className="block space-y-2 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stato</span>
                <select
                  value={state.status}
                  onChange={(event) => updateField("status", event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
                >
                  <option value="draft">Bozza</option>
                  <option value="published">Pubblicato</option>
                  <option value="review">In revisione</option>
                  <option value="sold">Venduto</option>
                </select>
                <p className="text-xs text-slate-500">Stato attuale: {formatVehicleStatus(state.status)}</p>
              </label>
            </div>

            <label className="mt-3 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Descrizione</span>
              <textarea
                rows={5}
                value={state.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Descrizione commerciale del veicolo"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300"
              />
            </label>
          </section>

          <section className="dashboard-fade-up space-y-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <ImagePlus className="h-4 w-4 text-sky-600" />
                Upload immagini
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                className="mt-3 block w-full text-sm text-slate-700"
              />
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
              {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
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
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <input
        type="text"
        required={required}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Inserisci ${label.toLowerCase()}`}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
      />
    </label>
  );
}
