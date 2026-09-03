"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { SCADENZE_VEICOLO, urgenza } from "@/lib/promemoria";
import { supabase } from "@/lib/supabaseClient";

type RigaScadenza = { id: string; tipo: string | null; scade_il: string };

/**
 * Le scadenze di una vettura: revisione, assicurazione, tagliando, garanzia.
 *
 * Si scrivono qui e non nella pagina dei promemoria perche' qui si sa gia' di
 * quale automobile si parla: scriverle altrove vorrebbe dire cercare la
 * vettura in una tendina di trecento voci, ogni volta.
 *
 * Sotto ogni data la schermata dice cosa significa -- "Scaduto il 12/03/2026 —
 * 6 giorni fa" -- perche' una data in una casella non allarma nessuno.
 * Cancellando la data si toglie il promemoria: e' il gesto che uno si aspetta,
 * e un promemoria di una revisione gia' fatta e' rumore.
 *
 * **Il bollo non e' qui**: sta nel conto economico, dove e' anche una spesa. Due
 * posti dove scrivere la stessa scadenza divergerebbero al primo che ne
 * corregge uno solo.
 */
export function RiquadroScadenze({ vehicleId, dealerId }: { vehicleId: string; dealerId: string | null }) {
  const [righe, setRighe] = useState<RigaScadenza[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [ricarica, setRicarica] = useState(0);

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      if (!dealerId) {
        if (vivo) setCaricamento(false);
        return;
      }

      const letto = await supabase
        .from("promemoria")
        .select("id, tipo, scade_il")
        .eq("dealer_id", dealerId)
        .eq("vehicle_id", vehicleId)
        .eq("stato", "aperto")
        .returns<RigaScadenza[]>();

      if (!vivo) return;

      if (letto.error) {
        setErrore("Non e stato possibile leggere le scadenze.");
        setCaricamento(false);
        return;
      }

      setRighe(letto.data ?? []);
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [vehicleId, dealerId, ricarica]);

  if (caricamento || !dealerId) return null;

  const scrivi = async (tipo: string, data: string) => {
    setInCorso(tipo);
    setErrore(null);

    const esistente = righe.find((riga) => riga.tipo === tipo);

    // Cancellare la data toglie il promemoria: e' il gesto che uno si aspetta,
    // e una revisione gia' fatta non deve continuare ad avvisare.
    const esito = !data
      ? esistente
        ? await supabase.from("promemoria").delete().eq("id", esistente.id).eq("dealer_id", dealerId)
        : { error: null }
      : esistente
        ? await supabase.from("promemoria").update({ scade_il: data }).eq("id", esistente.id).eq("dealer_id", dealerId)
        : await supabase.from("promemoria").insert({
            dealer_id: dealerId,
            vehicle_id: vehicleId,
            tipo,
            scade_il: data,
          });

    setInCorso(null);

    if (esito.error) {
      setErrore("Non e stato possibile salvare la scadenza.");
      return;
    }

    setRicarica((n) => n + 1);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-slate-500" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Scadenze</p>
      </div>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Scrivi quando scadono: te le ritrovi fra i promemoria, e ogni mattina nell&apos;email del giorno. Il bollo si
        scrive nel conto economico, dove e&apos; anche una spesa.
      </p>

      {errore ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCADENZE_VEICOLO.map((scadenza) => {
          const riga = righe.find((voce) => voce.tipo === scadenza.valore);
          const quanto = urgenza(riga?.scade_il);

          return (
            <label key={scadenza.valore} className="block">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {scadenza.etichetta}
                {inCorso === scadenza.valore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              </span>
              <input
                type="date"
                value={riga?.scade_il ?? ""}
                onChange={(evento) => void scrivi(scadenza.valore, evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              />
              {quanto ? (
                <span
                  className={`mt-1 block text-xs font-medium ${
                    quanto.scaduto ? "text-red-700" : quanto.oggi || quanto.giorni <= 30 ? "text-amber-700" : "text-slate-500"
                  }`}
                >
                  {quanto.etichetta}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}
