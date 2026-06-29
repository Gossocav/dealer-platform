"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  vehicleId: string;
  dealerId: string | null;
  vehicleLabel: string;
};

export default function RequestInformationButton({ vehicleId, dealerId, vehicleLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setMessage("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.from("leads").insert([
      {
        vehicle_id: vehicleId,
        dealer_id: dealerId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        message: message.trim(),
        status: "created",
      },
    ]);

    setLoading(false);

    if (error) {
      setErrorMessage(error.message || "Errore durante l'invio della richiesta.");
      return;
    }

    setSuccessMessage("Richiesta inviata correttamente");
    resetForm();
    setTimeout(() => {
      setOpen(false);
      setSuccessMessage(null);
    }, 1200);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
      >
        Richiedi informazioni
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Richiesta informazioni</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900">{vehicleLabel}</h2>
                <p className="mt-2 text-sm text-slate-600">Compila il form e ti ricontatteremo al più presto.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Chiudi
              </button>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{errorMessage}</div>
            ) : null}

            {successMessage ? (
              <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{successMessage}</div>
            ) : null}

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" value={firstName} onChange={setFirstName} required />
                <Field label="Cognome" value={lastName} onChange={setLastName} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefono" value={phone} onChange={setPhone} required />
                <Field label="Email" value={email} onChange={setEmail} type="email" required />
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Messaggio</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  required
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
        </div>
      ) : null}
    </>
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
