import Link from "next/link";

export type MarqueeDealer = {
  name: string;
  slug: string;
};

export function MarqueeDealers({ dealers }: { dealers: MarqueeDealer[] }) {
  if (dealers.length === 0) return null;

  return (
    <div className="overflow-hidden border-y border-white/10 bg-slate-950 py-9">
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Le concessionarie partner, in un unico posto
      </p>
      {/* Lo scorrimento si ferma quando ci passi sopra col mouse o quando ci
          arrivi col tasto Tab: un nome che scivola via sotto il dito non si
          clicca. Da telefono il passaggio del mouse non esiste, ma il tocco
          parte lo stesso, e chi vuole leggere con calma ha le schede delle
          concessionarie poco piu' in basso nella stessa pagina. */}
      <div className="flex w-max gap-14 marketplace-marquee-track hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
        <MarqueeRow dealers={dealers} />
        {/* La seconda copia serve solo all'animazione, che torna indietro di
            meta' larghezza per ripartire senza stacchi. Per chi ascolta la
            pagina e per chi naviga col Tab non esiste: sono gli stessi nomi,
            e ripeterli sarebbe solo confusione. */}
        <MarqueeRow dealers={dealers} duplicate />
      </div>
    </div>
  );
}

function MarqueeRow({ dealers, duplicate = false }: { dealers: MarqueeDealer[]; duplicate?: boolean }) {
  return (
    <ul className="flex gap-14" aria-hidden={duplicate ? "true" : undefined}>
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
