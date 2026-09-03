"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, FolderOpen, Search, X } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { COLONNE_DOCUMENTO, TabellaDocumenti, dataLeggibile, type RigaDocumento } from "@/components/documenti/tabella-documenti";
import { getActiveDealerId } from "@/lib/active-tenant";
import {
  TIPI_DOCUMENTO,
  condizioneTestoLibero,
  etichettaTipoDocumento,
  normalizzaFiltriDocumenti,
  raggruppaPerVettura,
  ricercaDocumentiInCorso,
  type FiltriDocumenti,
} from "@/lib/archivio-documenti";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { perRicercaParziale } from "@/lib/ricerca-testo";
import { supabase } from "@/lib/supabaseClient";

const MODULO_VUOTO = { targa: "", tipo: "", dal: "", al: "", testo: "" };

type ModuloRicerca = typeof MODULO_VUOTO;

/**
 * L'archivio documenti: **le vetture**, non i documenti.
 *
 * La prima versione mostrava l'elenco piatto di tutti i documenti archiviati.
 * Il titolare, vedendola il 03/09/2026, ha chiesto il contrario: qui si
 * elencano le automobili che hanno almeno un documento, e i documenti si
 * guardano entrando nella vettura. E' come si cerca davvero -- "le carte della
 * Panda targata AB123CD", non "tutti i contratti che ho".
 *
 * La ricerca continua a lavorare **sui documenti** e non sulle vetture:
 * cercare "contratto di vendita" deve mostrare le automobili che ne hanno uno,
 * non quelle il cui nome contiene quella parola.
 *
 * Le vetture cancellate restano nell'elenco con la loro targa: non si puo'
 * entrare nella scheda -- non c'e' piu' -- e allora i documenti si aprono qui,
 * sotto la riga.
 */
