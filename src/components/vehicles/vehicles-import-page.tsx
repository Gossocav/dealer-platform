"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
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
  const [dealerName, setDealerName] = useState("Dealer Console");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<VehicleImportRawRow[]>([]);
  const [mapping, setMapping] = useState<VehicleImportColumnMapping>(() => buildInitialVehicleImportMapping([]));
  const [initialStatus, setInitialStatus] = useState<VehicleImportStatus>("draft");
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  useEffect(() => {
    let alive = true;

    const fetchDealerName = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
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

  return (
    <DealerDashboardShell title="Importa Veicoli" dealerName={dealerName} avatarInitials="DC" unreadNotifications={3}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Bulk Import</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Importazione Massiva Veicoli</h2>
            <p className="mt-2 text-sm text-slate-600">Carica file CSV o Excel, valida i dati e importa in Supabase con dealer associato.</p>
          </div>

          <Link
            href="/veicoli"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Torna ai veicoli
          </Link>
        </div>
      </section>

      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <h3 className="text-base font-semibold text-slate-900">1. Carica file</h3>
        <p className="mt-1 text-sm text-slate-600">Formati supportati: .csv, .xlsx, .xls</p>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-sky-300 hover:bg-sky-50/50">
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
                  <th className="px-3 py-2 font-semibold">Cliente</th>
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
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">
                      {row.mapped.brand || "-"} {row.mapped.model || ""}
                    </td>
                    <td className="px-3 py-2">{row.mapped.year || "-"}</td>
                    <td className="px-3 py-2">{row.mapped.price || "-"}</td>
                    <td className="px-3 py-2">
                      {row.errors.length === 0 ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Valida</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">{row.errors.join(", ")}</span>
                      )}
                    </td>
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
    </DealerDashboardShell>
  );
}
