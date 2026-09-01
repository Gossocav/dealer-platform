"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { useVenditeDellaConcessionaria } from "@/components/dashboard/vendite-della-concessionaria";
import { PaginaFunzioneNonCompresa } from "@/components/dashboard/funzione-non-compresa";
import { pianoComprende } from "@/lib/funzioni-per-piano";
import { usePianoInVigore } from "@/lib/use-piano-in-vigore";
import { formattaImporto } from "@/lib/conto-economico";
import {
  anniConVendite,
  annoCorrente,
  meseDi,
  nomeBreveDelMese,
  riepilogoAnnuale,
} from "@/lib/statistiche-margine";

/**
 * Il conto economico dell'anno, su carta.
 *
 * E' la pagina Vendite senza il gestionale intorno: la tabella dei mesi e
 * l'elenco delle vetture vendute, su A4. I numeri arrivano dallo stesso
 * aggancio della pagina a schermo, non da un'interrogazione copiata: due
 * letture separate sarebbero divergute, e il foglio consegnato al
 * commercialista avrebbe detto una cifra diversa dallo schermo.
 *
 * L'anno viaggia nell'indirizzo perche' questa pagina non condivide lo stato
 * con quella da cui si arriva. Se manca, si stampa l'anno corrente.
 *
 * **Il totale comprende solo le vetture con il conto completo**, ed e' scritto
 * sul foglio: quelle senza restano nell'elenco, segnate, invece di sparire.
 * Un conto stampato che non dice cosa ha lasciato fuori e' un conto di cui non
 * ci si puo' fidare.
 */

