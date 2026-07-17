"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import {
  DEMO_GOOGLE_ADS_NOTE,
  DEMO_LIMIT_KEYS,
  DEMO_MARKETING_SERVICE_KEYS,
  DEMO_MODULE_KEYS,
  getDemoProfileByCode,
  listEnabledDemoProfiles,
  type DemoLimits,
  type DemoMarketingServices,
  type DemoModules,
  type DemoProfileCode,
} from "@/lib/demo-profiles";
import { supabase } from "@/lib/supabaseClient";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected";
type DemoAdminAction =
  | "mark_contacted"
  | "activate_demo"
  | "reject"
  | "suspend_demo"
  | "reactivate_demo"
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
  activated_at?: string | null;
  linked_dealer_id?: string | null;
  demo_profile_id?: string | null;
  demo_profile_code?: DemoProfileCode | null;
  demo_profile_price_monthly?: number | null;
  demo_duration_days?: number | null;
  demo_modules?: DemoModules | Record<string, unknown> | null;
  demo_limits?: DemoLimits | Record<string, unknown> | null;
  demo_marketing_services?: DemoMarketingServices | Record<string, unknown> | null;
  assigned_marketing_manager?: string | null;
  expired_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  reactivated_at?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  converted_at?: string | null;
  lifecycle_version?: number | null;
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
  requestId?: string;
  demoProfileCode?: DemoProfileCode;
  demoProfileName?: string;
  demoModules?: Record<string, unknown>;
  demoLimits?: Record<string, unknown>;
  demoMarketingServices?: Record<string, unknown>;
  request?: DemoRequestRow;
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

function getActionsForStatus(status: DemoRequestStatus | null, demoStatus: string | null | undefined): DemoAdminAction[] {
  const canActivate = demoStatus === "configured" || demoStatus === "ready_for_activation";
  if (demoStatus === "active") return ["suspend_demo", "revoke_demo", "convert_demo"];
  if (demoStatus === "suspended" || demoStatus === "expired") return ["reactivate_demo", "revoke_demo", "convert_demo"];
  if (demoStatus === "revoked" || demoStatus === "converted") return [];
  if (status === "pending") return ["mark_contacted", ...(canActivate ? ["activate_demo" as const] : []), "reject"];
  if (status === "contacted") return [...(canActivate ? ["activate_demo" as const] : []), "reject"];
  if (status === "activated") return ["convert_demo", "revoke_demo"];
  return [];
}

function getActionLabel(action: DemoAdminAction) {
  if (action === "mark_contacted") return "Segna come contattato";
  if (action === "activate_demo") return "Attiva demo";
  if (action === "convert_demo") return "Converti Demo";
  if (action === "revoke_demo") return "Revoca Demo";
  if (action === "suspend_demo") return "Sospendi Demo";
  if (action === "reactivate_demo") return "Riattiva Demo";
  return "Rifiuta";
}

