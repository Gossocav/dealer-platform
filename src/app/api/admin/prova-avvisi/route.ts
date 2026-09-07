import { NextResponse } from "next/server";
import { contestoAmministratore } from "@/lib/admin-api-context";
import { indirizzoDiRaccolta } from "@/lib/sentry-config";
import { segnalaErrore } from "@/lib/segnala-errore";

/**
 * "Gli avvisi funzionano ancora?"
 *
 * Chiesto dal titolare il 07/09/2026, subito dopo aver configurato la
 * raccolta errori: non aveva modo di sapere se stesse funzionando davvero, e
 * nemmeno io -- dal di fuori la raccolta e' invisibile, e l'unica prova
 * sarebbe aspettare che qualcosa si rompa sul serio.
 *
 * Serve adesso per la prova, e servira' fra sei mesi quando verra' il dubbio.
 * Una raccolta errori che nessuno prova e' una raccolta di cui non ci si
 * fida, e su cui quindi non si conta: tanto vale non averla.
 *
 * **L'indirizzo di raccolta non esce mai da qui.** Si risponde solo `true` o
 * `false`: e' un segreto, e sapere *se* c'e' basta a rispondere alla domanda.
 * Anche cosi', l'endpoint e' riservato all'amministratore -- un estraneo che
 * potesse chiamarlo saprebbe se la piattaforma si accorge dei guasti, che e'
 * esattamente cio' che gli servirebbe sapere prima di provocarne uno.
 */

export const dynamic = "force-dynamic";

/** GET: com'e' messa la raccolta, senza toccare niente. */
export async function GET(request: Request) {
  const contesto = await contestoAmministratore(request);
  if (contesto.errore) return contesto.errore;

  return NextResponse.json(
    {
      configurata: indirizzoDiRaccolta() !== null,
      ambiente: process.env.VERCEL_ENV || process.env.NODE_ENV || "sconosciuto",
      versione: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    },
    { status: 200 }
  );
}

/** POST: provoca un errore finto, per vedere se arriva. */
export async function POST(request: Request) {
  const contesto = await contestoAmministratore(request);
  if (contesto.errore) return contesto.errore;

  const configurata = indirizzoDiRaccolta() !== null;

  // Un errore vero, con la sua traccia di esecuzione: cosi' la prova
  // assomiglia a un guasto vero invece che a una riga di testo.
  const finto = new Error(
    `Prova degli avvisi richiesta dal pannello alle ${new Date().toISOString()}. Non e' un guasto.`
  );
  finto.name = "ProvaDegliAvvisi";

  segnalaErrore("admin/prova-avvisi", finto, { prova: true });

  return NextResponse.json(
    {
      inviata: configurata,
      configurata,
      messaggio: configurata
        ? "Errore di prova inviato. Compare su Sentry entro un minuto, con il nome ProvaDegliAvvisi."
        : "La raccolta non e' configurata: manca SENTRY_DSN fra le variabili d'ambiente, oppure e' stata aggiunta senza rilanciare la pubblicazione.",
    },
    { status: 200 }
  );
}