export function VettureConDocumentiPage() {
  const [documenti, setDocumenti] = useState<RigaDocumento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [ricarica, setRicarica] = useState(0);
  const [apertoSenzaScheda, setApertoSenzaScheda] = useState<string | null>(null);

  const [modulo, setModulo] = useState<ModuloRicerca>(MODULO_VUOTO);
  const [filtri, setFiltri] = useState<FiltriDocumenti>({});

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!vivo) return;

      if (!userId) {
        setErrore("Sessione non valida. Effettua di nuovo l'accesso.");
        setCaricamento(false);
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!vivo) return;

      if (!dealerId) {
        setErrore("Concessionaria non associata all'utente.");
        setCaricamento(false);
        return;
      }

      const elenco = await caricaTutto<RigaDocumento>((da, a) => {
        let interrogazione = supabase.from("vehicle_documents").select(COLONNE_DOCUMENTO).eq("dealer_id", dealerId);

        if (filtri.targa) interrogazione = interrogazione.ilike("vehicle_plate", perRicercaParziale(filtri.targa));
        if (filtri.tipo) interrogazione = interrogazione.eq("doc_type", filtri.tipo);
        if (filtri.dal) interrogazione = interrogazione.gte("document_date", filtri.dal);
        if (filtri.al) interrogazione = interrogazione.lte("document_date", filtri.al);
        if (filtri.testo) interrogazione = interrogazione.or(condizioneTestoLibero(filtri.testo));

        return interrogazione
          .order("created_at", { ascending: false })
          .range(da, a)
          .returns<RigaDocumento[]>();
      });

      if (!vivo) return;

      if (elenco.error) {
        setErrore("Non e stato possibile leggere l'archivio documenti.");
        setCaricamento(false);
        return;
      }

      setDocumenti(elenco.righe);
      setErrore(null);
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [filtri, ricarica]);

  const vetture = raggruppaPerVettura(documenti);

  return (
    <DealerDashboardShell title="Archivio documenti">
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Archivio</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Le vetture con documenti archiviati</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Apri una vettura per vedere le sue carte. Restano qui anche dopo la vendita, e anche se la vettura viene
          cancellata: in quel caso si ritrovano cercando la targa.
        </p>

        <form
          className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(evento) => {
            evento.preventDefault();
            setApertoSenzaScheda(null);
            setFiltri(normalizzaFiltriDocumenti(modulo));
          }}
        >
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Targa</span>
            <input
              type="text"
              value={modulo.targa}
              onChange={(evento) => setModulo((m) => ({ ...m, targa: evento.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipo</span>
            <select
              value={modulo.tipo}
              onChange={(evento) => setModulo((m) => ({ ...m, tipo: evento.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Tutti</option>
              {TIPI_DOCUMENTO.map((tipo) => (
                <option key={tipo.valore} value={tipo.valore}>
                  {tipo.etichetta}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Dal</span>
            <input
              type="date"
              value={modulo.dal}
              onChange={(evento) => setModulo((m) => ({ ...m, dal: evento.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Al</span>
            <input
              type="date"
              value={modulo.al}
              onChange={(evento) => setModulo((m) => ({ ...m, al: evento.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cerca nel testo</span>
            <input
              type="text"
              value={modulo.testo}
              onChange={(evento) => setModulo((m) => ({ ...m, testo: evento.target.value }))}
              placeholder="Titolo, note, nome del file"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Search className="h-4 w-4" />
              Cerca
            </button>

            {ricercaDocumentiInCorso(filtri) ? (
              <button
                type="button"
                onClick={() => {
                  setModulo(MODULO_VUOTO);
                  setFiltri({});
                }}
                title="Azzera la ricerca"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 transition hover:border-slate-900 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </form>

        {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

        {caricamento ? (
          <p className="mt-6 text-sm text-slate-600">Caricamento archivio...</p>
        ) : vetture.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <FolderOpen className="h-6 w-6" />
            </span>
            {ricercaDocumentiInCorso(filtri) ? (
              <>
                <p className="mt-4 font-semibold text-slate-900">Nessuna vettura con questi filtri</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  I documenti archiviati sono al loro posto: e&apos; questa ricerca a non trovarne. Prova con una parte
                  della targa, o allarga il periodo.
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 font-semibold text-slate-900">Nessun documento archiviato, per ora</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  I documenti si caricano dalla scheda della vettura: aprine una e usa il pulsante{" "}
                  <strong>Documenti</strong>. Da qui poi le ritrovi tutte.
                </p>
                <Link
                  href="/veicoli"
                  className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Vai al parco auto
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100">
            {vetture.map((vettura) => {
              const aperta = apertoSenzaScheda === vettura.chiave;
              const suoi = documenti.filter((documento) => {
                const targa = String(documento.vehicle_plate ?? "").trim().toUpperCase() || null;
                const chiave = documento.vehicle_id ?? (targa ? `targa:${targa}` : "senza-vettura");
                return chiave === vettura.chiave;
              });

              const intestazione = (
                <>
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">
                      {vettura.targa ?? "Documenti senza vettura"}
                      {vettura.vehicleId ? null : (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          vettura non piu&apos; in archivio
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-600">
                      {vettura.etichetta ?? "—"} · {vettura.quanti}{" "}
                      {vettura.quanti === 1 ? "documento" : "documenti"} · ultimo{" "}
                      {dataLeggibile(vettura.ultimoCaricamento)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {vettura.tipi.map((tipo) => etichettaTipoDocumento(tipo)).join(" · ")}
                    </span>
                  </span>
                </>
              );

              return (
                <li key={vettura.chiave} className="py-3">
                  {vettura.vehicleId ? (
                    <Link
                      href={`/veicoli/${vettura.vehicleId}/documenti`}
                      className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-slate-50"
                    >
                      {intestazione}
                      <ChevronRight className="h-5 w-5 flex-none text-slate-400" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setApertoSenzaScheda(aperta ? null : vettura.chiave)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-slate-50"
                    >
                      {intestazione}
                      <ChevronRight
                        className={`h-5 w-5 flex-none text-slate-400 transition ${aperta ? "rotate-90" : ""}`}
                      />
                    </button>
                  )}

                  {aperta ? (
                    <div className="mt-2 rounded-2xl bg-slate-50 p-3">
                      <TabellaDocumenti
                        documenti={suoi}
                        onErrore={setErrore}
                        onCambiato={() => setRicarica((n) => n + 1)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </DealerDashboardShell>
  );
}
