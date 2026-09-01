"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { nomeDelPiano, pianoMinimoPer, spiegazioneFunzioneChiusa, type FunzioneDiPiano } from "@/lib/funzioni-per-piano";

/**
 * Quello che legge chi apre una funzione che il suo piano non comprende.
 *
 * **Dice cosa fa la funzione, non solo che e' chiusa.** Una schermata che
 * scrive "non disponibile con il tuo piano" lascia il concessionario a
 * indovinare cosa si sta perdendo, e quella non e' una porta chiusa: e'
 * un'occasione di vendita buttata. Qui c'e' la frase che spiega la funzione,
 * il nome del piano che la comprende, e il collegamento per guardarlo.
 *
 * Il testo sta in `funzioni-per-piano.ts` insieme alle soglie: la stessa
 * funzione si puo' raggiungere da piu' punti -- il conto economico da sei --
 * e sei spiegazioni scritte a mano direbbero sei cose leggermente diverse.
 */

type Props = {
  funzione: FunzioneDiPiano;
  /** Il titolo della funzione, come si chiama nel menu. */
  titolo: string;
  /** Dove si torna, se si torna. */
  tornaA?: string;
  etichettaRitorno?: string;
};

export function FunzioneNonCompresa({ funzione, titolo, tornaA, etichettaRitorno = "Torna indietro" }: Props) {
  const minimo = nomeDelPiano(pianoMinimoPer(funzione));

  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-8">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
        <Lock className="h-5 w-5" />
      </span>

      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{titolo}</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-900">Compresa nel {minimo}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{spiegazioneFunzioneChiusa(funzione)}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/abbonamento"
          className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Guarda i piani
        </Link>
        {tornaA ? (
          <Link
            href={tornaA}
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {etichettaRitorno}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/**
 * La stessa cosa, ma su una pagina che non ha il guscio del gestionale
 * intorno: le stampe si aprono da sole, senza menu.
 */
export function PaginaFunzioneNonCompresa(props: Props) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-200 px-4 py-10">
      <div className="w-full max-w-xl">
        <FunzioneNonCompresa {...props} />
      </div>
    </main>
  );
}
