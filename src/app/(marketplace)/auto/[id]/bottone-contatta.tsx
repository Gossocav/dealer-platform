"use client";

import { useEffect, useState } from "react";

/**
 * Il pulsante fisso in basso che porta al modulo di contatto.
 *
 * **Perche' esiste.** Il 20/09/2026 l'ordine della scheda e' cambiato:
 * guarda, capisce, contatta. Il modulo e' sceso **sotto** la descrizione e
 * la scheda tecnica, perche' chiedere a qualcuno di scrivere prima di
 * avergli mostrato cosa compra e' fuori ordine. Cosi' pero' il modulo
 * comincia piu' in basso di prima, e chi ha gia' deciso dopo le foto non
 * deve scorrere tutto per trovarlo.
 *
 * **Perche' compare e sparisce.** Un pulsante fisso che resta li' anche
 * quando il modulo e' a schermo **copre il modulo stesso** -- cioe' copre
 * proprio la cosa a cui dice di portare, e sul telefono copre l'ultimo
 * campo o il bottone "Invia". E' il modo piu' rapido di annullare il lavoro
 * fatto sul modulo il 19/09. Quindi appare solo quando il modulo e' fuori
 * dallo schermo, e sparisce appena rientra.
 *
 * **Perche' con JavaScript, qui.** Il resto della pagina evita di
 * dipenderne, ma "il modulo e' visibile adesso?" e' una domanda che solo il
 * browser puo' rispondere. Senza JavaScript il pulsante **non compare** e
 * la pagina resta intera: si scorre e si arriva al modulo, come prima.
 */
export function BottoneContatta({ ancora }: { ancora: string }) {
  const [daMostrare, setDaMostrare] = useState(false);

  useEffect(() => {
    const modulo = document.getElementById(ancora);
    if (!modulo) return;

    const osservatore = new IntersectionObserver(
      ([voce]) => {
        // Si nasconde appena **una parte** del modulo entra: aspettare che
        // sia tutto dentro vorrebbe dire tenerlo acceso sopra le prime
        // righe del modulo, che e' il caso che si vuole evitare.
        setDaMostrare(!voce.isIntersecting);
      },
      // Il margine in basso spegne il pulsante un po' **prima** che il
      // modulo tocchi il bordo: cosi' non c'e' l'istante in cui si vedono
      // tutti e due sovrapposti.
      { rootMargin: "0px 0px -120px 0px" },
    );
    osservatore.observe(modulo);
    return () => osservatore.disconnect();
  }, [ancora]);

  return (
    <div
      // `pointer-events-none` mentre e' spento: un rettangolo invisibile in
      // fondo allo schermo intercetterebbe i tocchi sulla pagina sotto.
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-4 transition-opacity duration-200 lg:hidden ${
        daMostrare ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      // Chi non lo vede non lo deve nemmeno sentire: il modulo e' comunque
      // nella pagina, poco piu' sotto.
      aria-hidden={!daMostrare}
    >
      <a
        href={`#${ancora}`}
        tabIndex={daMostrare ? undefined : -1}
        className="flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3.5 text-base font-bold text-slate-950 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
      >
        Richiedi informazioni
      </a>
    </div>
  );
}
