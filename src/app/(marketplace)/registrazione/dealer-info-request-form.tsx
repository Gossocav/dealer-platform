"use client";

import { useState } from "react";
import { trackLead } from "@/lib/measurement-events";

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
  return `h-11 w-full rounded-2xl border px-4 text-sm outline-none transition ${
    missing
      ? "border-red-400/50 bg-red-500/10 focus:border-red-400"
      : "border-white/10 bg-white/[0.04] focus:border-blue-400/50 focus:bg-white/[0.07]"
  }`;
}

// Il colore del testo digitato va imposto in linea: globals.css ha una regola
// NON incapsulata `input, select, textarea { color: rgb(15 23 42) }` per i
// moduli chiari del pannello, e una regola non incapsulata batte le utility di
// Tailwind a prescindere dalla specificita'. Con la sola classe il testo
// resterebbe nero su fondo scuro, cioe' invisibile.
const FIELD_TEXT_STYLE = { color: "#f8fafc" } as const;

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

      // Vedi la nota nel modulo della scheda veicolo: solo a richiesta
      // arrivata, e senza nessun dato della persona.
      trackLead("info_concessionaria");

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
    <div>
      <h2 className="text-2xl font-semibold text-white">Hai bisogno di informazioni?</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Scrivici: il nostro team ti ricontatta per aiutarti a scegliere il piano piu adatto alla tua concessionaria.
      </p>

      {successMessage ? (
        <div className="mt-6 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-200">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Concessionaria *</span>
            <input
              type="text"
              value={values.companyName}
              onChange={handleChange("companyName")}
              style={FIELD_TEXT_STYLE}
              className={getFieldClass(showErrors && missingCompanyName)}
              autoComplete="organization"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Referente *</span>
            <input
              type="text"
              value={values.contactName}
              onChange={handleChange("contactName")}
              style={FIELD_TEXT_STYLE}
              className={getFieldClass(showErrors && missingContactName)}
              autoComplete="name"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Email *</span>
            <input
              type="email"
              value={values.email}
              onChange={handleChange("email")}
              style={FIELD_TEXT_STYLE}
              className={getFieldClass(showErrors && missingEmail)}
              autoComplete="email"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Telefono *</span>
            <input
              type="tel"
              value={values.phone}
              onChange={handleChange("phone")}
              style={FIELD_TEXT_STYLE}
              className={getFieldClass(showErrors && missingPhone)}
              autoComplete="tel"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Messaggio *</span>
          <textarea
            rows={5}
            value={values.message}
            onChange={handleChange("message")}
            placeholder="Scrivi la tua richiesta"
            style={FIELD_TEXT_STYLE}
            className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
              showErrors && missingMessage
                ? "border-red-400/50 bg-red-500/10 focus:border-red-400"
                : "border-white/10 bg-white/[0.04] focus:border-blue-400/50 focus:bg-white/[0.07]"
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
          <p className="text-xs leading-5 text-slate-400">
            Inviando dichiari di aver letto l&apos;
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-cyan-300 underline">
              informativa sulla privacy
            </a>
            .
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Invio in corso..." : "Invia richiesta"}
          </button>
        </div>
      </form>
    </div>
  );
}
