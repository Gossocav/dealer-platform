"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FileSpreadsheet, Link2, Loader2, UploadCloud } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { buildActiveDealerHeaders, getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { supabase } from "@/lib/supabaseClient";
import {
  buildInitialVehicleImportMapping,
  buildVehicleInsertPayload,
  createEmptyVehicleImportDefaults,
  getVehicleImportDefaultOptions,
  getVehicleImportFieldLabel,
  getVehicleImportFields,
  mapVehicleImportRow,
  parseVehicleImportFile,
  VEHICLE_IMPORT_DEFAULT_FIELDS,
  type VehicleImportColumnMapping,
  type VehicleImportDefaultField,
  type VehicleImportDefaults,
  type VehicleImportMappedRow,
  type VehicleImportRawRow,
  type VehicleImportStatus,
  validateVehicleImportRow,
} from "@/lib/vehicle-import";

type ImportReport = {
  imported: number;
  skipped: number;
  errors: string[];
};

type TabId = "file" | "feed" | "sito" | "dms";

type FeedFormatOption = "auto" | "csv" | "xml" | "json";
type FeedFrequencyOption = "manual" | "nightly" | "weekly";

type FeedAnalysisResult = {
  detectedType: "csv" | "xml" | "json";
  rowsCount: number;
  preview: (Record<string, unknown> | string)[];
};

type FeedImportResult = {
  imported: number;
  updated: number;
  errors: string[];
};

type FeedHistoryItem = {
  id: string;
  created_at: string;
  source: string;
  source_type: "csv" | "xml" | "json";
  imported_count: number;
  error_count: number;
  duration_ms: number;
};

type SiteAnalysis = { site: string; totale: number; usate: number; km0: number };

type SiteBatchResult = {
  totale: number;
  prossimoOffset: number;
  finito: boolean;
  esiti: { sourceId: string; esito: string; motivo?: string; titolo?: string }[];
};

type SiteProgress = { importati: number; aggiornati: number; saltati: number; lettureFallite: number; letti: number };

type PreviewRow = {
  rowNumber: number;
  mapped: VehicleImportMappedRow;
  errors: string[];
};

const IMPORT_FIELDS = getVehicleImportFields();
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

async function resolveAccessToken(previousToken: string | null) {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? previousToken;
}

function isMissingColumn(message: string, columnName: string) {
  const lower = message.toLowerCase();
  return lower.includes("column") && lower.includes(columnName.toLowerCase()) && lower.includes("does not exist");
}

async function insertVehicleWithFallback(vehiclePayload: Record<string, unknown>) {
  const { error } = await supabase.from("vehicles").insert(vehiclePayload);
  if (!error) {
    return null;
  }

  if (isMissingColumn(error.message, "color")) {
    const payloadWithoutColor = { ...vehiclePayload };
    delete payloadWithoutColor.color;
    const { error: retryError } = await supabase.from("vehicles").insert(payloadWithoutColor);
    return retryError ?? null;
  }

  return error;
}

