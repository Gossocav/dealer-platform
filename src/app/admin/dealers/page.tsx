"use client";

import { useEffect, useMemo, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type DealerStatus = "pending_review" | "approved" | "rejected" | "suspended" | "cancelled";
type DealerAction = "approve" | "reject" | "suspend" | "reactivate" | "cancel";

type DealerAdminRow = {
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
  dealers: DealerAdminRow[];
};

const ALL_STATUSES: DealerStatus[] = ["pending_review", "approved", "rejected", "suspended", "cancelled"];

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

function normalizeStatus(value: string | null | undefined): DealerStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "pending_review" || normalized === "approved" || normalized === "rejected" || normalized === "suspended" || normalized === "cancelled") {
    return normalized;
  }

  return null;
}

function getActionsForStatus(status: DealerStatus | null): DealerAction[] {
  if (status === "pending_review") return ["approve", "reject", "cancel"];
  if (status === "approved") return ["suspend", "cancel"];
  if (status === "suspended") return ["reactivate", "cancel"];
  if (status === "rejected") return ["approve", "cancel"];
  return [];
}

function getActionLabel(action: DealerAction) {
  if (action === "approve") return "Approva";
  if (action === "reject") return "Rifiuta";
  if (action === "suspend") return "Sospendi";
  if (action === "reactivate") return "Riattiva";
  return "Disattiva definitivamente";
}

function getActionClass(action: DealerAction) {
  if (action === "approve" || action === "reactivate") {
    return "bg-emerald-600 hover:bg-emerald-700";
  }

  if (action === "suspend") {
    return "bg-amber-600 hover:bg-amber-700";
  }

  if (action === "cancel") {
    return "bg-slate-800 hover:bg-slate-900";
  }

  return "bg-red-600 hover:bg-red-700";
}

function getStatusBadgeClass(status: DealerStatus | null) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "pending_review") return "bg-amber-100 text-amber-800";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  if (status === "suspended") return "bg-orange-100 text-orange-800";
  if (status === "cancelled") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function toStatusLabel(status: DealerStatus | null) {
  if (status === "pending_review") return "pending_review";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "suspended") return "suspended";
  if (status === "cancelled") return "cancelled";
  return "-";
}

async function fetchDealers(token: string) {
  const response = await fetch("/api/admin/dealers", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    dealers?: DealerAdminRow[];
  };

  return { response, payload };
}

export default function AdminDealersPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    dealers: [],
  });
  const [busyDealerId, setBusyDealerId] = useState<string | null>(null);

  const countsByStatus = useMemo(() => {
    const counters: Record<DealerStatus, number> = {
      pending_review: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
      cancelled: 0,
    };

    for (const dealer of state.dealers) {
      const status = normalizeStatus(dealer.status);
      if (status) counters[status] += 1;
    }

    return counters;
  }, [state.dealers]);

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

      const { response, payload } = await fetchDealers(session.access_token);

      if (!mounted) return;

      if (!response.ok) {
        if (response.status === 403) {
          setState({ loading: false, authorized: false, error: null, dealers: [] });
          return;
        }

        setState({
          loading: false,
          authorized: true,
          error: payload.error || "Impossibile caricare i dealer.",
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

  const submitAction = async (dealerId: string, action: DealerAction) => {
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

    const response = await fetch("/api/admin/dealers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ dealerId, action }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      dealerStatus?: string;
    };

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
      dealers: current.dealers.map((dealer) =>
        dealer.id === dealerId
          ? {
              ...dealer,
              status: payload.dealerStatus ?? dealer.status,
            }
          : dealer
      ),
    }));

    setBusyDealerId(null);
  };

  if (state.loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Caricamento elenco dealer...
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
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Gestione Dealer</h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {ALL_STATUSES.map((status) => (
              <div key={status} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{status}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{countsByStatus[status]}</p>
              </div>
            ))}
          </div>
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
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Telefono</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3">Data registrazione</th>
                  <th className="px-4 py-3 text-right">Azioni disponibili</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.dealers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={6}>
                      Nessun dealer disponibile.
                    </td>
                  </tr>
                ) : (
                  state.dealers.map((dealer) => {
                    const label = displayText(dealer.legal_name) !== "-" ? dealer.legal_name : dealer.name;
                    const busy = busyDealerId === dealer.id;
                    const status = normalizeStatus(dealer.status);
                    const actions = getActionsForStatus(status);

                    return (
                      <tr key={dealer.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{displayText(label)}</td>
                        <td className="px-4 py-3 text-slate-700">{displayText(dealer.email)}</td>
                        <td className="px-4 py-3 text-slate-700">{displayText(dealer.phone)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                            {toStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(dealer.created_at)}</td>
                        <td className="px-4 py-3">
                          {actions.length === 0 ? (
                            <div className="flex items-center justify-end text-xs text-slate-500">Nessuna azione</div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {actions.map((action) => (
                                <button
                                  key={`${dealer.id}-${action}`}
                                  type="button"
                                  onClick={() => void submitAction(dealer.id, action)}
                                  disabled={busy}
                                  className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${getActionClass(action)}`}
                                >
                                  {getActionLabel(action)}
                                </button>
                              ))}
                            </div>
                          )}
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
