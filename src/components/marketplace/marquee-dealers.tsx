export function MarqueeDealers({ dealers }: { dealers: string[] }) {
  if (dealers.length === 0) return null;

  // Duplicated once so the CSS animation can loop seamlessly (translateX -50%).
  const loop = [...dealers, ...dealers];

  return (
    <div className="overflow-hidden border-y border-white/10 bg-slate-950 py-9">
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Le concessionarie partner, in un unico posto
      </p>
      <div className="flex w-max gap-14 marketplace-marquee-track" aria-hidden="true">
        {loop.map((dealer, index) => (
          <span key={`${dealer}-${index}`} className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-400/60 sm:text-2xl">
            {dealer.toUpperCase()}
          </span>
        ))}
      </div>
      <span className="sr-only">{dealers.join(", ")}</span>
    </div>
  );
}
