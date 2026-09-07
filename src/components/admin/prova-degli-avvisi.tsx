"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * "Gli avvisi funzionano ancora?", con un bottone.
 *
 * Dal di fuori la raccolta errori e' invisibile: l'unica prova sarebbe
 * aspettare che qualcosa si rompa sul serio. Una raccolta che nessuno prova
 * e' una raccolta di cui non ci si fida, e su cui quindi non si conta.
 *
 * Questo riquadro dice se e' accesa e sa mandare un errore finto per
 * verificare tutta la catena, dal server fino all'email di avviso.
 */

type Stato = {
  configurata: boolean;
  ambiente: string;
  versione: string | null;
};

async function conCredenziali() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : null;
}

export function ProvaDegliAvvisi() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    void (async () => {
      const intestazioni = await conCredenziali();
      if (!intestazioni) {
        if (vivo) setCaricamento(false);
        return;
      }

      const risposta = await fetch("/api/admin/prova-avvisi", { headers: intestazioni, cache: "no-store" });
      if (!vivo) return;

      if (risposta.ok) setStato((await risposta.json()) as Stato);
      setCaricamento(false);
    })();

    return () => {
      vivo = false;
    };
  }, []);

  const inviaLaProva = useCallback(async () => {
    setInCorso(true);
    setEsito(null);

    const intestazioni = await conCredenziali();
    if (!intestazioni) {
      setEsito("Sessione non valida: esci e rientra.");
      setInCorso(false);
      return;
    }

    const risposta = await fetch("/api/admin/prova-avvisi", { method: "POST", headers: intestazioni });
    const contenuto = (await risposta.json().catch(() => ({}))) as { messaggio?: string; error?: string };

    setEsito(contenuto.messaggio ?? contenuto.error ?? "Non e' stato possibile inviare la prova.");
    setInCorso(false);
  }, []);

  if (caricamento) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Controllo la raccolta errori...
      </section>
    );
  }

  const accesa = stato?.configurata === true;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Raccolta errori</p>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
            accesa ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          {accesa ? "ACCESA" : "SPENTA"}
        </span>
        {accesa
          ? "Gli errori del server arrivano su Sentry."
          : "Manca SENTRY_DSN fra le variabili d'ambiente su Vercel, oppure e' stata aggiunta senza rilanciare la pubblicazione."}
      </p>

      {stato ? (
        <p className="mt-2 text-xs text-slate-500">
          Ambiente: {stato.ambiente}
          {stato.versione ? ` · versione ${stato.versione}` : null}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void inviaLaProva()}
        disabled={inCorso}
        className="mt-4 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {inCorso ? "Invio in corso..." : "Manda un errore di prova"}
      </button>

      {esito ? <p className="mt-3 text-sm text-slate-700">{esito}</p> : null}
    </section>
  );
}
