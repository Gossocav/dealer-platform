"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Paperclip, Search, Trash2, X } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import {
  DIMENSIONE_MASSIMA_BYTE,
  SECCHIO_DOCUMENTI,
  TIPI_DOCUMENTO,
  condizioneTestoLibero,
  etichettaTipoDocumento,
  motivoRifiutoFile,
  normalizzaFiltriDocumenti,
  percorsoDocumento,
  pesoLeggibile,
  ricercaDocumentiInCorso,
  type FiltriDocumenti,
} from "@/lib/archivio-documenti";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { resizeImageForUpload } from "@/lib/image-resize";
import { perRicercaParziale } from "@/lib/ricerca-testo";
import { supabase } from "@/lib/supabaseClient";

type RigaDocumento = {
  id: string;
  dealer_id: string;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_label: string | null;
  doc_type: string | null;
  title: string | null;
  notes: string | null;
  document_date: string | null;
  storage_path: string;
  file_name: string | null;
  size_bytes: number | null;
  created_at: string;
};

const COLONNE =
  "id, dealer_id, vehicle_id, vehicle_plate, vehicle_label, doc_type, title, notes, document_date, storage_path, file_name, size_bytes, created_at";

const MODULO_VUOTO = { targa: "", tipo: "", dal: "", al: "", testo: "" };

type ModuloRicerca = typeof MODULO_VUOTO;

function data(valore: string | null) {
  if (!valore) return "-";
  const quando = new Date(valore);
  return Number.isNaN(quando.getTime()) ? valore : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(quando);
}

/**
 * L'archivio dei documenti.
 *
 * Lo stesso componente serve due schermate: l'archivio di tutta la
 * concessionaria (`/documenti`) e quello di una singola vettura
 * (`/veicoli/[id]/documenti`). Sono la stessa cosa vista da due distanze, e
 * due componenti gemelli sarebbero divergiti al primo campo aggiunto.
 *
 * **I documenti restano anche quando la vettura non c'e' piu'.** Il legame si
 * spezza, la targa resta scritta sulla riga, e il documento si continua a
 * trovare cercandola. E' il requisito che il titolare ha dichiarato per primo.
 */