function getActionClass(action: DemoAdminAction) {
  if (action === "mark_contacted") return "bg-sky-600 hover:bg-sky-700";
  if (action === "activate_demo") return "bg-emerald-600 hover:bg-emerald-700";
  if (action === "convert_demo") return "bg-indigo-600 hover:bg-indigo-700";
  if (action === "revoke_demo") return "bg-orange-600 hover:bg-orange-700";
  if (action === "suspend_demo") return "bg-amber-600 hover:bg-amber-700";
  if (action === "reactivate_demo") return "bg-emerald-600 hover:bg-emerald-700";
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

function formatDemoProfileLabel(value: DemoProfileCode | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length > 0 ? normalized : "-";
}

function getDemoProfileDetails(code: DemoProfileCode | null | undefined) {
  return getDemoProfileByCode(code);
}

const DEMO_REQUESTS_DEBUG = process.env.NODE_ENV !== "production";
const DEMO_REQUESTS_CACHE_TTL_MS = 10_000;
const DEMO_PROFILES = listEnabledDemoProfiles();

let demoRequestsInFlight: Promise<DemoRequestsFetchResult> | null = null;
let demoRequestsCacheGeneration = 0;
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
    const cacheGeneration = demoRequestsCacheGeneration;
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

      if (response.ok && cacheGeneration === demoRequestsCacheGeneration) {
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

function invalidateDemoRequestsCache() {
  demoRequestsCacheGeneration += 1;
  demoRequestsCache = null;
  demoRequestsInFlight = null;
}

export default function AdminDemoRequestsPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    requests: [],
  });
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [configuringRequestId, setConfiguringRequestId] = useState<string | null>(null);
  const [selectedDemoProfileCode, setSelectedDemoProfileCode] = useState<DemoProfileCode>("base");
  const [durationDays, setDurationDays] = useState(7);
  const [moduleOverrides, setModuleOverrides] = useState<DemoModules>(() => ({ ...getDemoProfileByCode("base")!.modules }));
  const [limitOverrides, setLimitOverrides] = useState<DemoLimits>(() => ({ ...getDemoProfileByCode("base")!.limits }));
  const [marketingServiceOverrides, setMarketingServiceOverrides] = useState<DemoMarketingServices>(() => ({ ...getDemoProfileByCode("base")!.marketing_services }));
  const [assignedMarketingManager, setAssignedMarketingManager] = useState("");
  const [savingDemoConfiguration, setSavingDemoConfiguration] = useState(false);
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
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

  const submitAction = async (requestId: string, action: DemoAdminAction) => {
    if (action === "activate_demo" && !window.confirm("Confermi l'attivazione della Demo configurata? Verranno associati tenant e accesso cliente.")) {
      return;
    }
    let reason: string | undefined;
    let durationDays: number | undefined;
    if (action === "suspend_demo" || action === "revoke_demo") {
      const entered = window.prompt(action === "suspend_demo" ? "Motivazione della sospensione:" : "Motivazione della revoca definitiva:");
      if (entered === null) return;
      reason = entered.trim();
      if (reason.length < 3 || reason.length > 500) {
        setState((current) => ({ ...current, error: "Inserisci una motivazione da 3 a 500 caratteri." }));
        return;
      }
    }
    if (action === "reactivate_demo") {
      const entered = window.prompt("Durata del nuovo periodo Demo (1-30 giorni):", "7");
      if (entered === null) return;
      durationDays = Number(entered);
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) {
        setState((current) => ({ ...current, error: "La durata deve essere compresa tra 1 e 30 giorni." }));
        return;
      }
    }
    if ((action === "convert_demo" || action === "revoke_demo") && !window.confirm(action === "convert_demo" ? "Confermi la conversione definitiva in cliente?" : "Confermi la revoca definitiva della Demo?")) return;
    const currentRequest = state.requests.find((item) => item.id === requestId);
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

    let response: Response;
    try {
      response = await fetch("/api/admin/demo-requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId, action, reason, durationDays, lifecycleVersion: currentRequest?.lifecycle_version }),
      });
    } catch {
      setState((current) => ({ ...current, error: "Servizio Admin temporaneamente non disponibile." }));
      setBusyRequestId(null);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      status?: DemoRequestStatus;
      request?: DemoRequestRow;
    };

    if (!response.ok) {
      setState((current) => ({
        ...current,
        error: payload.error || "Aggiornamento stato non riuscito.",
      }));
      setBusyRequestId(null);
      return;
    }

    if (action === "activate_demo" || ["suspend_demo", "reactivate_demo", "revoke_demo", "convert_demo"].includes(action)) invalidateDemoRequestsCache();
    setState((current) => ({
      ...current,
      error: null,
      requests: current.requests.map((request) =>
        request.id === requestId
          ? payload.request ?? {
              ...request,
              status: payload.status ?? request.status,
            }
          : request
      ),
    }));

    setBusyRequestId(null);
  };

  const applyProfileDefaults = (code: DemoProfileCode) => {
    const profile = getDemoProfileByCode(code);
    if (!profile) return;
    setSelectedDemoProfileCode(code);
    setDurationDays(profile.duration_days);
    setModuleOverrides({ ...profile.modules });
    setLimitOverrides({ ...profile.limits });
    setMarketingServiceOverrides({ ...profile.marketing_services });
  };

  const openConfiguration = (request: DemoRequestRow) => {
    const code = request.demo_profile_code ?? "base";
    const profile = getDemoProfileByCode(code);
    setConfiguringRequestId(request.id);
    applyProfileDefaults(code);
    if (profile && request.demo_profile_code) {
      setDurationDays(request.demo_duration_days ?? profile.duration_days);
      setModuleOverrides({ ...profile.modules, ...(request.demo_modules ?? {}) });
      setLimitOverrides({ ...profile.limits, ...(request.demo_limits ?? {}) });
      setMarketingServiceOverrides({ ...profile.marketing_services, ...(request.demo_marketing_services ?? {}) });
      setAssignedMarketingManager(request.assigned_marketing_manager ?? "");
    } else {
      setAssignedMarketingManager("");
    }
  };

  const closeConfiguration = () => {
    setConfiguringRequestId(null);
  };

  const saveDemoConfiguration = async () => {
    if (!configuringRequestId || savingDemoConfiguration) {
      return;
    }

    setSavingDemoConfiguration(true);

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
        body: JSON.stringify({
          requestId: configuringRequestId,
          action: "configure_demo",
          demoProfileCode: selectedDemoProfileCode,
          durationDays,
          moduleOverrides,
          limitOverrides,
          marketingServiceOverrides,
          assignedMarketingManager: assignedMarketingManager.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        demoProfileCode?: DemoProfileCode;
        demoModules?: Record<string, unknown>;
        demoLimits?: Record<string, unknown>;
        demoMarketingServices?: Record<string, unknown>;
        request?: DemoRequestRow;
      };

      if (!response.ok) {
        setState((current) => ({
          ...current,
          error: payload.error || "Aggiornamento configurazione non riuscito.",
        }));
        return;
      }

      if (!payload.request) {
        setState((current) => ({ ...current, error: "Risposta configurazione incompleta." }));
        return;
      }

      invalidateDemoRequestsCache();
      const updatedRequest = payload.request;
      setState((current) => ({
        ...current,
        error: null,
        requests: current.requests.map((request) =>
          request.id === configuringRequestId
            ? updatedRequest
            : request
        ),
      }));

      closeConfiguration();
    } finally {
      setSavingDemoConfiguration(false);
    }
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
                  <th className="px-4 py-3">Profilo Demo</th>
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
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={15}>
                      Nessuna richiesta demo disponibile.
                    </td>
                  </tr>
                ) : (
                  state.requests.map((request) => {
                    const status = normalizeStatus(request.status);
                    const actions = getActionsForStatus(status, request.demo_status);
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
                          {request.demo_profile_code ? (
                            <div className="space-y-2">
                              <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                                Profilo Demo: {formatDemoProfileLabel(request.demo_profile_code)}
                              </span>
                              <div className="space-y-1 text-xs text-slate-600">
                                <p>Stato: {request.demo_status ?? "-"}</p>
                                <p>Durata snapshot: {request.demo_duration_days ?? "-"} giorni</p>
                                <p>Prezzo: {request.demo_profile_price_monthly === null || request.demo_profile_price_monthly === undefined ? "Non definito" : `€ ${request.demo_profile_price_monthly}/mese`}</p>
                                <p>Moduli attivi: {Object.values(request.demo_modules ?? {}).filter((value) => value === true).length}</p>
                                {request.assigned_marketing_manager ? <p>Marketing manager: {request.assigned_marketing_manager}</p> : null}
                                {request.demo_profile_code === "elite" ? (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                                    <p className="font-semibold">Servizi Marketing inclusi</p>
                                    <ul className="mt-1 space-y-1">
                                      <li>✔ Social Dealer Platform</li>
                                      <li>✔ Gestione Google Ads</li>
                                      <li>✔ Report Mensile</li>
                                    </ul>
                                    <p className="mt-2 text-xs font-medium text-amber-800">{DEMO_GOOGLE_ADS_NOTE}</p>
                                  </div>
                                ) : (
                                  <p className="text-slate-500">Configurazione salvata in snapshot.</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">Non configurato</span>
                          )}
                        </td>
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
                        <td className="px-4 py-3 text-slate-700">
                          <p>{request.demo_status ?? "-"}</p>
                          {request.demo_status === "active" ? <p className="mt-1 text-xs text-slate-500">Inizio: {formatDate(request.demo_started_at)}</p> : null}
                          {request.demo_status === "suspended" && request.suspension_reason ? <p className="mt-1 text-xs text-amber-700">Motivo: {request.suspension_reason}</p> : null}
                          {request.demo_status === "revoked" && request.revocation_reason ? <p className="mt-1 text-xs text-rose-700">Motivo: {request.revocation_reason}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatDate(request.demo_expires_at)} ({formatDaysRemaining(request.demo_expires_at)})
                        </td>
                        <td className="px-4 py-3 text-slate-700">{request.linked_dealer_id ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(request.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openConfiguration(request)}
                              disabled={["active", "expired", "suspended", "revoked", "converted"].includes(request.demo_status ?? "")}
                              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {request.demo_profile_code ? "Modifica configurazione" : "Configura Demo"}
                            </button>
                            {actions.length === 0 ? null : (
                              <>
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
                              </>
                            )}
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

        {configuringRequestId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_35px_120px_-40px_rgba(15,23,42,0.55)]">
              <div className="border-b border-slate-200 bg-[linear-gradient(120deg,_#f8fafc_0%,_#eff6ff_50%,_#ecfeff_100%)] px-6 py-5 sm:px-8">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Configura Demo</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Scegli il profilo Demo da salvare sulla richiesta</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  La configurazione salva solo il profilo, i moduli e i limiti associati alla richiesta. Non attiva la demo.
                </p>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-6 py-6 sm:px-8">
                <div className="grid gap-4 xl:grid-cols-3">
                  {DEMO_PROFILES.map((profile) => {
                    const isSelected = selectedDemoProfileCode === profile.code;

                    return (
                      <button
                        key={profile.code}
                        type="button"
                        onClick={() => applyProfileDefaults(profile.code)}
                        className={`group flex h-full flex-col rounded-[28px] border p-5 text-left transition ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 shadow-[0_22px_60px_-30px_rgba(37,99,235,0.65)]"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{profile.code.toUpperCase()}</p>
                            <h3 className="mt-2 text-xl font-semibold text-slate-900">{profile.name}</h3>
                          </div>
                          {profile.code === "elite" ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              ⭐ {profile.badgeLabel ?? "Consigliata"}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-4 text-sm leading-6 text-slate-600">{profile.description}</p>

                        <p className="mt-4 text-2xl font-semibold text-slate-900">
                          {profile.price_monthly === null ? "Prezzo da definire" : `€ ${profile.price_monthly}/mese`}
                        </p>

                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Durata</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{profile.duration_days} giorni</p>
                          <p className="mt-2 text-xs text-slate-500">Profilo scalabile, pronto per futuri livelli di configurazione.</p>
                        </div>

                        <div className="mt-5 space-y-4 text-sm text-slate-700">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Principali funzionalita</p>
                            <ul className="mt-2 space-y-1.5">
                              {profile.mainFeatures.map((feature) => (
                                <li key={feature} className="flex gap-2">
                                  <span className="mt-0.5 text-blue-600">•</span>
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Numero utenti</p>
                              <p className="mt-1 text-lg font-semibold text-slate-900">{profile.limits.max_users}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Numero veicoli</p>
                              <p className="mt-1 text-lg font-semibold text-slate-900">{profile.limits.max_vehicles}</p>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Servizi inclusi</p>
                            <ul className="mt-2 space-y-1.5">
                              {profile.includedServices.map((service) => (
                                <li key={service} className="flex gap-2 text-slate-700">
                                  <span className="mt-0.5 text-emerald-600">✔</span>
                                  <span>{service}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {profile.code === "elite" ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Marketing Digitale</p>
                              <p className="mt-2 text-sm font-medium">Visibilità social · Gestione Google Ads · Report mensile</p>
                              <p className="mt-3 text-xs font-semibold leading-5 text-amber-800">Budget pubblicitario escluso</p>
                              <p className="mt-2 text-xs leading-5 text-amber-800">{DEMO_GOOGLE_ADS_NOTE}</p>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
                          <span>{profile.enabled ? "Profilo attivo" : "Profilo disattivato"}</span>
                          <span className={isSelected ? "font-semibold text-blue-700" : ""}>{isSelected ? "Selezionato" : "Seleziona"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold text-slate-900">Durata e moduli</h3>
                    <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Durata (1-30 giorni)
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={durationDays}
                        onChange={(event) => setDurationDays(Number(event.target.value))}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {DEMO_MODULE_KEYS.map((key) => (
                        <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={moduleOverrides[key]}
                            onChange={(event) => setModuleOverrides((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          {key}
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold text-slate-900">Limiti snapshot</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {DEMO_LIMIT_KEYS.map((key) => {
                        const value = limitOverrides[key];
                        return typeof value === "boolean" ? (
                          <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={value}
                              onChange={(event) => setLimitOverrides((current) => ({ ...current, [key]: event.target.checked }))}
                            />
                            {key}
                          </label>
                        ) : (
                          <label key={key} className="text-xs font-medium text-slate-600">
                            {key}
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={value}
                              onChange={(event) => setLimitOverrides((current) => ({ ...current, [key]: Number(event.target.value) }))}
                              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold text-slate-900">Servizi marketing</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedDemoProfileCode === "elite" ? "Modificabili esclusivamente per il profilo Elite." : "Non disponibili per Base e Pro."}
                    </p>
                    <div className="mt-4 grid gap-2">
                      {DEMO_MARKETING_SERVICE_KEYS.map((key) => (
                        <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={marketingServiceOverrides[key]}
                            disabled={selectedDemoProfileCode !== "elite"}
                            onChange={(event) => setMarketingServiceOverrides((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          {key}
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold text-slate-900">Assegnazione e riepilogo</h3>
                    <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Marketing manager opzionale
                      <input
                        type="text"
                        value={assignedMarketingManager}
                        onChange={(event) => setAssignedMarketingManager(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                      <p className="font-semibold">Profilo {formatDemoProfileLabel(selectedDemoProfileCode)}</p>
                      <p className="mt-1">{durationDays} giorni · {Object.values(moduleOverrides).filter(Boolean).length} moduli attivi</p>
                      <p className="mt-1">{Object.values(marketingServiceOverrides).filter(Boolean).length} servizi marketing attivi</p>
                    </div>
                  </section>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-8">
                <button
                  type="button"
                  onClick={closeConfiguration}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyProfileDefaults(selectedDemoProfileCode);
                    setAssignedMarketingManager("");
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  Ripristina profilo
                </button>
                <button
                  type="button"
                  onClick={() => void saveDemoConfiguration()}
                  disabled={savingDemoConfiguration}
                  className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingDemoConfiguration ? "Salvataggio..." : "Salva configurazione"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
