import type { LucideIcon } from "lucide-react";
import { dimensioneCifra } from "@/lib/cifre";

/**
 * Il riquadro di un numero: etichetta, cifra, e un'icona che lo fa
 * riconoscere a colpo d'occhio.
 *
 * **La cifra si adatta alla larghezza** invece di essere sempre della stessa
 * misura. Nelle Statistiche "Valore totale parco auto" usciva dal bordo del
 * riquadro appena il piazzale superava il milione: sette cifre piu' il
 * simbolo, scritte grandi come "251". Un numero tagliato a meta' e' peggio di
 * un numero assente, perche' chi guarda ne legge una parte e la scambia per
 * il totale.
 */

type Accento = "blu" | "verde" | "ambra" | "viola" | "rosa" | "grigio";

type MetricCardProps = {
  label: string;
  value: string;
  /** La riga sotto: quanto e' cambiato, o cosa c'e' dentro il numero. */
  delta?: string;
  tone?: "positive" | "neutral";
  icon: LucideIcon;
  /** Il colore dell'icona. Serve a raggruppare a occhio i riquadri parenti. */
  accent?: Accento;
};

const ACCENTI: Record<Accento, string> = {
  blu: "bg-blue-100 text-blue-700",
  verde: "bg-emerald-100 text-emerald-700",
  ambra: "bg-amber-100 text-amber-700",
  viola: "bg-violet-100 text-violet-700",
  rosa: "bg-rose-100 text-rose-700",
  grigio: "bg-slate-100 text-slate-700",
};

export function MetricCard({ label, value, delta, tone = "neutral", icon: Icon, accent = "blu" }: MetricCardProps) {
  return (
    <article className="dashboard-fade-up flex flex-col justify-between rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-18px_rgba(15,23,42,0.38)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          {/* `break-words` e la misura variabile lavorano insieme: la prima
              impedisce lo sbordo, la seconda evita che per non sbordare la
              cifra vada a capo in mezzo alle migliaia. */}
          <p className={`mt-2 break-words font-semibold tabular-nums leading-tight text-slate-900 ${dimensioneCifra(value)}`}>
            {value}
          </p>
        </div>
        <span className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl ${ACCENTI[accent]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {delta ? (
        <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.14em] ${tone === "positive" ? "text-emerald-600" : "text-slate-500"}`}>
          {delta}
        </p>
      ) : null}
    </article>
  );
}
