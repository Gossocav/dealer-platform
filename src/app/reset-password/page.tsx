"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      setMessage("La password deve contenere almeno 8 caratteri.");
      setMessageType("error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Le password non coincidono.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage(null);
    setMessageType(null);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setMessage(error.message || "Impossibile aggiornare la password.");
      setMessageType("error");
      return;
    }

    setMessage("Password aggiornata con successo. Ora puoi accedere.");
    setMessageType("success");
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Reset password</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">Imposta una nuova password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Inserisci la nuova password per completare il recupero account.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
              Nuova password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Minimo 8 caratteri"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="confirm-password">
              Conferma password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Ripeti la nuova password"
            />
          </div>

          {message ? (
            <div
              className={`rounded-3xl border px-4 py-3 text-sm ${
                messageType === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Aggiornamento..." : "Salva nuova password"}
          </button>
        </form>

        <div className="mt-6">
          <Link href="/login" className="text-sm font-semibold text-blue-600 transition hover:text-blue-700">
            Torna al login
          </Link>
        </div>
      </section>
    </main>
  );
}
