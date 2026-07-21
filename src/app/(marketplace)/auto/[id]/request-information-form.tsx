"use client";

import { FormEvent, useMemo, useState } from "react";
import { ITALIAN_CITIES_BY_PROVINCE, ITALIAN_PROVINCES, type ItalianProvinceCode } from "@/lib/italian-locations";

type RequestInformationFormProps = {
  vehicleId: string;
  vehicleLabel: string;
};

export default function RequestInformationForm({ vehicleId, vehicleLabel }: RequestInformationFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [province, setProvince] = useState<ItalianProvinceCode | "">("");
  const [city, setCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cityOptions = useMemo(() => {
    if (!province) return [] as string[];
    return ITALIAN_CITIES_BY_PROVINCE[province] ?? [];
  }, [province]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedAddress = address.trim();
    const normalizedZipCode = zipCode.trim();
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
      address: normalizedAddress || null,
      province: province || null,
      city: city || null,
      zip_code: normalizedZipCode || null,
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
    setAddress("");
    setProvince("");
    setCity("");
    setZipCode("");
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
        <Field label="Indirizzo" value={address} onChange={setAddress} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Provincia</span>
            <select
              value={province}
              onChange={(event) => {
                const nextValue = event.target.value as ItalianProvinceCode | "";
                setProvince(nextValue);
                setCity("");
              }}
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Seleziona provincia</option>
              {ITALIAN_PROVINCES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Città</span>
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              disabled={!province}
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{province ? "Seleziona città" : "Seleziona prima la provincia"}</option>
              {cityOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Field label="CAP" value={zipCode} onChange={setZipCode} />

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
