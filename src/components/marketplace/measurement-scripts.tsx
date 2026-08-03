"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { getMeasurementId, readClientConsent, readServerConsent, subscribeToConsent } from "@/lib/cookie-consent";

/**
 * Lo strumento di misura, caricato solo dopo un si' esplicito.
 *
 * Non usa la "modalita' consenso" di Google, che carica comunque lo script e
 * gli dice di comportarsi bene: qui, finche' la risposta non arriva, allo
 * strumento non viene chiesto nemmeno di scaricarsi. E' la lettura piu'
 * prudente, ed e' quella coerente con l'informativa.
 *
 * Se NEXT_PUBLIC_GA_MEASUREMENT_ID non e' configurato non succede niente:
 * questo codice puo' stare in produzione prima ancora di aver deciso quale
 * strumento usare.
 */
export function MeasurementScripts() {
  const measurementId = getMeasurementId();
  const consenso = useSyncExternalStore(subscribeToConsent, readClientConsent, readServerConsent);

  if (!measurementId || consenso !== "accettato") {
    return null;
  }

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="keyauto-misurazione" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