export function SalesReportPrintPage() {
  const searchParams = useSearchParams();
  const { vendite, dealerName, caricamento, errore } = useVenditeDellaConcessionaria();
  const { planCode, caricamento: caricamentoPiano } = usePianoInVigore();

  const anno = useMemo(() => {
    const chiesto = String(searchParams.get("anno") ?? "").trim();
    if (/^\d{4}$/.test(chiesto)) return chiesto;
    // Senza un anno valido nell'indirizzo si stampa quello corrente, a meno
    // che non abbia vendite: allora l'ultimo che ne ha, come fa la pagina a
    // schermo. Un foglio vuoto sembrerebbe un guasto.
    const anni = anniConVendite(vendite);
    if (anni.length > 0 && !anni.includes(annoCorrente())) return anni[0];
    return annoCorrente();
  }, [searchParams, vendite]);

  const { mesi, totale } = useMemo(() => riepilogoAnnuale(vendite, anno), [vendite, anno]);

  const elencate = useMemo(
    () =>
      vendite
        .filter((v) => (meseDi(v.saleDate) ?? "").startsWith(anno))
        .sort((a, b) => String(a.saleDate ?? "").localeCompare(String(b.saleDate ?? ""))),
    [vendite, anno]
  );

  if (caricamento || caricamentoPiano) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-200 text-sm text-slate-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparo il conto...
      </main>
    );
  }

  if (!pianoComprende(planCode, "vendite")) {
    return <PaginaFunzioneNonCompresa funzione="vendite" titolo="Conto economico dell'anno" tornaA="/dashboard" etichettaRitorno="Torna al pannello" />;
  }

  if (errore) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-200">
        <div className="rounded-2xl bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-800">{errore}</p>
          <Link href="/vendite" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Torna alle vendite
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4">
        <Link href="/vendite" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          ← Torna alle vendite
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />
          Stampa
        </button>
      </div>

      <article className="vehicle-sheet mx-auto flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white p-[14mm] text-slate-900 shadow-lg print:min-h-0 print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-4">
          <p className="text-lg font-bold uppercase tracking-[0.2em]">{dealerName || "Concessionaria"}</p>
          <p className="text-lg font-black tracking-tight">KEYAUTO</p>
        </header>

        <div className="sheet-block mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conto economico</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">Anno {anno}</h1>
        </div>

        {mesi.length === 0 ? (
          <div className="sheet-block mt-8 border-2 border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm font-semibold">Nel {anno} non risulta venduta nessuna vettura.</p>
          </div>
        ) : (
          <>
            <div className="sheet-block mt-8">
              <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.14em]">Mese per mese</h2>
              <table className="mt-3 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-400 text-left uppercase tracking-[0.08em] text-slate-600">
                    <th className="pb-1 pr-2">Mese</th>
                    <th className="pb-1 pr-2 text-right">Vendute</th>
                    <th className="pb-1 pr-2 text-right">Venduto</th>
                    <th className="pb-1 pr-2 text-right">Costo</th>
                    <th className="pb-1 pr-2 text-right">Margine</th>
                    <th className="pb-1 text-right">Marginalita</th>
                  </tr>
                </thead>
                <tbody>
                  {mesi.map((riga) => (
                    <tr key={riga.mese} className="border-b border-slate-100">
                      <td className="py-1 pr-2 capitalize">{nomeBreveDelMese(riga.mese)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {riga.venduti}
                        {riga.senzaConto > 0 ? <span className="text-slate-500"> ({riga.senzaConto}*)</span> : null}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formattaImporto(riga.ricavo)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formattaImporto(riga.costo)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums font-semibold">{formattaImporto(riga.margine)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {riga.marginePercentuale === null ? "—" : `${riga.marginePercentuale.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-bold">
                    <td className="pt-2 pr-2">Totale {anno}</td>
                    <td className="pt-2 pr-2 text-right tabular-nums">{totale.venduti}</td>
                    <td className="pt-2 pr-2 text-right tabular-nums">{formattaImporto(totale.ricavo)}</td>
                    <td className="pt-2 pr-2 text-right tabular-nums">{formattaImporto(totale.costo)}</td>
                    <td className="pt-2 pr-2 text-right tabular-nums">{formattaImporto(totale.margine)}</td>
                    <td className="pt-2 text-right tabular-nums">
                      {totale.marginePercentuale === null ? "—" : `${totale.marginePercentuale.toFixed(1)}%`}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {totale.senzaConto > 0 ? (
                <p className="mt-2 text-[10px] leading-4 text-slate-600">
                  * Venduto, costo e margine comprendono solo le vetture con il conto completo. Le{" "}
                  <strong>{totale.senzaConto}</strong> segnate con l&apos;asterisco sono vendute davvero, ma senza prezzo di
                  acquisto o di vendita: restano fuori dai totali invece di entrarci come zero.
                </p>
              ) : null}
            </div>

            <div className="mt-8">
              <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.14em]">
                Le vetture vendute nel {anno} ({elencate.length})
              </h2>
              <table className="mt-3 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-400 text-left uppercase tracking-[0.08em] text-slate-600">
                    <th className="pb-1 pr-2">Vettura</th>
                    <th className="pb-1 pr-2">Targa o telaio</th>
                    <th className="pb-1 pr-2">Venduta il</th>
                    <th className="pb-1 pr-2 text-right">A</th>
                    <th className="pb-1 pr-2 text-right">Costo</th>
                    <th className="pb-1 text-right">Margine</th>
                  </tr>
                </thead>
                <tbody>
                  {elencate.map((vendita) => (
                    <tr key={vendita.vehicleId} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{vendita.etichetta}</td>
                      <td className="py-1 pr-2 uppercase">{vendita.targa ?? "—"}</td>
                      <td className="py-1 pr-2">{formattaData(vendita.saleDate)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formattaImporto(vendita.salePrice)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {vendita.totalCost === null ? "—" : formattaImporto(vendita.totalCost)}
                      </td>
                      <td className="py-1 text-right tabular-nums font-semibold">
                        {vendita.margin === null ? "da completare" : formattaImporto(vendita.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer className="mt-auto border-t border-slate-300 pt-4 text-[10px] leading-4 text-slate-500">
          <p className="font-semibold uppercase tracking-[0.14em]">Documento interno</p>
          <p className="mt-1">
            Stampato il {formattaData(oggi())}. Comprende le vetture in stato Venduto e Consegnato con data di vendita nel{" "}
            {anno}.
          </p>
        </footer>
      </article>
    </main>
  );
}

/** 12/08/2026, come la legge un italiano. */
function formattaData(valore: string | null): string {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valore ?? ""));
  return trovato ? `${trovato[3]}/${trovato[2]}/${trovato[1]}` : "—";
}

function oggi(): string {
  const adesso = new Date();
  return `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, "0")}-${String(adesso.getDate()).padStart(2, "0")}`;
}
