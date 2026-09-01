import Link from "next/link";
import { DEMO_LIMITS } from "@/lib/demo-access";

/**
 * L'invito a provare, in fondo alla pagina di ogni piano.
 *
 * **E' il punto in cui il concessionario decide se scriverti**, e fino al
 * 01/09/2026 diceva "Registrazione diretta disattivata". Era vero -- non
 * esiste l'iscrizione fai-da-te, l'account nasce dalla demo che il titolare
 * approva -- ma raccontato dal lato sbagliato: parlava di una cosa nostra che
 * abbiamo spento, e a chi legge suonava come un guasto o un servizio sospeso.
 * La stessa cosa detta dal lato di chi legge e' un pregio: si prova prima di
 * pagare.
 *
 * I due pulsanti sono gli stessi di prima, ed erano l'unico modo che un
 * concessionario ha di farsi vivo: la prova per chi e' pronto, le informazioni
 * per chi vuole solo una risposta.
 *
 * **La durata e i limiti non si scrivono a mano.** Sette giorni e' quello che
 * concede il database (`interval '7 days'` in `demo_rpc_core`), e i dieci
 * veicoli vengono da `DEMO_LIMITS`: un numero copiato qui invecchierebbe da
 * solo il giorno che quei valori cambiano, ed e' esattamente il difetto che
 * ha appena prodotto quattro funzioni promesse e mai esistite.
 */

/** I giorni che il database concede a una demo appena attivata. */
export const GIORNI_DI_PROVA = 7;

type Props = {
  /** Serve solo a far arrivare la richiesta gia' con il piano scelto. */
  planCode: "base" | "pro" | "elite";
  planName: string;
};

export function InvitoAllaProva({ planCode, planName }: Props) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
      <h2 className="text-2xl font-semibold text-white">
        Si comincia con una prova gratuita di {GIORNI_DI_PROVA} giorni
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
        Non paghi niente per iniziare. Richiedi la prova, la attiviamo noi, e per {GIORNI_DI_PROVA} giorni usi la
        piattaforma con le tue automobili vere &mdash; fino a {DEMO_LIMITS.vehicles} veicoli pubblicati. Se ti convince,
        passi al piano {planName}; se non ti convince, non succede altro.
      </p>
      <Link
        href={`/demo?piano=${planCode}`}
        className="mt-5 inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white"
      >
        Richiedi la prova gratuita
      </Link>
      {/* Per chi non e' ancora pronto a provare e vuole soltanto una
          risposta: senza questa strada se ne andava senza chiedere niente. */}
      <Link
        href="#richiedi-informazioni"
        className="mt-5 ml-0 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:ml-3"
      >
        Richiedi informazioni
      </Link>
    </section>
  );
}
