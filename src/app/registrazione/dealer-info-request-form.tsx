"use client";

import { useState } from "react";

type FormState = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
};

const initialState: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  message: "",
};

function getFieldClass(missing: boolean) {
  return `h-11 w-full rounded-2xl border px-4 text-sm text-slate-900 outline-none transition ${
    missing ? "border-red-300 bg-red-50 focus:border-red-400" : "border-slate-200 bg-slate-50 focus:border-cyan-500 focus:bg-white"
  }`;
}

export default function DealerInfoRequestForm() {
  const [values, setValues] = useState<FormState>(initialState);
  const [websiteTrap, setWebsiteTrap] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const companyName = values.companyName.trim();
  const contactName = values.contactName.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();
  const message = values.message.trim();

  const missingCompanyName = companyName.length === 0;
  const missingContactName = contactName.length === 0;
  const missingEmail = email.length === 0;
  const missingPhone = phone.length === 0;
  const missingMessage = message.length === 0;

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrorMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (missingCompanyName || missingContactName || missingEmail || missingPhone || missingMessage) {
      setShowErrors(true);
      setErrorMessage("Compila tutti i campi obbligatori.");
      setSuccessMessage(null);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/contact/dealer-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          email,
          phone,
          message,
          websiteTrap,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        setErrorMessage(payload?.error || "Invio non riuscito. Riprova tra poco.");
        return;
      }

      setSuccessMessage(payload?.message || "Richiesta inviata. Ti risponderemo al piu presto.");
      setValues(initialState);
      setShowErrors(false);
    } catch {
      setErrorMessage("Invio non riuscito. Controlla la connessione e riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
      <h2 className="text-2xl font-semibold text-slate-900">Hai bisogno di informazioni?</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        Scrivici: il nostro team ti ricontatta per aiutarti a scegliere il piano piu adatto alla tua concessionaria.
      </p>

      {successMessage ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Concessionaria *</span>
            <input
              type="text"
              value={values.companyName}
              onChange={handleChange("companyName")}
              className={getFieldClass(showErrors && missingCompanyName)}
              autoComplete="organization"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Referente *</span>
            <input
              type="text"
              value={values.contactName}
              onChange={handleChange("contactName")}
              className={getFieldClass(showErrors && missingContactName)}
              autoComplete="name"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Email *</span>
            <input
              type="email"
              value={values.email}
              onChange={handleChange("email")}
              className={getFieldClass(showErrors && missingEmail)}
              autoComplete="email"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Telefono *</span>
            <input
              type="tel"
              value={values.phone}
              onChange={handleChange("phone")}
              className={getFieldClass(showErrors && missingPhone)}
              autoComplete="tel"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Messaggio *</span>
          <textarea
            rows={5}
            value={values.message}
            onChange={handleChange("message")}
            placeholder="Scrivi la tua richiesta"
            className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition ${
              showErrors && missingMessage
                ? "border-red-300 bg-red-50 focus:border-red-400"
                : "border-slate-200 bg-slate-50 focus:border-cyan-500 focus:bg-white"
            }`}
          />
        </label>

        {/* Honeypot: hidden from users, filled only by bots. */}
        <div className="hidden" aria-hidden="true">
          <label>
            Sito web
            <input type="text" tabIndex={-1} value={websiteTrap} onChange={(event) => setWebsiteTrap(event.target.value)} autoComplete="off" />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            Inviando dichiari di aver letto l&apos;
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-cyan-700 underline">
              informativa sulla privacy
            </a>
            .
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-2xl bg-cyan-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Invio in corso..." : "Invia richiesta"}
          </button>
        </div>
      </form>
    </div>
  );
}
