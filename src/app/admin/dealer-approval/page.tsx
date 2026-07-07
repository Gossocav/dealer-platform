"use client";

import { useEffect, useMemo, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type DealerApprovalRow = {
  id: string;
  legal_name: string | null;
  name: string | null;
  vat_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
};

type PageState = {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  dealers: DealerApprovalRow[];
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

async function fetchApprovalList(token: string) {
  const response = await fetch("/api/admin/dealer-approval", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    dealers?: DealerApprovalRow[];
  };

  return { response, payload };
}

export default function DealerApprovalPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    dealers: [],
  });
  const [busyDealerId, setBusyDealerId] = useState<string | null>(null);

  const pendingCount = useMemo(() => state.dealers.length, [state.dealers]);

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
        setState({ loading: false, authorized: false, error: userError?.message || "Utente non autenticato.", dealers: [] });
        return;
      }

      const role = resolveUserRoleFromMetadata(user);
      let canAccess = isPlatformAdminRole(role);

      if (!canAccess) {
        const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
        if (!profile.error) {
          canAccess = isPlatformAdminRole(profile.data?.role);
        }
      }

      if (!canAccess) {
        setState({ loading: false, authorized: false, error: null, dealers: [] });
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
          dealers: [],
        });
        return;
      }

      const { response, payload } = await fetchApprovalList(session.access_token);

      if (!mounted) return;

      if (!response.ok) {
        if (response.status === 403) {
          setState({ loading: false, authorized: false, error: null, dealers: [] });
          return;
        }

        setState({
          loading: false,
          authorized: true,
          error: payload.error || "Impossibile caricare i dealer in verifica.",
          dealers: [],
        });
        return;
      }

      setState({
        loading: false,
        authorized: true,
        error: null,
        dealers: payload.dealers ?? [],
      });
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const submitAction = async (dealerId: string, action: "approve" | "reject") => {
    setBusyDealerId(dealerId);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setState((current) => ({
        ...current,
        error: sessionError?.message || "Sessione non valida.",
      }));
      setBusyDealerId(null);
      return;
    }

    const response = await fetch("/api/admin/dealer-approval", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ dealerId, action }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setState((current) => ({
        ...current,
        error: payload.error || "Aggiornamento stato non riuscito.",
      }));
      setBusyDealerId(null);
      return;
    }

    setState((current) => ({
      ...current,
      error: null,
      dealers: current.dealers.filter((dealer) => dealer.id !== dealerId),
    }));

    setBusyDealerId(null);
  };

  if (state.loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Caricamento richieste in verifica...
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
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Approvazione Dealer</h1>
          <p className="mt-3 text-sm text-slate-600">
            Richieste in verifica: <span className="font-semibold text-slate-900">{pendingCount}</span>
          </p>
        </section>

        {state.error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm">
            {state.error}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-3">Ragione sociale</th>
                  <th className="px-4 py-3">Partita IVA</th>
                  <th className="px-4 py-3">Referente</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Telefono</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3">Data registrazione</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.dealers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={8}>
                      Nessun dealer in stato pending_review.
                    </td>
                  </tr>
                ) : (
                  state.dealers.map((dealer) => {
                    const label = displayText(dealer.legal_name) !== "-" ? dealer.legal_name : dealer.name;
                    const busy = busyDealerId === dealer.id;

                    return (
                      <tr key={dealer.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{displayText(label)}</td>
                        <td className="px-4 py-3 text-slate-700">{displayText(dealer.vat_number)}</td>
                        <td className="px-4 py-3 text-slate-700">{displayText(dealer.contact_person)}</td>
                        <td className="px-4 py-3 text-slate-700">{displayText(dealer.email)}</td>
                        <td className="px-4 py-3 text-slate-700">{displayText(dealer.phone)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            {displayText(dealer.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(dealer.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void submitAction(dealer.id, "approve")}
                              disabled={busy}
                              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Approva
                            </button>
                            <button
                              type="button"
                              onClick={() => void submitAction(dealer.id, "reject")}
                              disabled={busy}
                              className="inline-flex items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Rifiuta
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