export function VehiclesImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("file");
  const [dealerName, setDealerName] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<VehicleImportRawRow[]>([]);
  const [mapping, setMapping] = useState<VehicleImportColumnMapping>(() => buildInitialVehicleImportMapping([]));
  const [defaults, setDefaults] = useState<VehicleImportDefaults>(() => createEmptyVehicleImportDefaults());
  const [initialStatus, setInitialStatus] = useState<VehicleImportStatus>("draft");
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const [feedUrl, setFeedUrl] = useState("");
  const [feedFormat, setFeedFormat] = useState<FeedFormatOption>("auto");
  const [feedVehicleStatus, setFeedVehicleStatus] = useState<VehicleImportStatus>("published");
  const [feedFrequency, setFeedFrequency] = useState<FeedFrequencyOption>("manual");
  const [feedPlanSaved, setFeedPlanSaved] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedImporting, setFeedImporting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedAnalysis, setFeedAnalysis] = useState<FeedAnalysisResult | null>(null);
  const [feedImportResult, setFeedImportResult] = useState<FeedImportResult | null>(null);
  const [history, setHistory] = useState<FeedHistoryItem[]>([]);

  const [siteUrl, setSiteUrl] = useState("");
  const [siteAnalysis, setSiteAnalysis] = useState<SiteAnalysis | null>(null);
  const [siteAnalyzing, setSiteAnalyzing] = useState(false);
  const [siteImporting, setSiteImporting] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  // Venti alla prima prova: abbastanza per giudicare il risultato, poche
  // abbastanza da poterle controllare una per una.
  const [siteQuante, setSiteQuante] = useState(20);
  const [siteStatus, setSiteStatus] = useState<VehicleImportStatus>("draft");
  const [siteProgress, setSiteProgress] = useState<SiteProgress | null>(null);
  const [siteLog, setSiteLog] = useState<string[]>([]);

  const loadSyncHistory = useCallback(
    async (tokenOverride?: string | null) => {
      const token = tokenOverride ?? sessionToken;
      if (!token) {
        return;
      }

      try {
        const response = await fetch("/api/vehicles/import-feed", {
          method: "GET",
          headers: buildActiveDealerHeaders({
            Authorization: `Bearer ${token}`,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { history?: FeedHistoryItem[] };
        setHistory(Array.isArray(payload.history) ? payload.history : []);
      } catch {
        // Best effort: keep UI usable even without history.
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    let alive = true;

    const fetchDealerName = async () => {
      const [{ data: authData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
      const userId = authData.user?.id;
      const token = sessionData.session?.access_token ?? null;
      setSessionToken(token);
      void loadSyncHistory(token);
      if (!userId) {
        return;
      }

      const { data } = await supabase
        .from("dealers")
        .select("name, legal_name")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ name: string | null; legal_name: string | null }>();

      if (!alive) {
        return;
      }

      const nextName = String(data?.name ?? data?.legal_name ?? "").trim();
      if (nextName) {
        setDealerName(nextName);
      }
    };

    void fetchDealerName();

    return () => {
      alive = false;
    };
  }, [loadSyncHistory]);

  const handleAnalyzeSite = async () => {
    setSiteAnalyzing(true);
    setSiteError(null);
    setSiteAnalysis(null);
    setSiteProgress(null);
    setSiteLog([]);

    try {
      const token = await resolveAccessToken(sessionToken);
      if (!token) {
        setSiteError("Sessione non valida.");
        return;
      }
      setSessionToken(token);

      const response = await fetch("/api/vehicles/import-site", {
        method: "POST",
        headers: buildActiveDealerHeaders({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
        body: JSON.stringify({ action: "analyze", site: siteUrl }),
      });

      const payload = (await response.json().catch(() => null)) as (SiteAnalysis & { error?: string }) | null;

      if (!response.ok || !payload) {
        setSiteError(payload?.error || "Non siamo riusciti a leggere il sito.");
        return;
      }

      setSiteAnalysis(payload);
    } catch {
      setSiteError("Non siamo riusciti a contattare il sito. Controlla la connessione.");
    } finally {
      setSiteAnalyzing(false);
    }
  };

  const handleImportSite = async () => {
    setSiteImporting(true);
    setSiteError(null);
    setSiteLog([]);

    const avanzamento: SiteProgress = { importati: 0, aggiornati: 0, saltati: 0, lettureFallite: 0, letti: 0 };
    setSiteProgress({ ...avanzamento });

    try {
      const token = await resolveAccessToken(sessionToken);
      if (!token) {
        setSiteError("Sessione non valida.");
        return;
      }
      setSessionToken(token);

      let offset = 0;
      const registro: string[] = [];

      // A lotti piccoli: leggere il sito di qualcun altro richiede qualche
      // secondo a scheda, e un lotto per richiesta sta dentro i limiti di
      // tempo del server. In piu' l'avanzamento si vede mentre accade.
      while (avanzamento.letti < siteQuante) {
        const limit = Math.min(5, siteQuante - avanzamento.letti);

        const response = await fetch("/api/vehicles/import-site", {
          method: "POST",
          headers: buildActiveDealerHeaders({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
          body: JSON.stringify({ action: "import", site: siteUrl, offset, limit, status: siteStatus }),
        });

        const payload = (await response.json().catch(() => null)) as (SiteBatchResult & { error?: string }) | null;

        if (!response.ok || !payload) {
          setSiteError(payload?.error || "Importazione interrotta.");
          break;
        }

        for (const esito of payload.esiti) {
          avanzamento.letti += 1;
          if (esito.esito === "importato") avanzamento.importati += 1;
          else if (esito.esito === "aggiornato") avanzamento.aggiornati += 1;
          else if (esito.esito === "lettura-fallita") avanzamento.lettureFallite += 1;
          else avanzamento.saltati += 1;

          const etichetta = esito.titolo ?? esito.sourceId;
          if (esito.esito === "saltato") registro.push(`saltato (${esito.motivo}): ${etichetta}`);
          else if (esito.esito === "lettura-fallita") registro.push(`lettura fallita, riprovabile: ${etichetta}`);
          else registro.push(`${esito.esito}: ${etichetta}`);
        }

        setSiteProgress({ ...avanzamento });
        setSiteLog([...registro]);

        offset = payload.prossimoOffset;
        if (payload.finito) break;
      }
    } catch {
      setSiteError("Importazione interrotta: problema di connessione.");
    } finally {
      setSiteImporting(false);
    }
  };

  const previewRows = useMemo<PreviewRow[]>(() => {
    return rows.slice(0, 12).map((row) => {
      const mapped = mapVehicleImportRow(row, mapping);
      const errors = validateVehicleImportRow(mapped);
      return {
        rowNumber: row.rowNumber,
        mapped,
        errors,
      };
    });
  }, [mapping, rows]);

  const validRowsCount = useMemo(() => {
    return rows.reduce((count, row) => {
      const mapped = mapVehicleImportRow(row, mapping);
      const validationErrors = validateVehicleImportRow(mapped);
      return validationErrors.length === 0 ? count + 1 : count;
    }, 0);
  }, [mapping, rows]);

  const onFileChange = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setFileName(null);
      setHeaders([]);
      setRows([]);
      setMapping(buildInitialVehicleImportMapping([]));
      setDefaults(createEmptyVehicleImportDefaults());
      setReport(null);
      setError("File troppo grande. La dimensione massima consentita è 10 MB.");
      return;
    }

    setLoadingFile(true);
    setError(null);
    setReport(null);

    try {
      const parsed = await parseVehicleImportFile(file);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(buildInitialVehicleImportMapping(parsed.headers));
      // I predefiniti valgono per il file che li ha resi necessari: portarseli
      // dietro sul file successivo significherebbe timbrare "Usato" su un
      // listino di auto nuove senza che nessuno l'abbia chiesto.
      setDefaults(createEmptyVehicleImportDefaults());
    } catch (parseError) {
      setFileName(null);
      setHeaders([]);
      setRows([]);
      setDefaults(createEmptyVehicleImportDefaults());
      setError(parseError instanceof Error ? parseError.message : "Errore lettura file.");
    } finally {
      setLoadingFile(false);
    }
  };

  const updateMapping = (field: keyof VehicleImportColumnMapping, header: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: header === "" ? null : header,
    }));
  };

  const updateDefault = (field: VehicleImportDefaultField, value: string) => {
    setDefaults((prev) => {
      const next = { ...prev };
      if (value === "") {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setReport(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (authError || !userId) {
      setError(authError?.message || "Utente non autenticato.");
      setImporting(false);
      return;
    }

    let dealerId: string | null = null;

    try {
      dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });
    } catch (dealerError) {
      setError(dealerError instanceof Error ? dealerError.message : "Errore risoluzione dealer.");
      setImporting(false);
      return;
    }

    if (!dealerId) {
      setError("Dealer non associato al profilo utente.");
      setImporting(false);
      return;
    }

    const { count: vehicleCount, error: vehicleCountError } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId);

    if (vehicleCountError) {
      setError(vehicleCountError.message || "Impossibile verificare il limite demo.");
      setImporting(false);
      return;
    }

    const demoAccessContext = await resolveDemoAccessContext(supabase, dealerId, {
      vehicleCount: vehicleCount ?? 0,
    });
    const demoBlock = getDemoFeatureBlockReason(demoAccessContext, "import");

    if (demoBlock) {
      setError(demoBlock.message);
      setImporting(false);
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const mappedRow = mapVehicleImportRow(row, mapping);
      const validationErrors = validateVehicleImportRow(mappedRow);

      if (validationErrors.length > 0) {
        skipped += 1;
        errors.push(`Riga ${row.rowNumber}: ${validationErrors.join(", ")}`);
        continue;
      }

      const payload = buildVehicleInsertPayload(mappedRow, initialStatus, defaults);

      const insertError = await insertVehicleWithFallback({
        ...payload,
        dealer_id: dealerId,
      });

      if (insertError) {
        skipped += 1;
        errors.push(`Riga ${row.rowNumber}: ${insertError.message}`);
        continue;
      }

      imported += 1;
    }

    setReport({ imported, skipped, errors });
    setImporting(false);
  };

  const handleAnalyzeFeed = async () => {
    setFeedLoading(true);
    setFeedError(null);
    setFeedAnalysis(null);
    setFeedImportResult(null);

    try {
      const token = await resolveAccessToken(sessionToken);
      if (!token) {
        setFeedError("Sessione non valida.");
        return;
      }

      setSessionToken(token);

      const response = await fetch("/api/vehicles/import-feed", {
        method: "POST",
        headers: buildActiveDealerHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({
          mode: "analyze",
          feedUrl,
          format: feedFormat,
          status: feedVehicleStatus,
          frequency: feedFrequency,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        format?: "csv" | "xml" | "json";
        vehicleCount?: number;
        preview?: (Record<string, unknown> | string)[];
      };

      if (!response.ok || payload.error) {
        setFeedError(payload.error ?? "Errore durante l'analisi del feed.");
        return;
      }

      setFeedAnalysis({
        detectedType: payload.format ?? "csv",
        rowsCount: payload.vehicleCount ?? 0,
        preview: payload.preview ?? [],
      });
    } catch {
      setFeedError("Errore di rete durante l'analisi del feed.");
    } finally {
      setFeedLoading(false);
    }
  };

  const handleImportFeed = async () => {
    setFeedImporting(true);
    setFeedError(null);

    try {
      const token = await resolveAccessToken(sessionToken);
      if (!token) {
        setFeedError("Sessione non valida.");
        return;
      }

      setSessionToken(token);

      const response = await fetch("/api/vehicles/import-feed", {
        method: "POST",
        headers: buildActiveDealerHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({
          mode: "import",
          feedUrl,
          format: feedFormat,
          status: feedVehicleStatus,
          frequency: feedFrequency,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        importedCount?: number;
        skippedCount?: number;
        errors?: string[];
      };

      if (!response.ok || payload.error) {
        setFeedError(payload.error ?? "Errore durante l'importazione.");
        return;
      }

      setFeedImportResult({
        imported: payload.importedCount ?? 0,
        updated: 0,
        errors: payload.errors ?? [],
      });

      void loadSyncHistory(token);

      setTimeout(() => {
        router.push("/veicoli");
      }, 1500);
    } catch {
      setFeedError("Errore di rete durante l'importazione.");
    } finally {
      setFeedImporting(false);
    }
  };

  const statusBadge = (errors: string[]) => {
    if (errors.length === 0) {
      return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Valida</span>;
    }

    return <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Da verificare</span>;
  };

  const formatDuration = (durationMs: number) => {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${minutes}m ${rem}s`;
  };

  const renderTabButtons = () => (
    <div className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-4">
      <button
        type="button"
        onClick={() => setActiveTab("file")}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          activeTab === "file" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        CARICA FILE
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("feed")}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          activeTab === "feed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        SINCRONIZZA FEED
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("sito")}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          activeTab === "sito" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        DAL TUO SITO
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("dms")}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          activeTab === "dms" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        GESTIONALE (PROSSIMAMENTE)
      </button>
    </div>
  );

  return (
    <DealerDashboardShell title="Sincronizzazione Stock" dealerName={dealerName}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stock Center</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Sincronizzazione Stock</h2>
            <p className="mt-2 text-sm text-slate-600">Importa, sincronizza e aggiorna automaticamente il tuo parco veicoli.</p>
          </div>

          <Link
            href="/veicoli"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Torna ai veicoli
          </Link>
        </div>

        {renderTabButtons()}
      </section>

      {activeTab === "file" ? (
        <>
          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <h3 className="text-base font-semibold text-slate-900">1. Carica file</h3>
            <p className="mt-1 text-sm text-slate-600">Formati supportati: Excel (.xlsx, .xls) e CSV (.csv)</p>

            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-blue-50/50 p-8 text-center transition hover:border-blue-300 hover:from-white hover:to-blue-50">
              <UploadCloud className="h-8 w-8 text-blue-600" />
              <span className="mt-3 text-sm font-medium text-slate-700">Seleziona un file da importare</span>
              <span className="mt-1 text-xs text-slate-500">Le righe vuote verranno ignorate automaticamente.</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void onFileChange(file);
                }}
              />
            </label>

            {loadingFile ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Lettura file in corso...
              </p>
            ) : null}

            {fileName ? <p className="mt-3 text-sm text-slate-700">File caricato: {fileName}</p> : null}
          </section>

          {headers.length > 0 ? (
            <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
              <h3 className="text-base font-semibold text-slate-900">2. Mappatura colonne</h3>
              <p className="mt-1 text-sm text-slate-600">Verifica la mappatura automatica e seleziona lo stato iniziale per i veicoli importati.</p>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {IMPORT_FIELDS.map((field) => (
                  <label key={field} className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{getVehicleImportFieldLabel(field)}</span>
                    <select
                      value={mapping[field] ?? ""}
                      onChange={(event) => updateMapping(field, event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                    >
                      <option value="">Non mappato</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <h4 className="text-sm font-semibold text-slate-900">Valori uguali per tutto il file</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Se il file non ha una di queste colonne — o la lascia in bianco su alcune righe — puoi dirlo una volta
                  sola qui: un listino di soli usati diventa <strong>Usato</strong> su ogni veicolo. Dove il file un valore
                  ce l&apos;ha, vince il file.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {VEHICLE_IMPORT_DEFAULT_FIELDS.map((field) => (
                    <label key={field} className="block space-y-2">
                      <span className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {getVehicleImportFieldLabel(field)}
                        </span>
                        {mapping[field] ? null : (
                          <span className="text-[11px] font-medium text-amber-600">colonna assente</span>
                        )}
                      </span>
                      <select
                        value={defaults[field] ?? ""}
                        onChange={(event) => updateDefault(field, event.target.value)}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                      >
                        <option value="">Nessun valore predefinito</option>
                        {getVehicleImportDefaultOptions(field).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 max-w-xs space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stato iniziale</span>
                <select
                  value={initialStatus}
                  onChange={(event) => setInitialStatus(event.target.value as VehicleImportStatus)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                >
                  <option value="draft">Bozza</option>
                  <option value="published">Pubblicato</option>
                </select>
              </div>
            </section>
          ) : null}

          {previewRows.length > 0 ? (
            <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
              <h3 className="text-base font-semibold text-slate-900">3. Anteprima e validazione</h3>
              <p className="mt-1 text-sm text-slate-600">
                Righe valide: <strong>{validRowsCount}</strong> su <strong>{rows.length}</strong>
              </p>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Riga</th>
                      <th className="px-3 py-2 font-semibold">Veicolo</th>
                      <th className="px-3 py-2 font-semibold">Anno</th>
                      <th className="px-3 py-2 font-semibold">Prezzo</th>
                      <th className="px-3 py-2 font-semibold">Esito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          {row.mapped.brand || "-"} {row.mapped.model || ""}
                        </td>
                        <td className="px-3 py-2">{row.mapped.year || "-"}</td>
                        <td className="px-3 py-2">{row.mapped.price || "-"}</td>
                        <td className="px-3 py-2">{row.errors.length === 0 ? statusBadge([]) : statusBadge(row.errors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <h3 className="text-base font-semibold text-slate-900">4. Import finale</h3>
            <p className="mt-1 text-sm text-slate-600">Importa solo le righe valide direttamente nella tabella vehicles.</p>

            <button
              type="button"
              onClick={() => {
                void handleImport();
              }}
              disabled={rows.length === 0 || importing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Importa veicoli
            </button>

            {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            {report ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Report importazione</p>
                <p className="mt-2 text-sm text-slate-700">Importati: {report.imported}</p>
                <p className="text-sm text-slate-700">Saltati: {report.skipped}</p>

                {report.errors.length > 0 ? (
                  <ul className="mt-3 max-h-44 space-y-1 overflow-auto rounded-lg border border-red-100 bg-white p-3 text-xs text-red-700">
                    {report.errors.map((entry, index) => (
                      <li key={`${entry}-${index}`}>{entry}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {activeTab === "feed" ? (
        <>
          <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
            <h3 className="text-base font-semibold text-slate-900">URL FEED</h3>

            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">URL feed</span>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                  <Link2 className="h-4 w-4 text-slate-400" />
                  <input
                    type="url"
                    value={feedUrl}
                    onChange={(event) => setFeedUrl(event.target.value)}
                    placeholder="https://www.concessionaria.it/feed.xml"
                    className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500">Esempi: feed.xml, stock.csv, feed.json</p>
              </label>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Formato</span>
                  <select
                    value={feedFormat}
                    onChange={(event) => setFeedFormat(event.target.value as FeedFormatOption)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                  >
                    <option value="auto">Automatico</option>
                    <option value="csv">CSV</option>
                    <option value="xml">XML</option>
                    <option value="json">JSON</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stato veicoli importati</span>
                  <select
                    value={feedVehicleStatus}
                    onChange={(event) => setFeedVehicleStatus(event.target.value as VehicleImportStatus)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                  >
                    <option value="published">Pubblicato</option>
                    <option value="draft">Bozza</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Frequenza sincronizzazione</span>
                  <select
                    value={feedFrequency}
                    onChange={(event) => setFeedFrequency(event.target.value as FeedFrequencyOption)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                  >
                    <option value="manual">Solo manuale</option>
                    <option value="nightly">Ogni notte</option>
                    <option value="weekly">Ogni settimana</option>
                  </select>
                </label>

                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setFeedPlanSaved(true);
                    }}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Salva pianificazione
                  </button>
                </div>
              </div>

              {feedPlanSaved ? (
                <p className="inline-flex items-center gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Pianificazione salvata (scheduler non ancora attivo).
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleAnalyzeFeed();
                  }}
                  disabled={!feedUrl.trim() || feedLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {feedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Analizza Feed
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleImportFeed();
                  }}
                  disabled={!feedAnalysis || feedAnalysis.rowsCount === 0 || feedImporting}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {feedImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Importa Stock
                </button>
              </div>

              {feedError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{feedError}</p> : null}
            </div>
          </section>

          {feedAnalysis ? (
            <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Analisi feed</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Formato rilevato: <strong>{feedAnalysis.detectedType.toUpperCase()}</strong> · Veicoli trovati: <strong>{feedAnalysis.rowsCount}</strong>
                  </p>
                </div>
                {feedImportResult ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Importazione completata · Importati {feedImportResult.imported} · Aggiornati {feedImportResult.updated}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-12 px-3 py-2 font-semibold">N°</th>
                      <th className="px-3 py-2 font-semibold">Anteprima dati</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {feedAnalysis.preview.map((item, index) => {
                      const preview =
                        typeof item === "string"
                          ? item.replace(/\s+/g, " ").trim().slice(0, 200)
                          : Object.entries(item)
                              .slice(0, 6)
                              .map(([k, v]) => `${k}: ${String(v ?? "").slice(0, 40)}`)
                              .join(" · ");
                      return (
                        <tr key={index}>
                          <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                          <td className="break-all px-3 py-2 text-xs text-slate-600">{preview || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {feedImportResult?.errors?.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Dettaglio errori</p>
                  <ul className="mt-2 max-h-44 space-y-1 overflow-auto text-xs text-amber-800">
                    {feedImportResult.errors.map((entry, index) => (
                      <li key={`${entry}-${index}`}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {activeTab === "sito" ? (
        <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">Importa dal tuo sito</h3>
          <p className="mt-1 text-sm text-slate-600">
            Se il tuo stock e&apos; gia&apos; pubblicato sul tuo sito, non serve nessun file: scrivi qui l&apos;indirizzo e
            lo leggiamo da li&apos;. Vengono importate <strong>solo usate e km 0</strong> — le auto nuove sono voci di
            catalogo, non vetture in piazzale.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Indirizzo del sito</span>
              <input
                type="text"
                value={siteUrl}
                onChange={(event) => {
                  setSiteUrl(event.target.value);
                  setSiteAnalysis(null);
                }}
                placeholder="autogepy.it"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleAnalyzeSite()}
              disabled={siteAnalyzing || siteImporting || siteUrl.trim().length === 0}
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {siteAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Controlla
            </button>
          </div>

          {siteError ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{siteError}</p>
          ) : null}

          {siteAnalysis ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700">
                Su <strong>{siteAnalysis.site}</strong> abbiamo trovato <strong>{siteAnalysis.totale}</strong> veicoli
                importabili: {siteAnalysis.usate} usate e {siteAnalysis.km0} km 0.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quanti importarne ora</span>
                  <input
                    type="number"
                    min={1}
                    max={siteAnalysis.totale}
                    value={siteQuante}
                    onChange={(event) => setSiteQuante(Math.max(1, Number(event.target.value) || 1))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stato iniziale</span>
                  <select
                    value={siteStatus}
                    onChange={(event) => setSiteStatus(event.target.value as VehicleImportStatus)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300"
                  >
                    <option value="draft">Bozza — non compare sul marketplace</option>
                    <option value="published">Pubblicato</option>
                  </select>
                </label>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                In bozza non consumano il limite di annunci del tuo piano, e puoi controllarle prima di pubblicarle.
              </p>

              <button
                type="button"
                onClick={() => void handleImportSite()}
                disabled={siteImporting}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {siteImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Importa {siteQuante} veicoli
              </button>
            </div>
          ) : null}

          {siteProgress ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">
                {siteImporting ? "Importazione in corso..." : "Importazione conclusa"} — {siteProgress.letti}/{siteQuante} letti
              </p>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <span className="text-emerald-700">Importati: <strong>{siteProgress.importati}</strong></span>
                <span className="text-blue-700">Aggiornati: <strong>{siteProgress.aggiornati}</strong></span>
                <span className="text-slate-600">Saltati: <strong>{siteProgress.saltati}</strong></span>
                <span className="text-amber-700">Da riprovare: <strong>{siteProgress.lettureFallite}</strong></span>
              </div>

              {siteProgress.lettureFallite > 0 ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Alcune schede non si sono lasciate leggere: capita quando il sito rallenta. Non sono veicoli mancanti —
                  rilancia l&apos;importazione fra qualche minuto e verranno prese.
                </p>
              ) : null}

              {siteLog.length > 0 ? (
                <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {siteLog.map((riga, indice) => (
                    <p key={`${riga}-${indice}`} className="text-xs text-slate-600">{riga}</p>
                  ))}
                </div>
              ) : null}

              {!siteImporting && siteProgress.importati > 0 ? (
                <Link
                  href="/veicoli"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Vai a vedere i veicoli importati
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "dms" ? (
        <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">Collegamento Gestionale</h3>
          <p className="mt-1 text-sm text-slate-600">Prossimamente sarà possibile collegare direttamente il gestionale della concessionaria.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "DealerK",
              "Infinity",
              "EVO",
              "AutoScout",
              "FTP",
              "API REST",
              "SOAP",
              "XML Feed",
              "JSON Feed",
              "CSV Feed",
            ].map((name) => (
              <article key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{name}</p>
                <span className="mt-2 inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">Coming Soon</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-slate-500" />
          <h3 className="text-base font-semibold text-slate-900">Ultime sincronizzazioni</h3>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Origine</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Veicoli importati</th>
                <th className="px-3 py-2 font-semibold">Errori</th>
                <th className="px-3 py-2 font-semibold">Durata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-sm text-slate-500">
                    Nessuna sincronizzazione disponibile.
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2">{new Date(entry.created_at).toLocaleString("it-IT")}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.source}</td>
                    <td className="px-3 py-2 uppercase">{entry.source_type}</td>
                    <td className="px-3 py-2">{entry.imported_count}</td>
                    <td className="px-3 py-2">{entry.error_count}</td>
                    <td className="px-3 py-2">{formatDuration(entry.duration_ms)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DealerDashboardShell>
  );
}
