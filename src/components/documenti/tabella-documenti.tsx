"use client";

import { Trash2 } from "lucide-react";
import { SECCHIO_DOCUMENTI, etichettaTipoDocumento, pesoLeggibile } from "@/lib/archivio-documenti";
import { supabase } from "@/lib/supabaseClient";

export type RigaDocumento = {
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

export const COLONNE_DOCUMENTO =
  "id, dealer_id, vehicle_id, vehicle_plate, vehicle_label, doc_type, title, notes, document_date, storage_path, file_name, size_bytes, created_at";

export function dataLeggibile(valore: string | null) {
  if (!valore) return "-";
  const quando = new Date(valore);
  return Number.isNaN(quando.getTime()) ? valore : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(quando);
}

/**
 * L'elenco dei documenti, con i due comandi che servono: aprire ed eliminare.
 *
 * Sta in un componente suo perche' compare in due schermate -- dentro una
 * vettura, e dentro il gruppo di una vettura che non esiste piu' -- e due
 * copie divergerebbero al primo comando aggiunto.
 */
export function TabellaDocumenti({
  documenti,
  onErrore,
  onCambiato,
}: {
  documenti: readonly RigaDocumento[];
  onErrore: (messaggio: string) => void;
  onCambiato: () => void;
}) {
  const apri = async (documento: RigaDocumento) => {
    // L'indirizzo si firma al momento e dura un minuto: un collegamento al
    // documento di un cliente non deve restare valido dentro una cronologia.
    const firmato = await supabase.storage.from(SECCHIO_DOCUMENTI).createSignedUrl(documento.storage_path, 60);

    if (firmato.error || !firmato.data?.signedUrl) {
      onErrore("Non e stato possibile aprire il documento.");
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
      onErrore("Non e stato possibile eliminare il documento.");
      return;
    }

    // Il file si toglie dopo la riga: se fallisce resta un file che non si
    // vede, mentre il contrario lascerebbe in elenco un documento che non si
    // apre piu'.
    await supabase.storage.from(SECCHIO_DOCUMENTI).remove([documento.storage_path]);
    onCambiato();
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
            <th className="py-3 pr-4 font-semibold">Documento</th>
            <th className="py-3 pr-4 font-semibold">Tipo</th>
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
                {documento.notes?.trim() ? (
                  <span className="mt-0.5 block text-xs text-slate-500">{documento.notes}</span>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-slate-600">{etichettaTipoDocumento(documento.doc_type)}</td>
              <td className="py-3 pr-4 text-slate-600">{dataLeggibile(documento.document_date)}</td>
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
  );
}
