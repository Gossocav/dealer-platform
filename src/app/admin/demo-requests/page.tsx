"use client";

import { useEffect, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected";
type DemoAdminAction =
  | "mark_contacted"
  | "activate_demo"
  | "reject"
  | "revoke_demo"
  | "convert_demo"
  | "view_document"
  | "download_document";

type DemoRequestRow = {
  id: string;
  dealership_name: string;
  company_name: string | null;
  vat_number: string | null;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  vehicle_count: number | null;
  message: string | null;
  chamber_document_path: string | null;
  chamber_document_name: string | null;
  chamber_document_mime_type: string | null;
  chamber_document_size: number | null;
  status: DemoRequestStatus;
  created_at: string;
  updated_at: string;
  account_type?: string | null;
  demo_status?: string | null;
  demo_started_at?: string | null;
  demo_expires_at?: string | null;
  linked_dealer_id?: string | null;
};

type PageState = {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  requests: DemoRequestRow[];
};

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

function normalizeStatus(value: string | null | undefined): DemoRequestStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "contacted" || normalized === "activated" || normalized === "rejected") {
    return normalized;
  }
  return null;
}

function toStatusLabel(status: DemoRequestStatus | null) {
  if (status === "pending") return "pending";
  if (status === "contacted") return "contacted";
  if (status === "activated") return "activated";
  if (status === "rejected") return "rejected";
  return "-";
}

