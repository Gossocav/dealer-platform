"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { useVenditeDellaConcessionaria, type Vendita } from "@/components/dashboard/vendite-della-concessionaria";
import { formattaImporto } from "@/lib/conto-economico";
import {
  anniConVendite,
  annoCorrente,
  meseDi,
  nomeBreveDelMese,
  riepilogoAnnuale,
  senzaDataDiVendita,
} from "@/lib/statistiche-margine";

/**
 * Tutte le vetture vendute, mese per mese, con il margine di ognuna.
 *
 * Le statistiche danno il conto di **un** mese; qui si vede l'anno intero e le
 * automobili una per una. E' la pagina che risponde a "come sta andando",
 * invece che a "quanto ho fatto ad agosto".
 *
 * **Si parte dai veicoli venduti, non dai conti economici.** Un'auto venduta
 * senza conto compilato e' comunque venduta: partendo dai conti sparirebbe
 * dall'elenco, e la pagina direbbe di aver venduto meno di quanto ha venduto.
 * Il conto, quando c'e', si aggancia; quando manca, la riga lo dice.
 */

export function SalesReportPage() {
  const { vendite, dealerName, caricamento, errore } = useVenditeDellaConcessionaria();
  const [annoScelto, setAnnoScelto] = useState<string | null>(null);
  const [meseScelto, setMeseScelto] = useState<string | null>(null);

  const anni = useMemo(() => anniConVendite(vendite), [vendite]);

  // Ci si apre sull'anno corrente, ma se non ha ancora vendite si mostra
  // l'ultimo che ne ha: una pagina vuota fa credere che non funzioni. Si
  // ricava invece di essere scritto in memoria, cosi' non c'e' un momento in
  // cui lo stato dice un anno e le vendite ne raccontano un altro.
  const anno = annoScelto ?? (anni.length > 0 && !anni.includes(annoCorrente()) ? anni[0] : annoCorrente());
  const { mesi, totale } = useMemo(() => riepilogoAnnuale(vendite, anno), [vendite, anno]);
  const orfane = useMemo(() => senzaDataDiVendita(vendite), [vendite]);

  const elencate = useMemo(() => {
    const dellAnno = vendite.filter((v) => (meseDi(v.saleDate) ?? "").startsWith(anno));
    const filtrate = meseScelto ? dellAnno.filter((v) => meseDi(v.saleDate) === meseScelto) : dellAnno;
    return [...filtrate].sort((a, b) => String(b.saleDate ?? "").localeCompare(String(a.saleDate ?? "")));
  }, [vendite, anno, meseScelto]);

  return (
    <DealerDashboardShell title="Vendite" dealerName={dealerName}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Vendite</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Le auto vendute e quanto hanno reso</h2>
          </div>

          <div className="flex flex-wrap items-end gap-3">
          {anni.length > 0 ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Anno</span>
              <select
                value={anno}
                onChange={(evento) => {
                  setAnnoScelto(evento.target.value);
                  setMeseScelto(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                {(anni.includes(anno) ? anni : [anno, ...anni]).map((voce) => (
                  <option key={voce} value={voce}>
                    {voce}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {/* Il conto su carta: stessa tabella, stesso anno, senza il
              gestionale intorno. Porta l'anno nell'indirizzo perche' la
              pagina di stampa non condivide lo stato con questa. */}
          <Link
            href={`/vendite/stampa?anno=${anno}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Stampa il conto
          </Link>
          </div>
        </div>
      </section>

      {errore ? <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</section> : null}

      {caricamento ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Sto raccogliendo le vendite...
        </section>
      ) : null}

      {!caricamento && vendite.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-800">Nessuna vettura risulta venduta.</p>
          <p className="mt-1">
            Le vetture diventano vendute quando le chiudi.{" "}
            <Link href="/veicoli/da-chiudere" className="font-semibold text-slate-900 underline">
              Vai a Da chiudere
            </Link>
            .
          </p>
        </section>
      ) : null}

      {!caricamento && mesi.length > 0 ? (
        <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
          <h3 className="text-lg font-semibold text-slate-900">Mese per mese</h3>
          <p className="mt-1 text-sm text-slate-500">Clicca un mese per vedere sotto solo quelle vetture.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <th className="pb-2 pr-4">Mese</th>
                  <th className="pb-2 pr-4 text-right">Vendute</th>
                  <th className="pb-2 pr-4 text-right">Venduto</th>
                  <th className="pb-2 pr-4 text-right">Costo</th>
                  <th className="pb-2 pr-4 text-right">Margine</th>
                  <th className="pb-2 text-right">Marginalita</th>
                </tr>
              </thead>
              <tbody>
                {mesi.map((riga) => (
                  <tr
                    key={riga.mese}
                    onClick={() => setMeseScelto(meseScelto === riga.mese ? null : riga.mese)}
                    className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${meseScelto === riga.mese ? "bg-slate-100" : ""}`}
                  >
                    <td className="py-2.5 pr-4 font-medium capitalize text-slate-900">{nomeBreveDelMese(riga.mese)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">
                      {riga.venduti}
                      {riga.senzaConto > 0 ? <span className="text-slate-400"> ({riga.senzaConto} da completare)</span> : null}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{formattaImporto(riga.ricavo)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{formattaImporto(riga.costo)}</td>
                    <td className={`py-2.5 pr-4 text-right font-semibold tabular-nums ${riga.margine >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {formattaImporto(riga.margine)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700">
                      {riga.marginePercentuale === null ? "—" : `${riga.marginePercentuale.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="pt-3 pr-4 text-slate-900">Totale {anno}</td>
                  <td className="pt-3 pr-4 text-right tabular-nums text-slate-900">{totale.venduti}</td>
                  <td className="pt-3 pr-4 text-right tabular-nums text-slate-900">{formattaImporto(totale.ricavo)}</td>
                  <td className="pt-3 pr-4 text-right tabular-nums text-slate-900">{formattaImporto(totale.costo)}</td>
                  <td className={`pt-3 pr-4 text-right tabular-nums ${totale.margine >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formattaImporto(totale.margine)}
                  </td>
                  <td className="pt-3 text-right tabular-nums text-slate-900">
                    {totale.marginePercentuale === null ? "—" : `${totale.marginePercentuale.toFixed(1)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {totale.senzaConto > 0 ? (
            <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
              Venduto e margine comprendono solo le vetture con il conto completo. Le{" "}
              <strong className="font-semibold text-slate-800">{totale.senzaConto}</strong> da completare stanno nell&apos;elenco
              qui sotto, segnate: apri la scheda e scrivi cosa manca per vederle in questi totali.
            </p>
          ) : null}
        </section>
      ) : null}

      {!caricamento && vendite.length > 0 ? (
        <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {meseScelto ? `Vendute a ${nomeBreveDelMese(meseScelto)}` : `Vendute nel ${anno}`}
              <span className="ml-2 text-sm font-normal text-slate-500">{elencate.length}</span>
            </h3>
            {meseScelto ? (
              <button type="button" onClick={() => setMeseScelto(null)} className="text-sm font-semibold text-slate-700 underline">
                Mostra tutto l&apos;anno
              </button>
            ) : null}
          </div>

          {elencate.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Nessuna vettura venduta in questo periodo.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <th className="pb-2 pr-4">Vettura</th>
                    <th className="pb-2 pr-4">Targa o telaio</th>
                    <th className="pb-2 pr-4">Venduta il</th>
                    <th className="pb-2 pr-4 text-right">A</th>
                    <th className="pb-2 pr-4 text-right">Costo</th>
                    <th className="pb-2 text-right">Margine</th>
                  </tr>
                </thead>
                <tbody>
                  {elencate.map((vendita) => (
                    <Riga key={vendita.vehicleId} vendita={vendita} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Le vendute senza data non appartengono a nessun mese e non
          comparirebbero mai: sono vendite vere, e vanno trovate per essere
          completate. */}
      {!caricamento && orfane.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h3 className="text-base font-semibold text-amber-900">
            {orfane.length === 1 ? "Una vettura venduta senza data" : `${orfane.length} vetture vendute senza data`}
          </h3>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            Senza data di vendita non appartengono a nessun mese e non entrano in nessun conto. Aprile e scrivi quando le hai
            vendute.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <tbody>
                {orfane.map((vendita) => (
                  <Riga key={vendita.vehicleId} vendita={vendita as Vendita} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </DealerDashboardShell>
  );
}

function Riga({ vendita }: { vendita: Vendita }) {
  const senzaConto = vendita.margin === null;

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2.5 pr-4">
        <Link href={`/veicoli/${vendita.vehicleId}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
          {vendita.etichetta}
        </Link>
      </td>
      <td className="py-2.5 pr-4 uppercase tracking-wide text-slate-600">{vendita.targa ?? "—"}</td>
      <td className="py-2.5 pr-4 text-slate-600">{formattaData(vendita.saleDate)}</td>
      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{formattaImporto(vendita.salePrice)}</td>
      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">
        {vendita.totalCost === null ? "—" : formattaImporto(vendita.totalCost)}
      </td>
      <td className="py-2.5 text-right">
        {senzaConto ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">da completare</span>
        ) : (
          <span className={`font-semibold tabular-nums ${(vendita.margin ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {formattaImporto(vendita.margin)}
          </span>
        )}
      </td>
    </tr>
  );
}

/** 12/08/2026, come la legge un italiano. */
function formattaData(valore: string | null): string {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valore ?? ""));
  return trovato ? `${trovato[3]}/${trovato[2]}/${trovato[1]}` : "—";
}