export function ArchivioDocumentiPage({ vehicleId }: { vehicleId?: string }) {
  const perVettura = Boolean(vehicleId);

  const [documenti, setDocumenti] = useState<RigaDocumento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [vettura, setVettura] = useState<{ etichetta: string; targa: string | null } | null>(null);
  const [ricarica, setRicarica] = useState(0);

  const [modulo, setModulo] = useState<ModuloRicerca>(MODULO_VUOTO);
  const [filtri, setFiltri] = useState<FiltriDocumenti>({});

  // Il modulo di caricamento: tipo e note si scelgono prima, cosi' valgono per
  // tutti i file scelti insieme. Un concessionario che archivia il libretto
  // fotografa quattro pagine e le carica in blocco.
  const [tipoScelto, setTipoScelto] = useState("libretto");
  const [dataDocumento, setDataDocumento] = useState("");
  const [titolo, setTitolo] = useState("");
  const [inCaricamento, setInCaricamento] = useState(false);

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

      const idConcessionaria = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!vivo) return;

      if (!idConcessionaria) {
        setErrore("Concessionaria non associata all'utente.");
        setCaricamento(false);
        return;
      }

      setDealerId(idConcessionaria);

      if (vehicleId) {
        const letta = await supabase
          .from("vehicles")
          .select("brand, model, version, plate")
          .eq("id", vehicleId)
          .eq("dealer_id", idConcessionaria)
          .maybeSingle<{ brand: string | null; model: string | null; version: string | null; plate: string | null }>();

        if (!vivo) return;

        if (letta.data) {
          const etichetta = [letta.data.brand, letta.data.model, letta.data.version]
            .map((p) => String(p ?? "").trim())
            .filter(Boolean)
            .join(" ");
          setVettura({ etichetta: etichetta || "Vettura", targa: letta.data.plate });
        }
      }

      const elenco = await caricaTutto<RigaDocumento>((da, a) => {
        let interrogazione = supabase
          .from("vehicle_documents")
          .select(COLONNE)
          .eq("dealer_id", idConcessionaria);

        if (vehicleId) interrogazione = interrogazione.eq("vehicle_id", vehicleId);
        if (filtri.targa) interrogazione = interrogazione.ilike("vehicle_plate", perRicercaParziale(filtri.targa));
        if (filtri.tipo) interrogazione = interrogazione.eq("doc_type", filtri.tipo);
        if (filtri.dal) interrogazione = interrogazione.gte("document_date", filtri.dal);
        if (filtri.al) interrogazione = interrogazione.lte("document_date", filtri.al);
        if (filtri.testo) interrogazione = interrogazione.or(condizioneTestoLibero(filtri.testo));

        return interrogazione
          .order("document_date", { ascending: false, nullsFirst: false })
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
  }, [vehicleId, filtri, ricarica]);

  const archivia = async (files: FileList | null) => {
    if (!files || files.length === 0 || !dealerId) return;

    setInCaricamento(true);
    setErrore(null);
    setAvviso(null);

    const scartati: string[] = [];
    let archiviati = 0;

    for (const file of Array.from(files)) {
      // Le fotografie si rimpiccioliscono prima di partire: un libretto
      // fotografato col telefono pesa quattro megabyte e ne bastano trecento
      // chilobyte per leggerlo. Se il browser non ce la fa, si carica
      // l'originale invece di far fallire l'archiviazione.
      const daCaricare = file.type.startsWith("image/") ? await resizeImageForUpload(file) : file;

      const motivo = motivoRifiutoFile({ name: file.name, size: daCaricare.size, type: daCaricare.type });

      if (motivo) {
        scartati.push(motivo);
        continue;
      }

      const percorso = percorsoDocumento(dealerId, vehicleId ?? null, file.name);

      const caricato = await supabase.storage.from(SECCHIO_DOCUMENTI).upload(percorso, daCaricare, {
        cacheControl: "3600",
        upsert: false,
        contentType: daCaricare.type,
      });

      if (caricato.error) {
        scartati.push(`"${file.name}" non e stato caricato: ${caricato.error.message}`);
        continue;
      }

      const scritto = await supabase.from("vehicle_documents").insert({
        dealer_id: dealerId,
        vehicle_id: vehicleId ?? null,
        doc_type: tipoScelto,
        title: titolo.trim() || null,
        document_date: dataDocumento || null,
        storage_path: percorso,
        file_name: file.name,
        mime_type: daCaricare.type,
        size_bytes: daCaricare.size,
      });

      if (scritto.error) {
        // Il file e' salito ma la riga no: senza riga il documento non
        // comparirebbe da nessuna parte e resterebbe a occupare spazio.
        await supabase.storage.from(SECCHIO_DOCUMENTI).remove([percorso]);
        scartati.push(`"${file.name}" non e stato archiviato: ${scritto.error.message}`);
        continue;
      }

      archiviati += 1;
    }

    setInCaricamento(false);
    setTitolo("");

    if (archiviati > 0) {
      setAvviso(`${archiviati} ${archiviati === 1 ? "documento archiviato" : "documenti archiviati"}.`);
      setRicarica((n) => n + 1);
    }

    if (scartati.length > 0) setErrore(scartati.join(" "));
  };

  const apri = async (documento: RigaDocumento) => {
    // L'indirizzo si firma al momento e dura un minuto: un collegamento a un
    // documento di un cliente non deve restare valido in una cronologia.
    const firmato = await supabase.storage.from(SECCHIO_DOCUMENTI).createSignedUrl(documento.storage_path, 60);

    if (firmato.error || !firmato.data?.signedUrl) {
      setErrore("Non e stato possibile aprire il documento.");
      return;
    }

    window.open(firmato.data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const elimina = async (documento: RigaDocumento) => {
    if (!window.confirm(`Eliminare "${documento.file_name ?? "questo documento"}"? Non si recupera.`)) return;

    const cancellata = await supabase
      .from("vehicle_documents")
      .delete()
      .eq("id", documento.id)
      .eq("dealer_id", documento.dealer_id);

    if (cancellata.error) {
      setErrore("Non e stato possibile eliminare il documento.");
      return;
    }

    // Il file si toglie dopo la riga: se fallisce resta un file orfano che non
    // si vede, mentre il contrario lascerebbe in elenco un documento che non
    // si apre piu'.
    await supabase.storage.from(SECCHIO_DOCUMENTI).remove([documento.storage_path]);
    setRicarica((n) => n + 1);
  };

  const titoloPagina = perVettura ? "Documenti della vettura" : "Archivio documenti";

  return (
    <DealerDashboardShell title={titoloPagina}>
      {perVettura ? (
        <Link
          href={`/veicoli/${vehicleId}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alla scheda
        </Link>
      ) : null}

      <section className="dashboard-fade-up mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {perVettura ? "Vettura" : "Archivio"}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">
          {perVettura ? vettura?.etichetta ?? "Documenti" : "I documenti delle tue vetture"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {perVettura
            ? "Libretto, contratti, preventivi, fatture. Restano qui anche dopo la vendita."
            : "Tutti i documenti archiviati, anche quelli di vetture che non hai piu' in piazzale: quando una vettura viene cancellata i suoi documenti restano, e si ritrovano cercando la targa."}
        </p>

        {/* Il caricamento sta in cima e non in fondo: si arriva qui per
            archiviare, e cercare viene dopo. */}
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipo</span>
              <select
                value={tipoScelto}
                onChange={(evento) => setTipoScelto(evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {TIPI_DOCUMENTO.map((tipo) => (
                  <option key={tipo.valore} value={tipo.valore}>
                    {tipo.etichetta}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data del documento</span>
              <input
                type="date"
                value={dataDocumento}
                onChange={(evento) => setDataDocumento(evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Titolo (facoltativo)</span>
              <input
                type="text"
                value={titolo}
                onChange={(evento) => setTitolo(evento.target.value)}
                placeholder="Es. Contratto Rossi"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
          </div>

          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
            {inCaricamento ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {inCaricamento ? "Sto archiviando..." : "Scegli i file"}
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={inCaricamento || !dealerId}
              onChange={(evento) => {
                void archivia(evento.target.files);
                evento.target.value = "";
              }}
              className="hidden"
            />
          </label>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            PDF, JPG, PNG o WEBP, fino a {Math.round(DIMENSIONE_MASSIMA_BYTE / 1024 / 1024)} MB per file. Puoi sceglierne
            piu&apos; di uno insieme: le fotografie vengono rimpicciolite da sole.
            {perVettura ? "" : " Qui i documenti si archiviano senza vettura: per legarli a una, aprila e usa il suo archivio."}
          </p>
        </div>

        {!perVettura ? (
          <form
            className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(evento) => {
              evento.preventDefault();
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
        ) : null}

        {avviso ? (
          <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{avviso}</p>
        ) : null}
        {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

        {caricamento ? (
          <p className="mt-6 text-sm text-slate-600">Caricamento archivio...</p>
        ) : documenti.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <FileText className="h-6 w-6" />
            </span>
            {ricercaDocumentiInCorso(filtri) ? (
              <>
                <p className="mt-4 font-semibold text-slate-900">Nessun documento con questi filtri</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  Quelli archiviati sono al loro posto: e&apos; questa ricerca a non trovarne. Prova con una parte della
                  targa, o allarga il periodo.
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 font-semibold text-slate-900">Nessun documento, per ora</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  Comincia dal libretto: fotografalo col telefono e caricalo qui sopra. Resta archiviato anche quando la
                  vettura sara&apos; venduta.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Documento</th>
                  <th className="py-3 pr-4 font-semibold">Tipo</th>
                  {perVettura ? null : <th className="py-3 pr-4 font-semibold">Vettura</th>}
                  <th className="py-3 pr-4 font-semibold">Data</th>
                  <th className="py-3 pr-4 font-semibold">Peso</th>
                  <th className="py-3 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documenti.map((documento) => (
                  <tr key={documento.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-slate-900">
                        {documento.title?.trim() || documento.file_name || "Documento"}
                      </span>
                      {documento.title?.trim() && documento.file_name ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{documento.file_name}</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{etichettaTipoDocumento(documento.doc_type)}</td>
                    {perVettura ? null : (
                      <td className="py-3 pr-4 text-slate-600">
                        {documento.vehicle_plate ? (
                          <>
                            <span className="font-medium text-slate-800">{documento.vehicle_plate}</span>
                            {documento.vehicle_label ? (
                              <span className="mt-0.5 block text-xs text-slate-500">{documento.vehicle_label}</span>
                            ) : null}
                            {/* La vettura cancellata si dice, invece di lasciare
                                credere che la scheda sia ancora apribile. */}
                            {documento.vehicle_id ? null : (
                              <span className="mt-0.5 block text-xs text-amber-700">vettura non piu&apos; in archivio</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">senza vettura</span>
                        )}
                      </td>
                    )}
                    <td className="py-3 pr-4 text-slate-600">{data(documento.document_date)}</td>
                    <td className="py-3 pr-4 text-slate-600">{pesoLeggibile(documento.size_bytes)}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void apri(documento)}
                          className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                        >
                          Apri
                        </button>
                        <button
                          type="button"
                          onClick={() => void elimina(documento)}
                          title="Elimina"
                          className="text-slate-400 transition hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DealerDashboardShell>
  );
}
