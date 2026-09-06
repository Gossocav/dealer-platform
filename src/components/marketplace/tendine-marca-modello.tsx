"use client";

import { useMemo, useState } from "react";

/**
 * Le due tendine Marca e Modello, legate fra loro.
 *
 * Scegliendo una marca, la tendina dei modelli mostra **solo i modelli di
 * quella marca**. Senza il legame, chi cerca una Audi si trova davanti tutti
 * i modelli di tutte le marche e deve sapere gia' quale cercare -- e se ne
 * sceglie uno di un'altra marca ottiene zero risultati senza capire perche'.
 *
 * Il legame esisteva solo nella ricerca della home. La pagina "Ricerca
 * avanzata" aveva due tendine indipendenti: la marca non filtrava niente
 * finche' non si premeva Cerca. Segnalato dal titolare il 06/09/2026.
 *
 * Le due pagine hanno un aspetto diverso -- la home ha i campi dentro una
 * barra scura, la ricerca avanzata dei riquadri arrotondati -- ma la regola e'
 * la stessa, e sta scritta qui una volta sola. Due copie di una regola
 * divergono: e' gia' successo in questo progetto con il filtro di ricerca.
 */

type Props = {
  brands: string[];
  brandModelMap: Record<string, string[]>;
  allModels: string[];
  /** Da dove si e' arrivati: la ricerca avanzata riparte da cio' che c'e' nell'indirizzo. */
  marcaIniziale?: string;
  modelloIniziale?: string;
  variante: "home" | "ricerca";
};

const STILE = {
  home: {
    contenitore: "block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]",
    etichetta:
      "block text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-left",
    campo: "mt-0.5 w-full appearance-none bg-transparent text-center text-sm font-semibold outline-none sm:text-left",
    vuotoMarca: "Qualsiasi marca",
    vuotoModello: "Qualsiasi modello",
  },
  ricerca: {
    contenitore: "block",
    etichetta: "mb-2 block text-sm font-medium text-slate-300",
    campo:
      "w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06]",
    vuotoMarca: "Tutti",
    vuotoModello: "Tutti",
  },
} as const;

export function TendineMarcaModello({
  brands,
  brandModelMap,
  allModels,
  marcaIniziale = "",
  modelloIniziale = "",
  variante,
}: Props) {
  const [marca, setMarca] = useState(marcaIniziale);
  const stile = STILE[variante];

  const modelli = useMemo(
    () => (marca ? brandModelMap[marca] ?? [] : allModels),
    [marca, brandModelMap, allModels]
  );

  // Cambiando marca, un modello scelto prima quasi sempre non c'e' piu' fra
  // le scelte: lasciarlo selezionato manderebbe una ricerca che non puo'
  // dare risultati. Si azzera, e chi cerca vede la tendina tornare su
  // "Tutti" invece di ottenere zero auto senza spiegazione.
  const modelloValido = modelli.includes(modelloIniziale) ? modelloIniziale : "";

  return (
    <>
      <label className={stile.contenitore}>
        <span className={stile.etichetta}>Marca</span>
        <select
          name="brand"
          value={marca}
          onChange={(evento) => setMarca(evento.target.value)}
          style={{ color: "#f8fafc", colorScheme: "dark" }}
          className={stile.campo}
        >
          <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
            {stile.vuotoMarca}
          </option>
          {brands.map((brand) => (
            <option key={brand} value={brand} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
              {brand}
            </option>
          ))}
        </select>
      </label>

      <label className={stile.contenitore}>
        <span className={stile.etichetta}>Modello</span>
        <select
          name="model"
          // `key` costringe il campo a ridisegnarsi quando cambia la marca:
          // senza, il browser tiene la scelta precedente anche quando non e'
          // piu' fra le opzioni.
          key={marca}
          defaultValue={modelloValido}
          style={{ color: "#f8fafc", colorScheme: "dark" }}
          className={stile.campo}
        >
          <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
            {stile.vuotoModello}
          </option>
          {modelli.map((model) => (
            <option key={model} value={model} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
