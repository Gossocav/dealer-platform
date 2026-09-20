import Link from "next/link";
import { Children, type ReactNode } from "react";
import {
  DEALER_SORT_OPTIONS,
  fraseConteggioVeicoli,
  type DealerFilterState,
} from "@/lib/dealer-vehicle-filters";
import { etichettaFiltra, filtriDaMostrareSubito } from "@/lib/filtri-richiudibili";

type OpzioniFiltri = {
  brands: string[];
  models: string[];
  bodyTypes: string[];
  conditions: string[];
  fuels: string[];
  transmissions: string[];
  years: string[];
};

type DealerVehicleSearchProps = {
  /** Le schede gia' disegnate dal server, nell'ordine deciso dal database. */
  children: ReactNode;
  /** I filtri letti dall'indirizzo. */
  filtri: DealerFilterState;
  /** Quanti ne restringono davvero (l'ordinamento non conta). */
  filtriAttivi: number;
  /** Le voci delle tendine, prese da **tutto** lo stock di questa concessionaria. */
  opzioni: OpzioniFiltri;
  /** Quante se ne stanno mostrando adesso. */
  mostrati: number;
  /** Quante ne ha in vetrina davvero, contate dal database, o `null`. */
  totaleInVetrina: number | null;
  /** L'indirizzo di questa pagina: il modulo ci rimanda con i filtri dentro. */
  azione: string;
};

/**
 * La ricerca dentro la pagina di una concessionaria.
 *
 * **Non e' piu' un componente del browser, ed e' il punto di tutta la
 * modifica.** Prima teneva i filtri in memoria e sceglieva fra le auto gia'
 * caricate: con 133 funzionava, e finche' l'elenco era intero il conto
 * tornava. Il giorno che questa pagina sara' divisa in pagine da
 * ventiquattro, il browser ne avrebbe in mano ventiquattro e direbbe "12 su
 * 133" avendone guardate ventiquattro -- lo stesso difetto del prezzo minimo
 * calcolato sulle prime trecento, **su questa stessa pagina**.
 *
 * Adesso e' un modulo normale che rimanda all'indirizzo della pagina con i
 * filtri scritti dentro: ogni combinazione ha il suo indirizzo, si puo'
 * mandare a qualcuno, il tasto "indietro" funziona, e **tutto continua a
 * funzionare senza JavaScript**. E' lo stesso impianto di `/ricerca`: una
 * seconda convenzione sullo stesso sito sarebbe peggio di una convenzione
 * imperfetta.
 */
export function DealerVehicleSearch({
  children,
  filtri,
  filtriAttivi,
  opzioni,
  mostrati,
  totaleInVetrina,
  azione,
}: DealerVehicleSearchProps) {
  const schede = Children.toArray(children);

  return (
    <section>
      <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-4 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
        {/*
          **Sul telefono i filtri partono chiusi.** Aperti erano tredici
          campi, e la prima automobile cominciava a 1.737 pixel: due
          schermate di filtri prima di vedere una macchina, su una pagina
          che uno apre proprio per guardare le auto di quel concessionario.

          `open` quando un filtro e' gia' impostato: chi arriva da un
          collegamento con dei filtri dentro deve vedere **perche'** sta
          guardando poche auto.
        */}
        <details className="aperto-da-grande group" open={filtriDaMostrareSubito(filtriAttivi)}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] [&::-webkit-details-marker]:hidden">
            {etichettaFiltra(filtriAttivi)}
            <span className="flex-none text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              <span className="group-open:hidden">Apri</span>
              <span className="hidden group-open:inline">Chiudi</span>
            </span>
          </summary>

          <form method="GET" action={azione}>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 lg:mt-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Ricerca avanzata</p>
                <h2 className="mt-2 text-xl font-bold text-white">Filtra i veicoli di questa concessionaria</h2>
              </div>
              {filtriAttivi > 0 ? (
                <Link
                  href={azione}
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Azzera {filtriAttivi === 1 ? "il filtro" : `i ${filtriAttivi} filtri`}
                </Link>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CampoTesto label="Cerca" name="q" valore={filtri.q} placeholder="Marca, modello, versione" />
              <CampoSelect label="Marca" name="brand" valore={filtri.brand} opzioni={opzioni.brands} />
              <CampoSelect label="Modello" name="model" valore={filtri.model} opzioni={opzioni.models} />
              <CampoSelect label="Carrozzeria" name="bodyType" valore={filtri.bodyType} opzioni={opzioni.bodyTypes} />
              <CampoSelect label="Condizioni" name="condition" valore={filtri.condition} opzioni={opzioni.conditions} />
              <CampoSelect label="Alimentazione" name="fuel" valore={filtri.fuel} opzioni={opzioni.fuels} />
              <CampoSelect label="Cambio" name="transmission" valore={filtri.transmission} opzioni={opzioni.transmissions} />
              <CampoSelect label="Anno da" name="yearFrom" valore={filtri.yearFrom} opzioni={opzioni.years} />
              <CampoSelect label="Anno a" name="yearTo" valore={filtri.yearTo} opzioni={opzioni.years} />
              <CampoTesto label="Prezzo minimo" name="minPrice" valore={filtri.minPrice} placeholder="Es. 10000" inputMode="numeric" />
              <CampoTesto label="Prezzo massimo" name="maxPrice" valore={filtri.maxPrice} placeholder="Es. 30000" inputMode="numeric" />
              <CampoTesto label="Km massimi" name="maxMileage" valore={filtri.maxMileage} placeholder="Es. 120000" inputMode="numeric" />
              <CampoSelect
                label="Ordinamento"
                name="sort"
                valore={filtri.sort}
                opzioni={DEALER_SORT_OPTIONS.map((opzione) => opzione.label)}
                valori={DEALER_SORT_OPTIONS.map((opzione) => opzione.value)}
                // L'ordinamento ha sempre un valore: "Tutti" non vorrebbe dire niente.
                senzaVoceVuota
              />
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
                >
                  Filtra
                </button>
              </div>
            </div>
          </form>
        </details>
      </div>

      {/* Fuori dal riquadro che si richiude: e' l'informazione per cui uno e'
          entrato su questa pagina, e chiudere i filtri non deve nasconderla. */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-400">{fraseConteggioVeicoli(mostrati, totaleInVetrina, filtriAttivi)}</p>
      </div>

      {schede.length === 0 ? (
        <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center text-slate-400">
          Nessun veicolo di questa concessionaria corrisponde ai filtri scelti.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{schede}</div>
      )}
    </section>
  );
}

function CampoTesto({
  label,
  name,
  valore,
  placeholder,
  inputMode,
}: {
  label: string;
  name: string;
  valore: string;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={valore}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function CampoSelect({
  label,
  name,
  valore,
  opzioni,
  valori,
  senzaVoceVuota,
}: {
  label: string;
  name: string;
  valore: string;
  opzioni: string[];
  valori?: string[];
  senzaVoceVuota?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        name={name}
        defaultValue={valore}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06]"
      >
        {senzaVoceVuota ? null : <option value="">Tutti</option>}
        {opzioni.map((opzione, indice) => (
          <option key={`${opzione}-${indice}`} value={valori ? valori[indice] : opzione}>
            {opzione}
          </option>
        ))}
      </select>
    </label>
  );
}
