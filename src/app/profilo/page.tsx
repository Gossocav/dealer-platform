"use client";

import { useEffect, useState } from "react";
import { resolveDealerIdForUser } from "@/lib/dealer-association";
import { supabase } from "@/lib/supabaseClient";

type DealerProfile = {
  id: string;
  name: string | null;
  legal_name: string | null;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  vat_number: string | null;
  website: string | null;
  opening_hours: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  user_id?: string | null;
};

type ProfileFormState = {
  name: string;
  legal_name: string;
  logo_url: string;
  address: string;
  city: string;
  province: string;
  zip_code: string;
  phone: string;
  email: string;
  vat_number: string;
  website: string;
  description: string;
  opening_hours: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  youtube: string;
  tiktok: string;
};

const EMPTY_FORM: ProfileFormState = {
  name: "",
  legal_name: "",
  logo_url: "",
  address: "",
  city: "",
  province: "",
  zip_code: "",
  phone: "",
  email: "",
  vat_number: "",
  website: "",
  description: "",
  opening_hours: "",
  facebook: "",
  instagram: "",
  linkedin: "",
  youtube: "",
  tiktok: "",
};

export default function ProfiloPage() {
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      setLoading(true);
      setStatusMessage(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        setLoading(false);
        setStatusMessage(userError?.message || "Utente non autenticato.");
        setStatusType("error");
        return;
      }

      setUserId(user.id);

      let currentDealerId: string | null = null;
      try {
        currentDealerId = await resolveDealerIdForUser(user.id);
      } catch (error) {
        if (!mounted) return;
        setLoading(false);
        setStatusMessage(error instanceof Error ? error.message : "Errore nel recupero profilo utente.");
        setStatusType("error");
        return;
      }

      if (!mounted) return;

      if (!currentDealerId) {
        setLoading(false);
        setStatusMessage("Nessuna concessionaria associata all'account.");
        setStatusType("error");
        return;
      }

      setDealerId(currentDealerId);

      const { data: dealer, error: dealerError } = await supabase
        .from("dealers")
        .select(
          "id, name, legal_name, logo_url, address, city, province, postal_code, phone, email, vat_number, website, opening_hours, facebook_url, instagram_url, linkedin_url"
        )
        .eq("id", currentDealerId)
        .maybeSingle<DealerProfile>();

      setLoading(false);

      if (!mounted) return;

      if (dealerError || !dealer) {
        setStatusMessage(dealerError?.message || "Impossibile caricare i dati concessionaria.");
        setStatusType("error");
        return;
      }

      setForm({
        name: dealer.name ?? "",
        legal_name: dealer.legal_name ?? "",
        logo_url: dealer.logo_url ?? "",
        address: dealer.address ?? "",
        city: dealer.city ?? "",
        province: dealer.province ?? "",
        zip_code: dealer.postal_code ?? "",
        phone: dealer.phone ?? "",
        email: dealer.email ?? "",
        vat_number: dealer.vat_number ?? "",
        website: dealer.website ?? "",
        description: "",
        opening_hours: dealer.opening_hours ?? "",
        facebook: dealer.facebook_url ?? "",
        instagram: dealer.instagram_url ?? "",
        linkedin: dealer.linkedin_url ?? "",
        youtube: "",
        tiktok: "",
      });
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    if (!dealerId && !userId) {
      setStatusMessage("Impossibile identificare la concessionaria da aggiornare.");
      setStatusType("error");
      return;
    }

    if (!form.name.trim()) {
      setStatusMessage("Il nome concessionaria è obbligatorio.");
      setStatusType("error");
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    const payload = {
      name: form.name.trim(),
      legal_name: nullable(form.legal_name),
      logo_url: nullable(form.logo_url),
      address: nullable(form.address),
      city: nullable(form.city),
      province: nullable(form.province),
      postal_code: nullable(form.zip_code),
      phone: nullable(form.phone),
      email: nullable(form.email),
      vat_number: nullable(form.vat_number),
      website: nullable(form.website),
      opening_hours: nullable(form.opening_hours),
      facebook_url: nullable(form.facebook),
      instagram_url: nullable(form.instagram),
      linkedin_url: nullable(form.linkedin),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedById, error: updateByIdError } = dealerId
      ? await supabase.from("dealers").update(payload).eq("id", dealerId).select("id").maybeSingle<{ id: string }>()
      : { data: null, error: null };

    let updatedDealerId = updatedById?.id ?? null;
    let updateError = updateByIdError;

    if (!updatedDealerId && userId) {
      const { data: updatedByUser, error: updateByUserError } = await supabase
        .from("dealers")
        .update(payload)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (updatedByUser?.id) {
        updatedDealerId = updatedByUser.id;
        setDealerId(updatedByUser.id);
        updateError = null;
      } else if (!updateError) {
        updateError = updateByUserError;
      }
    }

    setSaving(false);

    if (updateError) {
      const details = [updateError.message, updateError.details, updateError.hint].filter(Boolean).join(" | ");
      setStatusMessage(details || "Errore nel salvataggio profilo concessionaria.");
      setStatusType("error");
      return;
    }

    if (!updatedDealerId) {
      setStatusMessage("Nessun profilo aggiornato. Verifica associazione account-concessionaria e permessi RLS.");
      setStatusType("error");
      return;
    }

    const { data: dealerAfterSave, error: reloadError } = await supabase
      .from("dealers")
      .select(
        "id, name, legal_name, logo_url, address, city, province, postal_code, phone, email, vat_number, website, opening_hours, facebook_url, instagram_url, linkedin_url"
      )
      .eq("id", updatedDealerId)
      .maybeSingle<DealerProfile>();

    if (!reloadError && dealerAfterSave) {
      setForm((prev) => ({
        ...prev,
        name: dealerAfterSave.name ?? "",
        legal_name: dealerAfterSave.legal_name ?? "",
        logo_url: dealerAfterSave.logo_url ?? "",
        address: dealerAfterSave.address ?? "",
        city: dealerAfterSave.city ?? "",
        province: dealerAfterSave.province ?? "",
        zip_code: dealerAfterSave.postal_code ?? "",
        phone: dealerAfterSave.phone ?? "",
        email: dealerAfterSave.email ?? "",
        vat_number: dealerAfterSave.vat_number ?? "",
        website: dealerAfterSave.website ?? "",
        opening_hours: dealerAfterSave.opening_hours ?? "",
        facebook: dealerAfterSave.facebook_url ?? "",
        instagram: dealerAfterSave.instagram_url ?? "",
        linkedin: dealerAfterSave.linkedin_url ?? "",
      }));
    }

    setStatusMessage("Profilo concessionaria aggiornato con successo.");
    setStatusType("success");
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Profilo concessionaria</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Impostazioni SaaS multi-concessionaria</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Gestisci il profilo pubblico della tua concessionaria: logo, ragione sociale, contatti, indirizzo,
            orari e social mostrati nel marketplace.
          </p>
        </section>

        {statusMessage ? (
          <div
            className={`rounded-3xl border px-5 py-4 text-sm ${
              statusType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {loading ? (
            <p className="text-sm text-slate-600">Caricamento profilo...</p>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome concessionaria" value={form.name} onChange={(value) => setForm((s) => ({ ...s, name: value }))} required />
                  <Field label="Ragione sociale" value={form.legal_name} onChange={(value) => setForm((s) => ({ ...s, legal_name: value }))} />
                  <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((s) => ({ ...s, email: value }))} />
                  <Field label="Telefono" value={form.phone} onChange={(value) => setForm((s) => ({ ...s, phone: value }))} />
                  <Field label="Partita IVA" value={form.vat_number} onChange={(value) => setForm((s) => ({ ...s, vat_number: value }))} />
                  <Field label="Sito web" value={form.website} onChange={(value) => setForm((s) => ({ ...s, website: value }))} />
                </div>

                <Field label="Logo URL" value={form.logo_url} onChange={(value) => setForm((s) => ({ ...s, logo_url: value }))} />

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Indirizzo" value={form.address} onChange={(value) => setForm((s) => ({ ...s, address: value }))} />
                  <Field label="Città" value={form.city} onChange={(value) => setForm((s) => ({ ...s, city: value }))} />
                  <Field label="Provincia" value={form.province} onChange={(value) => setForm((s) => ({ ...s, province: value }))} />
                  <Field label="CAP" value={form.zip_code} onChange={(value) => setForm((s) => ({ ...s, zip_code: value }))} />
                </div>

                <TextArea label="Descrizione" rows={5} value={form.description} onChange={(value) => setForm((s) => ({ ...s, description: value }))} />
                <TextArea label="Orari" rows={4} value={form.opening_hours} onChange={(value) => setForm((s) => ({ ...s, opening_hours: value }))} placeholder="Lun-Ven 09:00-13:00 / 15:00-19:00" />
              </div>

              <aside className="space-y-5 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Social</p>
                <Field label="Facebook" value={form.facebook} onChange={(value) => setForm((s) => ({ ...s, facebook: value }))} />
                <Field label="Instagram" value={form.instagram} onChange={(value) => setForm((s) => ({ ...s, instagram: value }))} />
                <Field label="LinkedIn" value={form.linkedin} onChange={(value) => setForm((s) => ({ ...s, linkedin: value }))} />
                <Field label="YouTube" value={form.youtube} onChange={(value) => setForm((s) => ({ ...s, youtube: value }))} />
                <Field label="TikTok" value={form.tiktok} onChange={(value) => setForm((s) => ({ ...s, tiktok: value }))} />

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Anteprima logo</p>
                  <div className="mt-3 h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                    {form.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.logo_url} alt={form.name || "Logo concessionaria"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">DP</div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvataggio..." : "Salva profilo"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}{required ? " *" : ""}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
