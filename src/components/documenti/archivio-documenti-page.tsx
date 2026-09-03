"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Paperclip } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { COLONNE_DOCUMENTO, TabellaDocumenti, type RigaDocumento } from "@/components/documenti/tabella-documenti";
import { getActiveDealerId } from "@/lib/active-tenant";
import {
  DIMENSIONE_MASSIMA_BYTE,
  SECCHIO_DOCUMENTI,
  TIPI_DOCUMENTO,
  motivoRifiutoFile,
  percorsoDocumento,
} from "@/lib/archivio-documenti";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { resizeImageForUpload } from "@/lib/image-resize";
import { supabase } from "@/lib/supabaseClient";

/**
 * I documenti di **una** vettura: libretto, contratti, preventivi, fatture.
 *
 * E' qui che si archivia, e non nell'archivio generale: un documento riguarda
 * sempre un'automobile, e chiedere "di quale vettura?" dopo aver scelto il
 * file sarebbe una domanda in piu' a ogni caricamento. L'archivio generale
 * (`/documenti`) serve a **trovare** la vettura, non a caricare.
 *
 * Funziona in qualunque stato si trovi la vettura, venduta compresa: il
 * libretto si archivia il giorno che l'auto arriva, il contratto il giorno che
 * esce, e tutti e due restano dopo.
 */
export function ArchivioDocumentiPage({ vehicleId }: { vehicleId: string }) {
  const [documenti, setDocumenti] = useState<RigaDocumento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [vettura, setVettura] = useState<{ etichetta: string; targa: string | null } | null>(null);
  const [ricarica, setRicarica] = useState(0);

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

      const elenco = await caricaTutto<RigaDocumento>((da, a) =>
        supabase
          .from("vehicle_documents")
          .select(COLONNE_DOCUMENTO)
          .eq("dealer_id", idConcessionaria)
          .eq("vehicle_id", vehicleId)
          .order("document_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(da, a)
          .returns<RigaDocumento[]>()
      );

      if (!vivo) return;

      if (elenco.error) {
        setErrore("Non e stato possibile leggere i documenti della vettura.");
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
  }, [vehicleId, ricarica]);

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
      // chilobyte per leggerlo. Se il browser non ce la fa si carica
      // l'originale, invece di far fallire l'archiviazione.
      const daCaricare = file.type.startsWith("image/") ? await resizeImageForUpload(file) : file;

      const motivo = motivoRifiutoFile({ name: file.name, size: daCaricare.size, type: daCaricare.type });

      if (motivo) {
        scartati.push(motivo);
        continue;
      }

      const percorso = percorsoDocumento(dealerId, vehicleId, file.name);

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
        vehicle_id: vehicleId,
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

  return (
    <DealerDashboardShell title="Documenti della vettura">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/veicoli/${vehicleId}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alla scheda
        </Link>
        <Link href="/documenti" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          Archivio documenti
        </Link>
      </div>

      <section className="dashboard-fade-up mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {vettura?.targa ? vettura.targa : "Vettura"}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{vettura?.etichetta ?? "Documenti"}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Libretto, contratti, preventivi, fatture. Si archiviano in qualunque stato si trovi la vettura, e restano anche
          dopo la vendita.
        </p>

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
          </p>
        </div>

        {avviso ? (
          <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{avviso}</p>
        ) : null}
        {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

        {caricamento ? (
          <p className="mt-6 text-sm text-slate-600">Caricamento documenti...</p>
        ) : documenti.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <FileText className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold text-slate-900">Nessun documento per questa vettura</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
              Comincia dal libretto: fotografalo col telefono e caricalo qui sopra. Resta archiviato anche quando la
              vettura sara&apos; venduta.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <TabellaDocumenti documenti={documenti} onErrore={setErrore} onCambiato={() => setRicarica((n) => n + 1)} />
          </div>
        )}
      </section>
    </DealerDashboardShell>
  );
}
