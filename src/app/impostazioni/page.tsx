"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SettingsState = {
  loading: boolean;
  email: string | null;
  role: string | null;
  dealerLabel: string | null;
  supabaseStatus: "attivo" | "non disponibile";
  systemMessage: string | null;
};

function displayValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "Non disponibile";
}

export default function ImpostazioniPage() {
  const [state, setState] = useState<SettingsState>({
    loading: true,
    email: null,
    role: null,
    dealerLabel: null,
    supabaseStatus: "non disponibile",
    systemMessage: null,
  });

  const environment = useMemo(
    () => process.env.NEXT_PUBLIC_APP_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "Non disponibile",
    []
  );

  const buildVersion = useMemo(() => process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_BUILD_ID || "Non disponibile", []);

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
          (typeof user?.user_metadata?.profile === "string" && user.user_metadata.profile) ||
          null;

        const dealerId =
          (typeof user?.app_metadata?.dealer_id === "string" && user.app_metadata.dealer_id) ||
          (typeof user?.user_metadata?.dealer_id === "string" && user.user_metadata.dealer_id) ||
          null;

        let dealerLabel: string | null = dealerId;

        if (dealerId) {
          const { data: dealerData, error: dealerError } = await supabase
            .from("dealers")
            .select("id, name")
            .eq("id", dealerId)
            .maybeSingle<{ id: string; name: string | null }>();

          if (!dealerError && dealerData) {
            dealerLabel = dealerData.name?.trim() ? `${dealerData.name} (${dealerData.id})` : dealerData.id;
          }
        } else if (user?.id) {
          const { data: dealerData, error: dealerError } = await supabase
            .from("dealers")
            .select("id, name")
            .eq("user_id", user.id)
            .maybeSingle<{ id: string; name: string | null }>();

          if (!dealerError && dealerData) {
            dealerLabel = dealerData.name?.trim() ? `${dealerData.name} (${dealerData.id})` : dealerData.id;
          }
        }

        const { error: pingError } = await supabase.from("dealers").select("id").limit(1);

        if (!mounted) return;

        setState({
          loading: false,
          email: user?.email ?? null,
          role: userRole,
          dealerLabel,
          supabaseStatus: pingError ? "non disponibile" : "attivo",
          systemMessage: pingError ? pingError.message || "Connessione Supabase non disponibile." : null,
        });
      } catch (error) {
        if (!mounted) return;
        setState((current) => ({
          ...current,
          loading: false,
          supabaseStatus: "non disponibile",
          systemMessage: error instanceof Error ? error.message : "Errore nel caricamento impostazioni.",
        }));
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-semibold text-slate-900">Impostazioni</h1>
          <p className="mt-3 text-sm text-slate-600">Pagina impostazioni account e piattaforma in sola lettura.</p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Account</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Email utente autenticato</dt>
              <dd className="mt-1 text-slate-900">{state.loading ? "Caricamento..." : displayValue(state.email)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Ruolo/Profilo</dt>
              <dd className="mt-1 text-slate-900">{state.loading ? "Caricamento..." : displayValue(state.role)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
              <dt className="font-medium text-slate-500">Dealer associato</dt>
              <dd className="mt-1 text-slate-900">{state.loading ? "Caricamento..." : displayValue(state.dealerLabel)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Preferenze piattaforma</h2>
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
              <dt className="font-medium text-slate-500">Timezone</dt>
              <dd className="mt-1 text-slate-900">Europe/Rome</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Sicurezza</h2>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Gestione password tramite Supabase/Auth.
          </div>
          <button
            type="button"
            disabled
            className="mt-4 inline-flex cursor-not-allowed items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
          >
            Modifica password (in preparazione)
          </button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Sistema</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Ambiente corrente</dt>
              <dd className="mt-1 text-slate-900">{displayValue(environment)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Versione/Build</dt>
              <dd className="mt-1 text-slate-900">{displayValue(buildVersion)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Stato collegamento Supabase</dt>
              <dd className={`mt-1 font-semibold ${state.supabaseStatus === "attivo" ? "text-emerald-700" : "text-red-700"}`}>
                {state.loading ? "Verifica in corso..." : state.supabaseStatus}
              </dd>
            </div>
          </dl>

          {state.systemMessage ? (
            <p className="mt-4 text-sm text-red-700">{state.systemMessage}</p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm sm:p-8">
          Questa sezione sara ampliata con notifiche, permessi utente e preferenze operative.
        </section>
      </div>
    </main>
  );
}
