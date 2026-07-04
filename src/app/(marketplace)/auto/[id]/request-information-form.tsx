"use client";

import { FormEvent, useState } from "react";

type RequestInformationFormProps = {
  vehicleId: string;
  vehicleLabel: string;
};

export default function RequestInformationForm({ vehicleId, vehicleLabel }: RequestInformationFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedMessage = message.trim();

    if (!normalizedFirstName || !normalizedLastName) {
      setErrorMessage("Nome e cognome sono obbligatori.");
      return;
    }

    if (!normalizedEmail && !normalizedPhone) {
      setErrorMessage("Inserisci almeno email o telefono.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      vehicleId,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      message: normalizedMessage || null,
    };

    const response = await fetch("/api/marketplace/lead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    setLoading(false);

    if (!response.ok) {
      console.error("Lead insert error", result);
      setErrorMessage(result?.error || "Errore durante l'invio della richiesta.");
      return;
    }

    setSuccessMessage(result?.message || "Richiesta inviata correttamente.");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setMessage("");
  };

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
      <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Richiedi informazioni</p>
      <h2 className="mt-3 min-w-0 max-w-full break-words text-2xl font-semibold text-slate-900 [overflow-wrap:anywhere]">{vehicleLabel}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">Compila il form per essere ricontattato dalla concessionaria.</p>

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</div>
      ) : null}

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value={firstName} onChange={setFirstName} required />
          <Field label="Cognome" value={lastName} onChange={setLastName} required />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Telefono" type="tel" value={phone} onChange={setPhone} />

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Messaggio</span>
          <textarea
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="Scrivi la tua richiesta"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Invio in corso..." : "Invia richiesta"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
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
