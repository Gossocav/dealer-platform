"use client";

import { FormEvent, useState } from "react";

type RequestInformationFormProps = {
  vehicleId: string;
  vehicleLabel: string;
};

export default function RequestInformationForm({ vehicleId, vehicleLabel }: RequestInformationFormProps) {
  const [customerType, setCustomerType] = useState<"privato" | "azienda" | "">("");
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

    if (!customerType || !normalizedFirstName || !normalizedLastName || !normalizedEmail || !normalizedPhone || !normalizedMessage) {
      setErrorMessage("Tutti i campi sono obbligatori.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      vehicleId,
      customer_type: customerType,
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
    setCustomerType("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setMessage("");
  };

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Richiedi informazioni</p>
      <h2 className="mt-3 min-w-0 max-w-full break-words text-xl font-bold text-white [overflow-wrap:anywhere]">{vehicleLabel}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-400">Compila il form per essere ricontattato dalla concessionaria.</p>

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{successMessage}</div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{errorMessage}</div>
      ) : null}

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div>
          <span className="text-sm font-medium text-slate-300">Tipo cliente *</span>
          <div className="mt-2 flex gap-3">
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition has-[:checked]:border-blue-400/50 has-[:checked]:bg-blue-500/15 has-[:checked]:text-white">
              <input
                type="radio"
                name="customerType"
                value="privato"
                checked={customerType === "privato"}
                onChange={() => setCustomerType("privato")}
                required
                className="sr-only"
              />
              Privato
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition has-[:checked]:border-blue-400/50 has-[:checked]:bg-blue-500/15 has-[:checked]:text-white">
              <input
                type="radio"
                name="customerType"
                value="azienda"
                checked={customerType === "azienda"}
                onChange={() => setCustomerType("azienda")}
                required
                className="sr-only"
              />
              Azienda
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *" value={firstName} onChange={setFirstName} required />
          <Field label="Cognome *" value={lastName} onChange={setLastName} required />
        </div>
        <Field label="Email *" type="email" value={email} onChange={setEmail} required />
        <Field label="Telefono *" type="tel" value={phone} onChange={setPhone} required />

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Messaggio *</span>
          <textarea
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            suppressHydrationWarning
            style={{ color: "#f8fafc" }}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:bg-white/[0.06]"
            placeholder="Scrivi la tua richiesta"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        suppressHydrationWarning
        style={{ color: "#f8fafc" }}
        className="mt-2 w-full rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06]"
      />
    </label>
  );
}
