import Link from "next/link";

export type MarketplaceCategory = {
  label: string;
  description: string;
  href: string;
  count: number;
};

/**
 * Horizontal scroll-snap rail. Deliberately plain CSS (overflow-x + snap)
 * rather than a JS scroll-pin: works with zero JavaScript, can't desync from
 * real scroll position, and degrades to normal touch/trackpad scrolling on
 * every device without extra measurement code.
 */
export function CategoryRail({ categories }: { categories: MarketplaceCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" style={{ scrollbarWidth: "thin" }}>
      {categories.map((category) => (
        <Link
          key={category.label}
          href={category.href}
          className="group relative flex w-[260px] flex-none snap-start flex-col justify-end gap-2 overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950 p-6 transition hover:border-cyan-300/40"
        >
          <span
            aria-hidden="true"
            className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/20 opacity-0 blur-2xl transition group-hover:opacity-100"
          />
          <h3 className="relative text-xl font-bold tracking-tight text-white">{category.label}</h3>
          <p className="relative text-sm text-slate-400">{category.description}</p>
          <p className="relative mt-2 text-sm font-semibold text-cyan-300">{category.count} disponibili</p>
        </Link>
      ))}
    </div>
  );
}
