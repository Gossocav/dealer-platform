export function MarqueeBrands({ brands }: { brands: string[] }) {
  if (brands.length === 0) return null;

  // Duplicated once so the CSS animation can loop seamlessly (translateX -50%).
  const loop = [...brands, ...brands];

  return (
    <div className="overflow-hidden border-y border-white/10 bg-slate-950 py-9">
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Le concessionarie partner, in un unico posto
      </p>
      <div className="flex w-max gap-14 marketplace-marquee-track" aria-hidden="true">
        {loop.map((brand, index) => (
          <span key={`${brand}-${index}`} className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-400/60 sm:text-2xl">
            {brand.toUpperCase()}
          </span>
        ))}
      </div>
      <span className="sr-only">{brands.join(", ")}</span>
    </div>
  );
}
