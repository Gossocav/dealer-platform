"use client";

import { useState } from "react";
import { VehiclesImportPage } from "@/components/vehicles/vehicles-import-page";

type FeedType = "auto" | "csv" | "xml" | "json";

type FeedAnalysisResponse = {
  success?: boolean;
  message?: string;
  detectedType?: "csv" | "xml" | "json";
  rowsCount?: number;
  preview?: Array<Record<string, unknown> | string>;
};

export default function VehiclesImportRoutePage() {
  const [feedUrl, setFeedUrl] = useState("");
  const [feedType, setFeedType] = useState<FeedType>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FeedAnalysisResponse | null>(null);

  async function handleAnalyzeFeed() {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch("/api/vehicles/feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: feedUrl,
          type: feedType,
        }),
      });

      const data = (await response.json()) as FeedAnalysisResponse;

      if (!response.ok || data.success === false) {
        setError(data.message ?? "Errore durante l'analisi del feed");
        return;
      }

      setAnalysis(data);
    } catch {
      setError("Errore durante l'analisi del feed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <VehiclesImportPage />

      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">🌐 Importazione automatica</h2>
          <p className="mt-1 text-sm text-slate-600">Configura un feed per preparare la sincronizzazione del tuo stock veicoli.</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.8fr)_auto]">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">URL Feed</span>
            <input
              type="url"
              value={feedUrl}
              onChange={(event) => setFeedUrl(event.target.value)}
              placeholder="https://www.concessionaria.it/feed.xml"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tipo Feed</span>
            <select
              value={feedType}
              onChange={(event) => setFeedType(event.target.value as FeedType)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
            >
              <option value="auto">Automatico</option>
              <option value="csv">CSV</option>
              <option value="xml">XML</option>
              <option value="json">JSON</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                void handleAnalyzeFeed();
              }}
              disabled={loading}
              className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Analisi in corso..." : "Analizza Feed"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {analysis ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Formato rilevato</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{analysis.detectedType?.toUpperCase() ?? "-"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Veicoli trovati</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{analysis.rowsCount ?? 0}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Anteprima</p>
              <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
                {JSON.stringify(analysis.preview ?? [], null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
