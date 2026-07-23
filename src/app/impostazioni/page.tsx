"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
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
  whatsapp_phone: string | null;
  email: string | null;
  vat_number: string | null;
  website: string | null;
  description: string | null;
  opening_hours: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
};

const DEALER_SELECT_COLUMNS =
  "id, name, legal_name, logo_url, address, city, province, postal_code, phone, whatsapp_phone, email, vat_number, website, description, opening_hours, facebook_url, instagram_url, linkedin_url";

type DealerFormState = {
  name: string;
  legal_name: string;
  logo_url: string;
  address: string;
  city: string;
  province: string;
  zip_code: string;
  phone: string;
  whatsapp: string;
  email: string;
  vat_number: string;
  website: string;
  description: string;
  opening_hours: string;
  facebook: string;
  instagram: string;
  linkedin: string;
};

const EMPTY_DEALER_FORM: DealerFormState = {
  name: "",
  legal_name: "",
  logo_url: "",
  address: "",
  city: "",
  province: "",
  zip_code: "",
  phone: "",
  whatsapp: "",
  email: "",
  vat_number: "",
  website: "",
  description: "",
  opening_hours: "",
  facebook: "",
  instagram: "",
  linkedin: "",
};

function mapDealerToForm(dealer: DealerProfile): DealerFormState {
  return {
    name: dealer.name ?? "",
    legal_name: dealer.legal_name ?? "",
    logo_url: dealer.logo_url ?? "",
    address: dealer.address ?? "",
    city: dealer.city ?? "",
    province: dealer.province ?? "",
    zip_code: dealer.postal_code ?? "",
    phone: dealer.phone ?? "",
    whatsapp: dealer.whatsapp_phone ?? "",
    email: dealer.email ?? "",
    vat_number: dealer.vat_number ?? "",
    website: dealer.website ?? "",
    description: dealer.description ?? "",
    opening_hours: dealer.opening_hours ?? "",
    facebook: dealer.facebook_url ?? "",
    instagram: dealer.instagram_url ?? "",
    linkedin: dealer.linkedin_url ?? "",
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type AccountState = {
  loading: boolean;
  email: string | null;
  role: string | null;
  errorMessage: string | null;
};

function displayValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "Non disponibile";
}

function humanizeRole(role: string | null) {
  if (!role) return null;
  return role
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function ImpostazioniPage() {
  const [dealerName, setDealerName] = useState("Dealer Console");
  const [account, setAccount] = useState<AccountState>({ loading: true, email: null, role: null, errorMessage: null });

  const [dealerId, setDealerId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<DealerFormState>(EMPTY_DEALER_FORM);
  const [dealerLoading, setDealerLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw new Error(userError.message || "Impossibile leggere l'utente autenticato.");
        }

        const userRole =
          (typeof user?.app_metadata?.role === "string" && user.app_metadata.role) ||
          (typeof user?.user_metadata?.role === "string" && user.user_metadata.role) ||
          null;

        if (!mounted) return;
        setAccount({ loading: false, email: user?.email ?? null, role: userRole, errorMessage: null });

        if (!user?.id) {
          setDealerLoading(false);
          return;
        }

        setUserId(user.id);

        const resolvedDealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
          activeDealerId: getActiveDealerId(),
        });

        if (!mounted) return;

        if (!resolvedDealerId) {
          setDealerLoading(false);
          setStatusMessage("Nessuna concessionaria associata all'account.");
          setStatusType("error");
          return;
        }

        setDealerId(resolvedDealerId);

        const { data: dealer, error: dealerError } = await supabase
          .from("dealers")
          .select(DEALER_SELECT_COLUMNS)
          .eq("id", resolvedDealerId)
          .maybeSingle<DealerProfile>();

        if (!mounted) return;

        setDealerLoading(false);

        if (dealerError || !dealer) {
          setStatusMessage(dealerError?.message || "Impossibile caricare i dati della concessionaria.");
          setStatusType("error");
          return;
        }

        setForm(mapDealerToForm(dealer));
        const resolvedName = String(dealer.name ?? dealer.legal_name ?? "").trim();
        if (resolvedName) {
          setDealerName(resolvedName);
        }
      } catch (error) {
        if (!mounted) return;
        setAccount((current) => ({
          ...current,
          loading: false,
          errorMessage: error instanceof Error ? error.message : "Errore nel caricamento impostazioni.",
        }));
        setDealerLoading(false);
      }
    };

    void loadSettings();

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
      whatsapp_phone: nullable(form.whatsapp),
      email: nullable(form.email),
      vat_number: nullable(form.vat_number),
      website: nullable(form.website),
      description: nullable(form.description),
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
      setStatusMessage(details || "Errore nel salvataggio dei dati concessionaria.");
      setStatusType("error");
      return;
    }

    if (!updatedDealerId) {
      setStatusMessage("Nessun profilo aggiornato. Verifica associazione account-concessionaria e permessi.");
      setStatusType("error");
      return;
    }

    const { data: dealerAfterSave, error: reloadError } = await supabase
      .from("dealers")
      .select(DEALER_SELECT_COLUMNS)
      .eq("id", updatedDealerId)
      .maybeSingle<DealerProfile>();

    if (!reloadError && dealerAfterSave) {
      setForm(mapDealerToForm(dealerAfterSave));
      const resolvedName = String(dealerAfterSave.name ?? dealerAfterSave.legal_name ?? "").trim();
      if (resolvedName) {
        setDealerName(resolvedName);
      }
    }

    setStatusMessage("Dati concessionaria aggiornati con successo.");
    setStatusType("success");
  };

  return (
    <DealerDashboardShell title="Impostazioni" dealerName={dealerName} avatarInitials="DC" unreadNotifications={0}>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-semibold text-slate-900">Impostazioni</h1>
          <p className="mt-3 text-sm text-slate-600">Dati del tuo account e della concessionaria.</p>
        </section>

        {account.errorMessage ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
            {account.errorMessage}
          </section>
        ) : null}

        {statusMessage ? (
          <div
            className={`rounded-3xl border px-5 py-4 text-sm shadow-sm ${
              statusType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Account</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Email utente autenticato</dt>
              <dd className="mt-1 text-slate-900">{account.loading ? "Caricamento..." : displayValue(account.email)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Ruolo/Profilo</dt>
              <dd className="mt-1 text-slate-900">{account.loading ? "Caricamento..." : displayValue(humanizeRole(account.role))}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Dati concessionaria</h2>
          <p className="mt-2 text-sm text-slate-600">
            Questi dati sono mostrati agli utenti nel Marketplace pubblico (scheda concessionaria e schede veicolo).
          </p>

          {dealerLoading ? (
            <p className="mt-4 text-sm text-slate-600">Caricamento dati concessionaria...</p>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome concessionaria" value={form.name} onChange={(value) => setForm((s) => ({ ...s, name: value }))} required />
                <Field label="Ragione sociale" value={form.legal_name} onChange={(value) => setForm((s) => ({ ...s, legal_name: value }))} />
                <Field label="Partita IVA" value={form.vat_number} onChange={(value) => setForm((s) => ({ ...s, vat_number: value }))} />
                <Field label="Logo URL" value={form.logo_url} onChange={(value) => setForm((s) => ({ ...s, logo_url: value }))} />
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Contatti pubblici</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Telefono fisso" value={form.phone} onChange={(value) => setForm((s) => ({ ...s, phone: value }))} />
                  <Field label="Cellulare / WhatsApp" value={form.whatsapp} onChange={(value) => setForm((s) => ({ ...s, whatsapp: value }))} />
                  <Field label="Email commerciale" type="email" value={form.email} onChange={(value) => setForm((s) => ({ ...s, email: value }))} />
                  <Field label="Sito web" value={form.website} onChange={(value) => setForm((s) => ({ ...s, website: value }))} />
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  Il numero &ldquo;Cellulare / WhatsApp&rdquo; è quello usato dal bottone WhatsApp sulla scheda veicolo: se resta vuoto, il
                  bottone appare disattivato.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Indirizzo" value={form.address} onChange={(value) => setForm((s) => ({ ...s, address: value }))} />
                <Field label="Città" value={form.city} onChange={(value) => setForm((s) => ({ ...s, city: value }))} />
                <Field label="Provincia" value={form.province} onChange={(value) => setForm((s) => ({ ...s, province: value }))} />
                <Field label="CAP" value={form.zip_code} onChange={(value) => setForm((s) => ({ ...s, zip_code: value }))} />
              </div>

              <TextArea label="Descrizione" rows={4} value={form.description} onChange={(value) => setForm((s) => ({ ...s, description: value }))} />
              <TextArea
                label="Orari"
                rows={3}
                value={form.opening_hours}
                onChange={(value) => setForm((s) => ({ ...s, opening_hours: value }))}
                placeholder="Lun-Ven 09:00-13:00 / 15:00-19:00"
              />

              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Social</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Facebook" value={form.facebook} onChange={(value) => setForm((s) => ({ ...s, facebook: value }))} />
                  <Field label="Instagram" value={form.instagram} onChange={(value) => setForm((s) => ({ ...s, instagram: value }))} />
                  <Field label="LinkedIn" value={form.linkedin} onChange={(value) => setForm((s) => ({ ...s, linkedin: value }))} />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || dealerLoading}
                  className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Salvataggio..." : "Salva dati concessionaria"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Piattaforma</h2>
          <p className="mt-2 text-sm text-slate-600">Impostazioni fisse, uguali per tutte le concessionarie.</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Lingua</dt>
              <dd className="mt-1 text-slate-900">Italiano</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Valuta</dt>
              <dd className="mt-1 text-slate-900">EUR</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Fuso orario</dt>
              <dd className="mt-1 text-slate-900">Europe/Rome</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Sicurezza</h2>
          <p className="mt-2 text-sm text-slate-600">Cambia la password del tuo account.</p>
          <Link
            href="/reset-password"
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Modifica password
          </Link>
        </section>
      </div>
    </DealerDashboardShell>
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
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? " *" : ""}
      </span>
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
