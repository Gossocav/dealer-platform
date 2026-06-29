"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FileSpreadsheet, Link2, Loader2, UploadCloud } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { resolveDealerIdForUser } from "@/lib/dealer-association";
import { supabase } from "@/lib/supabaseClient";
import {
  buildInitialVehicleImportMapping,
  buildVehicleInsertPayload,
  getVehicleImportFieldLabel,
  getVehicleImportFields,
  mapVehicleImportRow,
  parseVehicleImportFile,
  type VehicleImportColumnMapping,
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

type TabId = "file" | "feed" | "dms";

type FeedFormatOption = "auto" | "csv" | "xml" | "json";
type FeedFrequencyOption = "manual" | "nightly" | "weekly";

type FeedAnalysisPreview = {
  rowNumber: number;
  brand: string;
  model: string;
  version: string;
  year: string;
  price: string;
  status: string;
  images: string[];
  errors: string[];
};

type FeedAnalysisResult = {
  format: "csv" | "xml" | "json";
  vehicleCount: number;
  errorCount: number;
  preview: FeedAnalysisPreview[];
};

type FeedImportResult = FeedAnalysisResult & {
  importedCount: number;
  skippedCount: number;
  errors: string[];
  durationMs: number;
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

type PreviewRow = {
  rowNumber: number;
  mapped: VehicleImportMappedRow;
  errors: string[];
};

const IMPORT_FIELDS = getVehicleImportFields();

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
    const { color: _color, ...payloadWithoutColor } = vehiclePayload;
    const { error: retryError } = await supabase.from("vehicles").insert(payloadWithoutColor);
    return retryError ?? null;
  }

  return error;
}

export function VehiclesImportPage() {
  const [activeTab, setActiveTab] = useState<TabId>("file");
  const [dealerName, setDealerName] = useState("Dealer Console");
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<VehicleImportRawRow[]>([]);
  const [mapping, setMapping] = useState<VehicleImportColumnMapping>(() => buildInitialVehicleImportMapping([]));
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
  }, []);

  const loadSyncHistory = async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? sessionToken;
    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/vehicles/import-feed", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { history?: FeedHistoryItem[] };
      setHistory(Array.isArray(payload.history) ? payload.history : []);
    } catch {
      // Best effort: keep UI usable even without history.
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

    setLoadingFile(true);
    setError(null);
    setReport(null);

    try {
      const parsed = await parseVehicleImportFile(file);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(buildInitialVehicleImportMapping(parsed.headers));
    } catch (parseError) {
      setFileName(null);
      setHeaders([]);
      setRows([]);
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
      dealerId = await resolveDealerIdForUser(userId);
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

      const payload = buildVehicleInsertPayload(mappedRow, initialStatus);

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
    if (!sessionToken) {
      setFeedError("Sessione non valida. Effettua di nuovo il login.");
      return;
    }

    setFeedLoading(true);
    setFeedError(null);
    setFeedImportResult(null);

    try {
      const response = await fetch("/api/vehicles/import-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          mode: "analyze",
          feedUrl,
          format: feedFormat,
          status: feedVehicleStatus,
          frequency: feedFrequency,
        }),
      });

      const payload = (await response.json()) as FeedAnalysisResult & { error?: string };
      if (!response.ok) {
        setFeedError(payload.error ?? "Errore durante analisi feed.");
        setFeedAnalysis(null);
        return;
      }

      setFeedAnalysis({
        format: payload.format,
        vehicleCount: payload.vehicleCount,
        errorCount: payload.errorCount,
        preview: payload.preview,
      });
    } catch {
      setFeedError("Errore di rete durante analisi feed.");
      setFeedAnalysis(null);
    } finally {
      setFeedLoading(false);
    }
  };

  const handleImportFeed = async () => {
    if (!sessionToken) {
      setFeedError("Sessione non valida. Effettua di nuovo il login.");
      return;
    }

    setFeedImporting(true);
    setFeedError(null);

    try {
      const response = await fetch("/api/vehicles/import-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          mode: "import",
          feedUrl,
          format: feedFormat,
          status: feedVehicleStatus,
          frequency: feedFrequency,
        }),
      });

      const payload = (await response.json()) as FeedImportResult & { error?: string };
      if (!response.ok) {
        setFeedError(payload.error ?? "Errore durante importazione feed.");
        return;
      }

      setFeedImportResult(payload);
      setFeedAnalysis({
        format: payload.format,
        vehicleCount: payload.vehicleCount,
        errorCount: payload.errorCount,
        preview: payload.preview,
      });
      await loadSyncHistory();
    } catch {
      setFeedError("Errore di rete durante importazione feed.");
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
    <div className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-3">
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
    <DealerDashboardShell title="Sincronizzazione Stock" dealerName={dealerName} avatarInitials="DC" unreadNotifications={3}>
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
            <p className="mt-1 text-sm text-slate-600">Formati supportati: .csv, .xlsx, .xls</p>

            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-sky-50/50 p-8 text-center transition hover:border-sky-300 hover:from-white hover:to-sky-50">
              <UploadCloud className="h-8 w-8 text-sky-600" />
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
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
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

              <div className="mt-4 max-w-xs space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stato iniziale</span>
                <select
                  value={initialStatus}
                  onChange={(event) => setInitialStatus(event.target.value as VehicleImportStatus)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
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
                  disabled={!feedUrl.trim() || feedImporting}
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
                    Formato rilevato: <strong>{feedAnalysis.format.toUpperCase()}</strong> · Veicoli: <strong>{feedAnalysis.vehicleCount}</strong> · Errori: <strong>{feedAnalysis.errorCount}</strong>
                  </p>
                </div>
                {feedImportResult ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Importati {feedImportResult.importedCount} · Saltati {feedImportResult.skippedCount} · Durata {formatDuration(feedImportResult.durationMs)}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Riga</th>
                      <th className="px-3 py-2 font-semibold">Veicolo</th>
                      <th className="px-3 py-2 font-semibold">Anno</th>
                      <th className="px-3 py-2 font-semibold">Prezzo</th>
                      <th className="px-3 py-2 font-semibold">Immagini</th>
                      <th className="px-3 py-2 font-semibold">Esito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {feedAnalysis.preview.map((entry) => (
                      <tr key={entry.rowNumber}>
                        <td className="px-3 py-2 text-slate-500">{entry.rowNumber}</td>
                        <td className="px-3 py-2">
                          {entry.brand || "-"} {entry.model || ""} {entry.version ? `(${entry.version})` : ""}
                        </td>
                        <td className="px-3 py-2">{entry.year || "-"}</td>
                        <td className="px-3 py-2">{entry.price || "-"}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{entry.images.length > 0 ? `${entry.images.length} URL` : "Placeholder"}</td>
                        <td className="px-3 py-2">{statusBadge(entry.errors)}</td>
                      </tr>
                    ))}
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
