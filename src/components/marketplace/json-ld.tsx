import { serializeJsonLd, type JsonLdObject } from "@/lib/structured-data";

/**
 * Il blocco che consegna i dati strutturati a Google.
 *
 * Il contenuto passa sempre da serializeJsonLd, che neutralizza la sequenza
 * con cui una descrizione scritta dal concessionario potrebbe chiudere il tag
 * e far eseguire codice al browser di chi legge.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return (
    <script
      type="application/ld+json"
      // Il contenuto e' gia' reso innocuo da serializeJsonLd.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
