"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";

type SettingsState = {
  loading: boolean;
  email: string | null;
  role: string | null;
  dealerLabel: string | null;
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
  const [state, setState] = useState<SettingsState>({
    loading: true,
    email: null,
    role: null,
    dealerLabel: null,
    errorMessage: null,
  });

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

        let dealerLabel: string | null = null;

        if (user?.id) {
          const dealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
            activeDealerId: getActiveDealerId(),
          });

          if (dealerId) {
            const { data: dealerData, error: dealerError } = await supabase
              .from("dealers")
              .select("id, name")
              .eq("id", dealerId)
              .maybeSingle<{ id: string; name: string | null }>();

            if (!dealerError && dealerData) {
              dealerLabel = dealerData.name?.trim() ? dealerData.name : dealerData.id;
            }
          }
        }

        if (!mounted) return;

        setState({
          loading: false,
          email: user?.email ?? null,
          role: userRole,
          dealerLabel,
          errorMessage: null,
        });
      } catch (error) {
        if (!mounted) return;
        setState((current) => ({
          ...current,
          loading: false,
          errorMessage: error instanceof Error ? error.message : "Errore nel caricamento impostazioni.",
        }));
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DealerDashboardShell title="Impostazioni" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-semibold text-slate-900">Impostazioni</h1>
          <p className="mt-3 text-sm text-slate-600">Dati del tuo account e della concessionaria.</p>
        </section>

        {state.errorMessage ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
            {state.errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Account</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Email utente autenticato</dt>
              <dd className="mt-1 text-slate-900">{state.loading ? "Caricamento..." : displayValue(state.email)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-medium text-slate-500">Ruolo/Profilo</dt>
              <dd className="mt-1 text-slate-900">{state.loading ? "Caricamento..." : displayValue(humanizeRole(state.role))}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
              <dt className="font-medium text-slate-500">Concessionaria</dt>
              <dd className="mt-1 text-slate-900">{state.loading ? "Caricamento..." : displayValue(state.dealerLabel)}</dd>
            </div>
          </dl>
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