function getStatusBadgeClass(status: DemoRequestStatus | null) {
  if (status === "pending") return "bg-amber-100 text-amber-800";
  if (status === "contacted") return "bg-sky-100 text-sky-800";
  if (status === "activated") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function getActionsForStatus(status: DemoRequestStatus | null): DemoAdminAction[] {
  if (status === "pending") return ["mark_contacted", "activate_demo", "reject"];
  if (status === "contacted") return ["activate_demo", "reject"];
  if (status === "activated") return ["convert_demo", "revoke_demo"];
  return [];
}

function getActionLabel(action: DemoAdminAction) {
  if (action === "mark_contacted") return "Segna come contattato";
  if (action === "activate_demo") return "Attiva demo";
  if (action === "convert_demo") return "Converti Demo";
  if (action === "revoke_demo") return "Revoca Demo";
  return "Rifiuta";
}

function getActionClass(action: DemoAdminAction) {
  if (action === "mark_contacted") return "bg-sky-600 hover:bg-sky-700";
  if (action === "activate_demo") return "bg-emerald-600 hover:bg-emerald-700";
  if (action === "convert_demo") return "bg-indigo-600 hover:bg-indigo-700";
  if (action === "revoke_demo") return "bg-orange-600 hover:bg-orange-700";
  return "bg-rose-600 hover:bg-rose-700";
}

function formatDaysRemaining(expiresAt: string | null | undefined) {
  const value = String(expiresAt ?? "").trim();
  if (!value) {
    return "-";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }

  const days = Math.max(0, Math.ceil((parsed - Date.now()) / (1000 * 60 * 60 * 24)));
  return `${days}g`;
}

function formatFileSize(value: number | null | undefined) {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "-";
  }

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

async function fetchDemoRequests(token: string) {
  const response = await fetch("/api/admin/demo-requests", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    requests?: DemoRequestRow[];
  };

  return { response, payload };
}

export default function AdminDemoRequestsPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    requests: [],
  });
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

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
        setState({ loading: false, authorized: false, error: userError?.message || "Utente non autenticato.", requests: [] });
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

      const { response, payload } = await fetchDemoRequests(session.access_token);

      if (!mounted) return;

      if (!response.ok) {
        if (response.status === 403) {
          setState({ loading: false, authorized: false, error: null, requests: [] });
          return;
        }

        setState({
          loading: false,
          authorized: true,
          error: payload.error || "Impossibile caricare le richieste demo.",
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

  const submitAction = async (requestId: string, action: DemoAdminAction) => {
    setBusyRequestId(requestId);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setState((current) => ({
        ...current,
        error: sessionError?.message || "Sessione non valida.",
      }));
      setBusyRequestId(null);
      return;
    }

    const response = await fetch("/api/admin/demo-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ requestId, action }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      status?: DemoRequestStatus;
    };

    if (!response.ok) {
      setState((current) => ({
        ...current,
        error: payload.error || "Aggiornamento stato non riuscito.",
      }));
      setBusyRequestId(null);
      return;
    }

    setState((current) => ({
      ...current,
      error: null,
      requests: current.requests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: payload.status ?? request.status,
            }
          : request
      ),
    }));

    setBusyRequestId(null);
  };

  const openDocument = async (requestId: string, mode: "view_document" | "download_document") => {
    setBusyRequestId(requestId);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setState((current) => ({
        ...current,
        error: sessionError?.message || "Sessione non valida.",
      }));
      setBusyRequestId(null);
      return;
    }

    const response = await fetch("/api/admin/demo-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ requestId, action: mode }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; signedUrl?: string };

    if (!response.ok || !payload.signedUrl) {
      setState((current) => ({
        ...current,
        error: payload.error || "Impossibile aprire la visura.",
      }));
      setBusyRequestId(null);
      return;
    }

    window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
    setBusyRequestId(null);
  };

  if (state.loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Caricamento richieste demo...
        </div>
      </main>
    );
  }

  if (!state.authorized) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-red-900">Accesso negato</h1>
          <p className="mt-3 text-sm text-red-800">Questa sezione e disponibile solo per account admin o platform owner.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Admin</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Richieste demo</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Gestisci lo stato delle richieste demo inviate da concessionarie interessate alla piattaforma.</p>
        </section>

        {state.error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm">{state.error}</section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-3">Azienda</th>
                  <th className="px-4 py-3">Referente</th>
                  <th className="px-4 py-3">Partita IVA</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Telefono</th>
                  <th className="px-4 py-3">Citta</th>
                  <th className="px-4 py-3">Numero veicoli</th>
                  <th className="px-4 py-3">Visura</th>
                  <th className="px-4 py-3">Stato richiesta</th>
                  <th className="px-4 py-3">Stato demo</th>
                  <th className="px-4 py-3">Scadenza demo</th>
                  <th className="px-4 py-3">Dealer collegato</th>
                  <th className="px-4 py-3">Data richiesta</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.requests.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={14}>
                      Nessuna richiesta demo disponibile.
                    </td>
                  </tr>
                ) : (
                  state.requests.map((request) => {
                    const status = normalizeStatus(request.status);
                    const actions = getActionsForStatus(status);
                    const busy = busyRequestId === request.id;

                    return (
                      <tr key={request.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{request.dealership_name}</td>
                        <td className="px-4 py-3 text-slate-700">{request.contact_name}</td>
                        <td className="px-4 py-3 text-slate-700">{request.vat_number ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{request.email}</td>
                        <td className="px-4 py-3 text-slate-700">{request.phone}</td>
                        <td className="px-4 py-3 text-slate-700">{request.city}</td>
                        <td className="px-4 py-3 text-slate-700">{request.vehicle_count ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {request.chamber_document_path ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-800">{request.chamber_document_name ?? "Documento"}</p>
                              <p className="text-xs text-slate-500">{formatFileSize(request.chamber_document_size)}</p>
                              <p className="text-xs text-slate-500">{request.chamber_document_mime_type ?? "-"}</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void openDocument(request.id, "view_document")}
                                  className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  Visualizza visura
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void openDocument(request.id, "download_document")}
                                  className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  Scarica visura
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                            {toStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{request.demo_status ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatDate(request.demo_expires_at)} ({formatDaysRemaining(request.demo_expires_at)})
                        </td>
                        <td className="px-4 py-3 text-slate-700">{request.linked_dealer_id ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(request.created_at)}</td>
                        <td className="px-4 py-3">
                          {actions.length === 0 ? (
                            <div className="flex items-center justify-end text-xs text-slate-500">Nessuna azione</div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {actions.map((action) => (
                                <button
                                  key={`${request.id}-${action}`}
                                  type="button"
                                  onClick={() => void submitAction(request.id, action)}
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
