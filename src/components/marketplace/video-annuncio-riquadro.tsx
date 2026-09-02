"use client";

import { useState } from "react";

/**
 * Il video dell'annuncio, che si carica solo se il visitatore lo apre.
 *
 * Il difetto trovato in revisione il 02/09/2026: il riquadro era un `iframe`
 * disegnato insieme alla pagina, quindi la richiesta a Google partiva da sola,
 * prima di qualunque scelta sui cookie. Il dominio senza cookie non profila
 * chi non preme play -- quella parte era giusta -- ma l'indirizzo IP del
 * visitatore e la pagina che sta guardando arrivavano a Google lo stesso, e la
 * nostra informativa non nomina YouTube.
 *
 * Cosi' invece non parte niente finche' non si preme: prima c'e' solo un
 * rettangolo disegnato da noi. E' anche il motivo per cui il rettangolo non
 * mostra l'anteprima del video: quell'immagine sta sui server di Google, e
 * chiederla vorrebbe dire rifare esattamente la richiesta che stiamo evitando.
 *
 * L'alternativa scartata era mettere YouTube nel banner dei cookie, fra le
 * cose da accettare: una scelta in piu' da fare a ogni visita, per un riquadro
 * che la maggior parte dei visitatori non apre.
 */
export function VideoAnnuncioRiquadro({ indirizzo, titolo }: { indirizzo: string; titolo: string }) {
  const [aperto, setAperto] = useState(false);

  if (aperto) {
    return (
      <iframe
        // `autoplay=1` perche' il clic sul rettangolo e' gia' la richiesta di
        // guardarlo: senza, si dovrebbe premere play una seconda volta.
        src={`${indirizzo}&autoplay=1`}
        title={titolo}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="h-full w-full border-0"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAperto(true)}
      aria-label={`Guarda ${titolo}`}
      className="group flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-800 to-black transition hover:from-slate-700"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 transition group-hover:bg-white/20">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-1 h-6 w-6 fill-white">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="text-sm font-semibold text-white">Guarda il video</span>
      <span className="px-6 text-center text-xs leading-5 text-slate-400">
        Si apre su YouTube dentro questa pagina. Finche&apos; non lo apri, nessun dato parte.
      </span>
    </button>
  );
}
