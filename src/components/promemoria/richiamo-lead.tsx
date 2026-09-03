"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, PhoneCall } from "lucide-react";
import { oggiIso, urgenza } from "@/lib/promemoria";
import { supabase } from "@/lib/supabaseClient";

type Richiamo = { id: string; scade_il: string; note: string | null };

/**
 * "Richiamare questa lead il...".
 *
 * Chiesto dal titolare il 03/09/2026 insieme agli altri promemoria. Sta sulla
 * scheda della lead e non nella pagina dei promemoria per lo stesso motivo per
 * cui le scadenze stanno sulla scheda della vettura: qui si sa gia' chi si deve
 * richiamare, e sceglierlo da una tendina di duecento nomi non lo saprebbe
 * fare nessuno.
 *
 * E' un promemoria come tutti gli altri -- finisce nello stesso elenco e nella
 * stessa email del mattino -- solo creato da qui, gia' agganciato alla lead.
 */
export function RichiamoLead({ leadId, dealerId }: { leadId: string; dealerId: string | null }) {
  const [richiamo, setRichiamo] = useState<Richiamo | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [ricarica, setRicarica] = useState(0);
  const [quando, setQuando] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      if (!dealerId) {
        if (vivo) setCaricamento(false);
        return;
      }

      const letto = await supabase
        .from("promemoria")
        .select("id, scade_il, note")
        .eq("dealer_id", dealerId)
        .eq("lead_id", leadId)
        .eq("tipo", "richiamo_lead")
        .eq("stato", "aperto")
        .maybeSingle<Richiamo>();

      if (!vivo) return;

      if (letto.error) {
        setErrore("Non e stato possibile leggere il richiamo.");
        setCaricamento(false);
        return;
      }

      setRichiamo(letto.data ?? null);
      setQuando(letto.data?.scade_il ?? "");
      setNote(letto.data?.note ?? "");
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [leadId, dealerId, ricarica]);

  if (caricamento || !dealerId) return null;

  const salva = async () => {
    if (!quando) {
      setErrore("Scegli il giorno: senza data non ti ricorda niente.");
      return;
    }

    setInCorso(true);
    setErrore(null);

    const esito = richiamo
      ? await supabase
          .from("promemoria")
          .update({ scade_il: quando, note: note.trim() || null })
          .eq("id", richiamo.id)
          .eq("dealer_id", dealerId)
      : await supabase.from("promemoria").insert({
          dealer_id: dealerId,
          lead_id: leadId,
          tipo: "richiamo_lead",
          scade_il: quando,
          note: note.trim() || null,
        });

    setInCorso(false);

    if (esito.error) {
      setErrore("Non e stato possibile salvare il richiamo.");
      return;
    }

    setRicarica((n) => n + 1);
  };

  const fatto = async () => {
    if (!richiamo) return;

    setInCorso(true);
    const esito = await supabase
      .from("promemoria")
      .update({ stato: "fatto", fatto_il: new Date().toISOString() })
      .eq("id", richiamo.id)
      .eq("dealer_id", dealerId);
    setInCorso(false);

    if (esito.error) {
      setErrore("Non e stato possibile segnarlo come fatto.");
      return;
    }

    setQuando("");
    setNote("");
    setRicarica((n) => n + 1);
  };

  const quanto = urgenza(richiamo?.scade_il);

  return (
    <section
      className={`rounded-2xl border p-5 ${quanto?.scaduto ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-slate-500" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Richiamo</p>
      </div>

      {richiamo ? (
        <p className={`mt-2 text-sm font-semibold ${quanto?.scaduto ? "text-amber-900" : "text-slate-800"}`}>
          Da richiamare: {quanto?.etichetta ?? richiamo.scade_il}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Segnati quando richiamarlo: lo ritrovi fra i{" "}
          <Link href="/promemoria" className="font-semibold underline-offset-2 hover:underline">
            promemoria
          </Link>{" "}
          e nell&apos;email del mattino.
        </p>
      )}

      {errore ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errore}</p> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Quando</span>
          <input
            type="date"
            value={quando}
            min={oggiIso()}
            onChange={(evento) => setQuando(evento.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nota</span>
          <input
            type="text"
            value={note}
            onChange={(evento) => setNote(evento.target.value)}
            placeholder="Es. gli mando il preventivo prima"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void salva()}
            disabled={inCorso}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {richiamo ? "Aggiorna" : "Ricordamelo"}
          </button>

          {richiamo ? (
            <button
              type="button"
              onClick={() => void fatto()}
              disabled={inCorso}
              title="Segna come fatto"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              Fatto
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
