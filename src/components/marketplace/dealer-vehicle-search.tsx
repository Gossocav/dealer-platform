"use client";

import { Children, useMemo, useState, type ReactNode } from "react";
import {
  DEALER_FILTERS_EMPTY,
  DEALER_SORT_OPTIONS,
  contaFiltriAttivi,
  filtraEOrdina,
  opzioniFiltri,
  type DealerFilterState,
  type DealerSortValue,
  type DealerVehicleFacets,
} from "@/lib/dealer-vehicle-filters";

type DealerVehicleSearchProps = {
  /** Un elemento per veicolo, **nello stesso ordine** di `vehicles`. */
  children: ReactNode;
  vehicles: DealerVehicleFacets[];
};

/**
 * La ricerca avanzata dentro la pagina della concessionaria.
 *
 * Le schede dei veicoli arrivano gia' disegnate dal server (`children`):
 * `VehicleCard` firma gli indirizzi delle foto e per questo non puo' vivere
 * dentro un componente del browser. Qui si decide soltanto **quali** mostrare
 * e **in che ordine** -- il disegno resta dove stava.
 *
 * Senza JavaScript il pannello compare ma non reagisce, e l'elenco resta
 * completo: chi non puo' filtrare vede comunque tutti i veicoli, invece di un
 * modulo che non porta da nessuna parte.
 */
export function DealerVehicleSearch({ children, vehicles }: DealerVehicleSearchProps) {
  const [filtri, setFiltri] = useState<DealerFilterState>(DEALER_FILTERS_EMPTY);

  const schede = useMemo(() => Children.toArray(children), [children]);
  const posizionePerId = useMemo(() => new Map(vehicles.map((veicolo, indice) => [veicolo.id, indice])), [vehicles]);
  const opzioni = useMemo(() => opzioniFiltri(vehicles, filtri), [vehicles, filtri]);
  const risultati = useMemo(() => filtraEOrdina(vehicles, filtri), [vehicles, filtri]);

  const filtriAttivi = contaFiltriAttivi(filtri);

  function aggiorna(chiave: keyof DealerFilterState, valore: string) {
    setFiltri((precedenti) => {
      const aggiornati = { ...precedenti, [chiave]: valore } as DealerFilterState;
      // Cambiando marca il modello scelto quasi sempre non esiste piu': se
      // restasse impostato l'elenco resterebbe vuoto senza motivo visibile.
      if (chiave === "brand") aggiornati.model = "";
      return aggiornati;
    });
  }

  return (
    <section>
      <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Ricerca avanzata</p>
            <h2 className="mt-2 text-xl font-bold text-white">Filtra i veicoli di questa concessionaria</h2>
          </div>
          {filtriAttivi > 0 ? (
            <button
              type="button"
              onClick={() => setFiltri(DEALER_FILTERS_EMPTY)}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Azzera {filtriAttivi === 1 ? "il filtro" : `i ${filtriAttivi} filtri`}
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CampoTesto
            label="Cerca"
            value={filtri.q}
            onChange={(valore) => aggiorna("q", valore)}
            placeholder="Marca, modello, versione"
          />
          <CampoSelect label="Marca" value={filtri.brand} onChange={(valore) => aggiorna("brand", valore)} options={opzioni.brands} />
          <CampoSelect label="Modello" value={filtri.model} onChange={(valore) => aggiorna("model", valore)} options={opzioni.models} />
          <CampoSelect label="Carrozzeria" value={filtri.bodyType} onChange={(valore) => aggiorna("bodyType", valore)} options={opzioni.bodyTypes} />
          <CampoSelect label="Condizioni" value={filtri.condition} onChange={(valore) => aggiorna("condition", valore)} options={opzioni.conditions} />
          <CampoSelect label="Alimentazione" value={filtri.fuel} onChange={(valore) => aggiorna("fuel", valore)} options={opzioni.fuels} />
          <CampoSelect label="Cambio" value={filtri.transmission} onChange={(valore) => aggiorna("transmission", valore)} options={opzioni.transmissions} />
          <CampoSelect label="Anno da" value={filtri.yearFrom} onChange={(valore) => aggiorna("yearFrom", valore)} options={opzioni.years} />
          <CampoSelect label="Anno a" value={filtri.yearTo} onChange={(valore) => aggiorna("yearTo", valore)} options={opzioni.years} />
          <CampoTesto label="Prezzo minimo" value={filtri.minPrice} onChange={(valore) => aggiorna("minPrice", valore)} placeholder="Es. 10000" inputMode="numeric" />
          <CampoTesto label="Prezzo massimo" value={filtri.maxPrice} onChange={(valore) => aggiorna("maxPrice", valore)} placeholder="Es. 30000" inputMode="numeric" />
          <CampoTesto label="Km massimi" value={filtri.maxMileage} onChange={(valore) => aggiorna("maxMileage", valore)} placeholder="Es. 120000" inputMode="numeric" />
          <CampoSelect
            label="Ordinamento"
            value={filtri.sort}
            onChange={(valore) => aggiorna("sort", valore as DealerSortValue)}
            options={DEALER_SORT_OPTIONS.map((opzione) => opzione.label)}
            values={DEALER_SORT_OPTIONS.map((opzione) => opzione.value)}
            // L'ordinamento ha sempre un valore: "Tutti" non vorrebbe dire niente.
            senzaVoceVuota
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-400" aria-live="polite">
          {risultati.length === vehicles.length
            ? `${vehicles.length} ${vehicles.length === 1 ? "veicolo" : "veicoli"}`
            : `${risultati.length} ${risultati.length === 1 ? "veicolo" : "veicoli"} su ${vehicles.length}`}
        </p>
      </div>

      {risultati.length === 0 ? (
        <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center text-slate-400">
          Nessun veicolo di questa concessionaria corrisponde ai filtri scelti.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {risultati.map((veicolo) => {
            const posizione = posizionePerId.get(veicolo.id);
            return posizione === undefined ? null : schede[posizione];
          })}
        </div>
      )}
    </section>
  );
}

function CampoTesto({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (valore: string) => void;
  placeholder: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{ color: "#f8fafc" }}
        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function CampoSelect({
  label,
  value,
  onChange,
  options,
  values,
  senzaVoceVuota,
}: {
  label: string;
  value: string;
  onChange: (valore: string) => void;
  options: string[];
  values?: string[];
  senzaVoceVuota?: boolean;
}) {
  const valoriFinali = values ?? options;

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        style={{ color: "#f8fafc", colorScheme: "dark" }}
        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06] disabled:opacity-40"
        // Una tendina senza voci e' un vicolo cieco: si spegne invece di
        // restare aperta su un elenco vuoto.
        disabled={options.length === 0}
      >
        {senzaVoceVuota ? null : (
          <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
            Tutti
          </option>
        )}
        {options.map((opzione, indice) => (
          <option key={opzione} value={valoriFinali[indice] ?? opzione} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
            {opzione}
          </option>
        ))}
      </select>
    </label>
  );
}
