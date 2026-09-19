import Link from "next/link";

export type MarqueeDealer = {
  name: string;
  slug: string;
};

/**
 * Sotto questa soglia i nomi non scorrono e non vengono raddoppiati.
 *
 * La seconda copia esiste solo per l'animazione: la pista torna indietro di
 * meta' larghezza, e senza il doppione lo scorrimento avrebbe uno stacco. Con
 * tanti nomi quel doppione e' il punto di ricucitura e non si nota.
 *
 * Con pochi si nota eccome. Con una sola concessionaria si leggeva il suo nome
 * due volte di fila -- segnalato come un difetto, ed era ragionevole leggerlo
 * cosi': sembrano due partner dove ce n'e' uno. E una striscia che scorre
 * senza riempire lo schermo sembra rotta comunque.
 */
const MIN_DEALERS_FOR_MARQUEE = 4;

export function MarqueeDealers({ dealers }: { dealers: MarqueeDealer[] }) {
  if (dealers.length === 0) return null;

  const scorre = dealers.length >= MIN_DEALERS_FOR_MARQUEE;

  return (
    <div className="overflow-hidden border-y border-white/10 bg-slate-950 py-9">
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Le concessionarie partner, in un unico posto
      </p>

      {!scorre ? (
        // Ferme e centrate: ognuna compare una volta sola.
        //
        // **Il `flex-wrap` stava sul contenitore sbagliato.** Era qui, su un
        // riquadro che ha **un figlio solo** -- l'elenco -- quindi non
        // mandava a capo niente: i nomi restavano su una riga sola larga 583
        // pixel dentro uno schermo da 360, centrata, e la fascia li tagliava
        // **su tutti e due i lati**. Il 19/09/2026 si leggeva per intero solo
        // "DE LORENZI SRL"; degli altri due restava un quarto. Ed erano i tre
        // collegamenti alle pagine delle concessionarie.
        //
        // Adesso e' l'elenco stesso ad andare a capo (`aCapo`), e sul
        // telefono lo stacco fra i nomi si stringe: cinquantasei pixel fra
        // due parole sono tanti su schermo largo e assurdi su uno stretto.
        <div className="flex items-center justify-center px-4">
          <MarqueeRow dealers={dealers} aCapo />
        </div>
      ) : (
        // Lo scorrimento si ferma quando ci passi sopra col mouse o quando ci
        // arrivi col tasto Tab: un nome che scivola via sotto il dito non si
        // clicca. Da telefono il passaggio del mouse non esiste, ma il tocco
        // parte lo stesso, e chi vuole leggere con calma ha le schede delle
        // concessionarie poco piu' in basso nella stessa pagina.
        //
        // La seconda copia serve solo all'animazione, che torna indietro di
        // meta' larghezza per ripartire senza stacchi. Per chi ascolta la
        // pagina e per chi naviga col Tab non esiste: sono gli stessi nomi, e
        // ripeterli sarebbe solo confusione.
        <div className="flex w-max gap-14 marketplace-marquee-track hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
          <MarqueeRow dealers={dealers} />
          <MarqueeRow dealers={dealers} duplicate />
        </div>
      )}
    </div>
  );
}

function MarqueeRow({
  dealers,
  duplicate = false,
  aCapo = false,
}: {
  dealers: MarqueeDealer[];
  duplicate?: boolean;
  /** Solo quando la striscia e' ferma: scorrendo, andare a capo la romperebbe. */
  aCapo?: boolean;
}) {
  return (
    <ul
      className={
        aCapo
          ? "flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-14 sm:gap-y-4"
          : "flex gap-14"
      }
      aria-hidden={duplicate ? "true" : undefined}
    >
      {dealers.map((dealer) => (
        <li key={`${duplicate ? "copia" : "originale"}-${dealer.slug}-${dealer.name}`}>
          <Link
            href={`/concessionarie/${dealer.slug}`}
            // Un link dentro una zona nascosta ai lettori di schermo resterebbe
            // comunque raggiungibile col Tab: si finirebbe a fuoco su un
            // elemento che la voce dichiara inesistente.
            tabIndex={duplicate ? -1 : undefined}
            className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-400/60 transition hover:text-cyan-300 focus-visible:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:text-2xl"
          >
            {dealer.name.toUpperCase()}
          </Link>
        </li>
      ))}
    </ul>
  );
}
