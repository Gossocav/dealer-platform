"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";
import { DEMO_PLAN_CATALOG, type DemoPlanCode } from "@/lib/demo-plan-catalog";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected" | "converted" | "revoked";
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
  company_name?: string | null;
  vat_number: string | null;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  province?: string | null;
  vehicle_count: number | string | null;
  brands?: string | null;
  management_software?: string | null;
  notes?: string | null;
  privacy_accepted?: boolean | null;
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

type DemoRequestsApiPayload = {
  error?: string;
  requests?: DemoRequestRow[];
};

type DemoRequestsFetchResult = {
  status: number;
  payload: DemoRequestsApiPayload;
  fromCache: boolean;
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
  if (
    normalized === "pending" ||
    normalized === "contacted" ||
    normalized === "activated" ||
    normalized === "rejected" ||
    normalized === "converted" ||
    normalized === "revoked"
  ) {
    return normalized;
  }
  return null;
}

function toStatusLabel(status: DemoRequestStatus | null) {
  if (status === "pending") return "pending";
  if (status === "contacted") return "contacted";
  if (status === "activated") return "activated";
  if (status === "rejected") return "rejected";
  if (status === "converted") return "converted";
  if (status === "revoked") return "revoked";
  return "-";
}

function getStatusBadgeClass(status: DemoRequestStatus | null) {
  if (status === "pending") return "bg-amber-100 text-amber-800";
  if (status === "contacted") return "bg-sky-100 text-sky-800";
  if (status === "activated") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  if (status === "converted") return "bg-indigo-100 text-indigo-800";
  if (status === "revoked") return "bg-orange-100 text-orange-800";
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
  if (action === "activate_demo") return "Accetta richiesta";
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

const DEMO_REQUESTS_DEBUG = process.env.NODE_ENV !== "production";
const DEMO_REQUESTS_CACHE_TTL_MS = 10_000;

let demoRequestsInFlight: Promise<DemoRequestsFetchResult> | null = null;
let demoRequestsCache: {
  token: string;
  result: DemoRequestsFetchResult;
  savedAt: number;
} | null = null;

function debugDemoRequestsLog(event: string, details: Record<string, unknown>) {
  if (!DEMO_REQUESTS_DEBUG) {
    return;
  }

  console.info("[admin-demo-requests]", event, details);
}

async function fetchAdminDemoRequests(token: string): Promise<DemoRequestsFetchResult> {
  const now = Date.now();
  if (demoRequestsCache && demoRequestsCache.token === token && now - demoRequestsCache.savedAt < DEMO_REQUESTS_CACHE_TTL_MS) {
    return {
      ...demoRequestsCache.result,
      fromCache: true,
    };
  }

  if (!demoRequestsInFlight) {
    demoRequestsInFlight = (async () => {
      const response = await fetch("/api/admin/demo-requests", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as DemoRequestsApiPayload;
      const result: DemoRequestsFetchResult = {
        status: response.status,
        payload,
        fromCache: false,
      };

      if (response.ok) {
        demoRequestsCache = {
          token,
          result,
          savedAt: Date.now(),
        };
      }

      return result;
    })().finally(() => {
      demoRequestsInFlight = null;
    });
  }

  return demoRequestsInFlight;
}

export default function AdminDemoRequestsPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    requests: [],
  });
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [selectedPlanByRequest, setSelectedPlanByRequest] = useState<Record<string, DemoPlanCode>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const callCounterRef = useRef(0);
  const hasLoadedSuccessfullyRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const requestSeq = ++requestSequenceRef.current;
      const callNumber = ++callCounterRef.current;
      const filters: Record<string, string> = {};

      debugDemoRequestsLog("request:start", {
        callNumber,
        requestSeq,
        filters,
      });

      setState((current) => ({ ...current, loading: true, error: null }));

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted || requestSeq !== requestSequenceRef.current) return;

      if (userError || !user) {
        debugDemoRequestsLog("request:user-error", {
          callNumber,
          requestSeq,
          error: userError?.message || "Utente non autenticato.",
          status: 401,
          rows: 0,
          filters,
        });

        setState((current) => ({
          loading: false,
          authorized: false,
          error: userError?.message || "Utente non autenticato.",
          requests: current.requests,
        }));
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
        debugDemoRequestsLog("request:access-denied", {
          callNumber,
          requestSeq,
          status: 403,
          rows: 0,
          filters,
        });

        setState((current) => ({
          loading: false,
          authorized: false,
          error: null,
          requests: current.requests,
        }));
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!mounted || requestSeq !== requestSequenceRef.current) return;

      if (sessionError || !session?.access_token) {
        debugDemoRequestsLog("request:session-error", {
          callNumber,
          requestSeq,
          error: sessionError?.message || "Sessione non valida.",
          status: 401,
          rows: 0,
          filters,
        });

        setState((current) => ({
          ...current,
          loading: false,
          authorized: true,
          error: sessionError?.message || "Sessione non valida.",
        }));
        return;
      }

      let result: DemoRequestsFetchResult;

      try {
        result = await fetchAdminDemoRequests(session.access_token);
      } catch (fetchError) {
        debugDemoRequestsLog("request:fetch-error", {
          callNumber,
          requestSeq,
          error: fetchError instanceof Error ? fetchError.message : "Errore fetch sconosciuto",
          aborted: false,
          filters,
        });

        if (!mounted || requestSeq !== requestSequenceRef.current) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          authorized: true,
          error: "Impossibile caricare le richieste demo.",
        }));
        return;
      }

      if (!mounted || requestSeq !== requestSequenceRef.current) {
        debugDemoRequestsLog("request:ignored-obsolete", {
          callNumber,
          requestSeq,
          status: result.status,
          rows: result.payload.requests?.length ?? 0,
          filters,
        });
        return;
      }

      debugDemoRequestsLog("request:response", {
        callNumber,
        requestSeq,
        status: result.status,
        rows: result.payload.requests?.length ?? 0,
        fromCache: result.fromCache,
        filters,
        error: result.payload.error ?? null,
      });

      if (result.status < 200 || result.status >= 300) {
        if (result.status === 403) {
          if (hasLoadedSuccessfullyRef.current) {
            setState((current) => ({
              ...current,
              loading: false,
              authorized: true,
              error: result.payload.error || "Accesso admin temporaneamente non disponibile.",
            }));
            return;
          }

          setState((current) => ({
            loading: false,
            authorized: false,
            error: null,
            requests: current.requests,
          }));
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          authorized: true,
          error: result.payload.error || "Impossibile caricare le richieste demo.",
        }));
        return;
      }

      hasLoadedSuccessfullyRef.current = true;

      setState({
        loading: false,
        authorized: true,
        error: null,
        requests: result.payload.requests ?? [],
      });
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const submitAction = async (requestId: string, action: DemoAdminAction, planCode?: DemoPlanCode) => {
    setBusyRequestId(requestId);
    setSuccessMessage(null);

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
      body: JSON.stringify(action === "convert_demo" ? { requestId, action, planCode: planCode ?? "base" } : { requestId, action }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      status?: DemoRequestStatus;
      demoStatus?: string | null;
      demoExpiresAt?: string | null;
      linkedDealerId?: string | null;
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
              demo_status: payload.demoStatus ?? request.demo_status,
              demo_expires_at: payload.demoExpiresAt ?? request.demo_expires_at,
              linked_dealer_id: payload.linkedDealerId ?? request.linked_dealer_id,
            }
          : request
      ),
    }));

    setSuccessMessage(action === "activate_demo" ? "Richiesta demo accettata con successo." : "Richiesta demo aggiornata con successo.");

    setBusyRequestId(null);
  };

  const viewDocument = async (event: MouseEvent<HTMLButtonElement>, requestId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setViewingDocumentId(requestId);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setState((current) => ({
          ...current,
          error: sessionError?.message || "Sessione non valida.",
        }));
        return;
      }

      const response = await fetch("/api/admin/demo-requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId, action: "view_document" }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; signedUrl?: string };

      if (!response.ok || !payload.signedUrl) {
        setState((current) => ({
          ...current,
          error: payload.error || "Impossibile aprire la visura.",
        }));
        return;
      }

      window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setViewingDocumentId(null);
    }
  };

  const downloadDocument = async (event: MouseEvent<HTMLButtonElement>, requestId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDownloadingDocumentId(requestId);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setState((current) => ({
          ...current,
          error: sessionError?.message || "Sessione non valida.",
        }));
        return;
      }

      const response = await fetch("/api/admin/demo-requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId, action: "download_document" }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; signedUrl?: string };

      if (!response.ok || !payload.signedUrl) {
        setState((current) => ({
          ...current,
          error: payload.error || "Impossibile scaricare la visura.",
        }));
        return;
      }

      const anchor = document.createElement("a");
      anchor.href = payload.signedUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setDownloadingDocumentId(null);
    }
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

        {successMessage ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-sm">{successMessage}</section>
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
                    const viewing = viewingDocumentId === request.id;
                    const downloading = downloadingDocumentId === request.id;

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
                                  disabled={viewing}
                                  onClick={(event) => void viewDocument(event, request.id)}
                                  className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {viewing ? "Apertura..." : "Visualizza visura"}
                                </button>
                                <button
                                  type="button"
                                  disabled={downloading}
                                  onClick={(event) => void downloadDocument(event, request.id)}
                                  className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {downloading ? "Download..." : "Scarica visura"}
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
                              {actions.map((action) =>
                                action === "convert_demo" ? (
                                  <div key={`${request.id}-${action}`} className="flex items-center gap-2">
                                    <select
                                      value={selectedPlanByRequest[request.id] ?? "base"}
                                      onChange={(event) =>
                                        setSelectedPlanByRequest((current) => ({
                                          ...current,
                                          [request.id]: event.target.value as DemoPlanCode,
                                        }))
                                      }
                                      disabled={busy}
                                      className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {DEMO_PLAN_CATALOG.map((plan) => (
                                        <option key={plan.code} value={plan.code}>
                                          {plan.name}
                                          {plan.priceMonthly ? ` (€${plan.priceMonthly}/mese)` : ""}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => void submitAction(request.id, action, selectedPlanByRequest[request.id] ?? "base")}
                                      disabled={busy}
                                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${getActionClass(action)}`}
                                    >
                                      {getActionLabel(action)}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    key={`${request.id}-${action}`}
                                    type="button"
                                    onClick={() => void submitAction(request.id, action)}
                                    disabled={busy}
                                    className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${getActionClass(action)}`}
                                  >
                                    {getActionLabel(action)}
                                  </button>
                                )
                              )}
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
