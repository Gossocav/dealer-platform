"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Cosa si vede quando il marketplace non riesce a leggere i dati.
 *
 * Serve perche' la scheda veicolo ora distingue due casi che prima erano uno
 * solo: "questo veicolo non esiste" (404, con la sua schermata) e "il
 * database non risponde". Il secondo non deve dire che il veicolo e' sparito
 * -- il veicolo c'e', e' il servizio a essere giu' -- e non deve rispondere
 * "200 va tutto bene", perche' Google leggerebbe un guasto momentaneo come un
 * motivo per togliere la pagina dall'indice.
 *
 * Senza questo file al suo posto compariva la schermata di errore di serie di
 * Next: fondo bianco, in inglese, dentro un sito nero.
 */
export default function MarketplaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Marketplace render error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <section className="rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Marketplace</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Servizio momentaneamente non disponibile</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
            Non siamo riusciti a caricare questa pagina. Non dipende da te: riprova fra qualche istante.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
            >
              Riprova
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
            >
              Torna alla home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
