"use client";

import { useSyncExternalStore } from "react";
import {
  CONSENT_UNKNOWN,
  clearStoredConsent,
  getMeasurementId,
  readClientConsent,
  readServerConsent,
  subscribeToConsent,
} from "@/lib/cookie-consent";

/**
 * Come si cambia idea.
 *
 * Un consenso che non si puo' ritirare con la stessa facilita' con cui si e'
 * dato non e' un consenso valido: questo collegamento cancella la scelta e fa
 * ricomparire la richiesta.
 *
 * Nasce nel browser come il banner, e per lo stesso motivo: dentro l'HTML
 * conservato sparirebbe insieme al resto su chi riceve una copia vecchia, e
 * resterebbe senza il modo di revocare.
 */
export function CookiePreferencesLink() {
  const consenso = useSyncExternalStore(subscribeToConsent, readClientConsent, readServerConsent);

  if (consenso === CONSENT_UNKNOWN || !getMeasurementId()) {
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
