"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type AdminStats = {
  dealersRegistered: number;
  dealersPendingApproval: number;
  dealersApproved: number;
  vehiclesPublished: number;
  leadsReceived: number;
  usersRegistered: number;
};

type AdminOverviewState = {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  stats: AdminStats;
};

const FALLBACK_STATS: AdminStats = {
  dealersRegistered: 0,
  dealersPendingApproval: 0,
  dealersApproved: 0,
  vehiclesPublished: 0,
  leadsReceived: 0,
  usersRegistered: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT").format(value);
}

function toSafeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default function AdminHomePage() {
  const router = useRouter();
  const [state, setState] = useState<AdminOverviewState>({
    loading: true,
    authorized: false,
    error: null,
    stats: FALLBACK_STATS,
  });

  const cards = useMemo(
    () => [
      {
        label: "Concessionarie registrate",
        value: state.stats.dealersRegistered,
      },
      {
        label: "In attesa approvazione",
        value: state.stats.dealersPendingApproval,
      },
      {
        label: "Concessionarie approvate",
        value: state.stats.dealersApproved,
      },
      {
        label: "Veicoli pubblicati",
        value: state.stats.vehiclesPublished,
      },
      {
        label: "Lead ricevuti",
        value: state.stats.leadsReceived,
      },
      {
        label: "Utenti registrati",
        value: state.stats.usersRegistered,
      },
    ],
    [state.stats]
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setState((current) => ({ ...current, loading: true, error: null }));

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        router.replace("/admin/login");
        return;
      }

      let canAccess = isPlatformAdminRole(resolveUserRoleFromMetadata(user));
      if (!canAccess) {
        const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
        if (!profile.error) {
          canAccess = isPlatformAdminRole(profile.data?.role);
        }
      }

      if (!mounted) return;

      if (!canAccess) {
        router.replace("/login");
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError || !session?.access_token) {
        setState({
          loading: false,
          authorized: true,
          error: sessionError?.message || "Sessione non valida.",
          stats: FALLBACK_STATS,
        });
        return;
      }

      const response = await fetch("/api/admin/overview", {
        method: "GET",
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        stats?: Partial<AdminStats>;
      };

      if (!mounted) return;

      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }

        if (response.status === 403) {
          router.replace("/login");
          return;
        }

        setState({
          loading: false,
          authorized: true,
          error: payload.error || "Impossibile caricare le metriche amministrative.",
          stats: FALLBACK_STATS,
        });
        return;
      }

      const stats = payload.stats ?? {};

      setState({
        loading: false,
        authorized: true,
        error: null,
        stats: {
          dealersRegistered: toSafeNumber(stats.dealersRegistered),
          dealersPendingApproval: toSafeNumber(stats.dealersPendingApproval),
          dealersApproved: toSafeNumber(stats.dealersApproved),
          vehiclesPublished: toSafeNumber(stats.vehiclesPublished),
          leadsReceived: toSafeNumber(stats.leadsReceived),
          usersRegistered: toSafeNumber(stats.usersRegistered),
        },
      });
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  if (state.loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Caricamento dashboard amministrativa...
        </div>
      </main>
    );
  }

  if (!state.authorized) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-800 shadow-sm">
          Accesso negato.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Platform Owner</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Dashboard Piattaforma</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Area amministrativa professionale separata dalla console concessionario.
          </p>
        </section>

        {state.error ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            {state.error}
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">KPI</p>
              <h2 className="mt-2 text-base font-semibold text-slate-900">{card.label}</h2>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{formatNumber(card.value)}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Azioni rapide</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/dealer-approval"
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Approva dealer
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Vai al marketplace
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
