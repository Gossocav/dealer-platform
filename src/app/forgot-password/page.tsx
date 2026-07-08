"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const FALLBACK_PRODUCTION_APP_URL = "https://dealer-platform-six.vercel.app";

function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

function isLocalhostUrl(value: string | null | undefined) {
  const url = String(value ?? "").trim().toLowerCase();
  return url.includes("localhost") || url.includes("127.0.0.1");
}

function resolveResetRedirectTo() {
  const origin = normalizeBaseUrl(window.location.origin);
  const envPublicAppUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  const productionBaseUrl = envPublicAppUrl && !isLocalhostUrl(envPublicAppUrl)
    ? envPublicAppUrl
    : FALLBACK_PRODUCTION_APP_URL;

  if (process.env.NODE_ENV !== "production" && origin && isLocalhostUrl(origin)) {
    return `${origin}/reset-password`;
  }

  if (origin && !isLocalhostUrl(origin)) {
    return `${origin}/reset-password`;
  }

  return `${productionBaseUrl}/reset-password`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setMessageType(null);

    const redirectTo = resolveResetRedirectTo();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });

    setLoading(false);

    if (error) {
      setMessage(error.message || "Impossibile inviare il link di recupero.");
      setMessageType("error");
      return;
    }

    setMessage("Controlla la tua email per completare il recupero password.");
    setMessageType("success");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.14),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_52%,_#f1f5f9_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <section className="order-2 flex items-center lg:order-1">
          <div className="w-full rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Recupero password</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Recupera password</h1>
              </div>
              <Link href="/login" className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Torna al login
              </Link>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  placeholder="nome@concessionaria.it"
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
                {loading ? "Invio link..." : "Recupera password"}
              </button>
            </form>
          </div>
        </section>

        <section className="order-1 flex flex-col justify-between rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:order-2 lg:px-12 lg:py-14">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950">DP</span>
              <span suppressHydrationWarning>DEALER PLATFORM</span>
            </div>
            <h2 className="mt-8 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">Rientra in sicurezza nel tuo account.</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Ti inviamo un link sicuro per creare una nuova password e tornare a gestire il tuo parco auto senza interrompere il flusso di lavoro.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold text-white">Link protetto</p>
              <p className="mt-2 text-sm text-slate-300">Il recupero password mantiene la stessa esperienza coerente della piattaforma.</p>
            </div>
            <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold text-white">Accesso rapido</p>
              <p className="mt-2 text-sm text-slate-300">Una volta reimpostata la password, torni subito alla pagina di login.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
