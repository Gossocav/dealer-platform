"use client";

import { clearStoredConsent, getMeasurementId } from "@/lib/cookie-consent";

/**
 * Come si cambia idea.
 *
 * Un consenso che non si puo' ritirare con la stessa facilita' con cui si e'
 * dato non e' un consenso valido: questo collegamento cancella la scelta e fa
 * ricomparire la richiesta.
 */
export function CookiePreferencesLink() {
  if (!getMeasurementId()) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => clearStoredConsent()}
      className="text-left text-sm text-slate-400 transition hover:text-white"
    >
      Preferenze cookie
    </button>
  );
}
