"use client";

import { useEffect, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type InfoRequestRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  created_at: string;
};

type PageState = {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  requests: InfoRequestRow[];
};

function displayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "-";
}

function formatDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "-";

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function AdminInfoRequestsPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    requests: [],
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        setState({ loading: false, authorized: false, error: userError?.message || "Utente non autenticato.", requests: [] });
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
        setState({ loading: false, authorized: false, error: null, requests: [] });
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
          requests: [],
        });
        return;
      }

      const response = await fetch("/api/admin/info-requests", {
        method: "GET",
        cache: "no-store",
        headers: { authorization: `Bearer ${session.access_token}` },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        requests?: InfoRequestRow[];
      };

      if (!mounted) return;

      if (!response.ok) {
        if (response.status === 403) {
          setState({ loading: false, authorized: false, error: null, requests: [] });
          return;
        }

        setState({
          loading: false,
          authorized: true,
          error: payload.error || "Impossibile caricare le richieste informazioni.",
          requests: [],
        });
        return;
      }

      setState({
        loading: false,
        authorized: true,
        error: null,
        requests: payload.requests ?? [],
      });
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (state.loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Caricamento richieste informazioni...
        </div>
      </main>
    );
  }

  if (!state.authorized) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-red-900">Accesso negato</h1>
          <p className="mt-3 text-sm text-red-800">
            Questa sezione e disponibile solo per account admin o platform owner.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Admin</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Richieste informazioni</h1>
          <p className="mt-3 text-sm text-slate-600">
            Richieste inviate dalle concessionarie dalla pagina di registrazione:{" "}
            <span className="font-semibold text-slate-900">{state.requests.length}</span>
          </p>
        </section>

        {state.error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm">
            {state.error}
          </section>
        ) : null}

        {state.requests.length === 0 && !state.error ? (
          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600 shadow-sm">
            Nessuna richiesta informazioni ricevuta.
          </section>
        ) : (
          <section className="space-y-4">
            {state.requests.map((item) => (
              <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{displayText(item.company_name)}</h2>
                    <p className="mt-1 text-sm text-slate-600">{displayText(item.contact_name)}</p>
                  </div>
                  <p className="text-xs font-medium text-slate-500">{formatDate(item.created_at)}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <a href={`mailto:${item.email}`} className="font-medium text-blue-700 underline">
                    {displayText(item.email)}
                  </a>
                  <span className="text-slate-600">{displayText(item.phone)}</span>
                </div>

                <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  {item.message}
                </p>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
