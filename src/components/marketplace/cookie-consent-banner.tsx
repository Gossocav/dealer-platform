"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  CONSENT_UNKNOWN,
  getMeasurementId,
  readClientConsent,
  readServerConsent,
  storeConsent,
  subscribeToConsent,
  type ConsentChoice,
} from "@/lib/cookie-consent";

/**
 * La richiesta di consenso, prima che parta qualsiasi misurazione.
 *
 * Due regole che il disegno rispetta e che non sono estetica:
 * - rifiutare deve costare quanto accettare, quindi due bottoni uguali e
 *   nessuna X che equivale a un si';
 * - finche' non si e' scelto non parte niente, quindi niente "continuando a
 *   navigare acconsenti".
 */
export function CookieConsentBanner() {
  // Il server risponde "non lo so" e quindi non disegna niente: la richiesta
  // nasce nel browser, che la memoria della scelta ce l'ha davvero. Senza
  // questo il banner finirebbe dentro l'HTML conservato, e chi riceve una
  // copia vecchia non lo vedrebbe mai -- e' esattamente quello che e'
  // successo in home.
  const consenso = useSyncExternalStore(subscribeToConsent, readClientConsent, readServerConsent);

  // Senza strumento configurato non c'e' niente da consentire: chiedere il
  // permesso per qualcosa che non esiste sarebbe solo un ostacolo in piu'.
  if (consenso === CONSENT_UNKNOWN || consenso !== null || !getMeasurementId()) {
    return null;
  }

  const scegli = (choice: ConsentChoice) => storeConsent(choice);

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Consenso ai cookie di misurazione"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-slate-950/95 px-4 py-5 backdrop-blur sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-300">
          Usiamo cookie tecnici, necessari al funzionamento del sito. Con il tuo consenso useremo anche cookie di
          misurazione, per capire quali pagine sono utili e migliorarle.{" "}
          <Link href="/privacy" className="text-cyan-300 underline underline-offset-4 hover:text-cyan-200">
            Informativa privacy
          </Link>
        </p>

        <div className="flex flex-none gap-3">
          <button
            type="button"
            onClick={() => scegli("rifiutato")}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 sm:flex-none"
          >
            Rifiuta
          </button>
          <button
            type="button"
            onClick={() => scegli("accettato")}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:brightness-105 sm:flex-none"
          >
            Accetta
          </button>
        </div>
      </div>
    </div>
  );
}
