"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export type SpecShowcaseVehicle = {
  id: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  imageUrl: string | null;
  rows: Array<{ key: string; label: string; value: string; icon: "calendar" | "gauge" | "fuel" | "gearbox" | "shield" | "check" }>;
};

/**
 * The "wow" moment: a real featured vehicle whose spec rows reveal as the
 * user scrolls past this section. Uses CSS scroll-timeline (globals.css)
 * where supported; the rows are laid out in a grid that flanks the card so
 * nothing can end up visually hidden behind the photo, unlike an
 * absolute-positioned layout.
 */
export function SpecShowcase({ vehicle }: { vehicle: SpecShowcaseVehicle }) {
  const sectionRef = useRef<HTMLElement>(null);

  // Progressive enhancement: the scroll-driven reveal in globals.css only
  // activates once .is-ready is present, so a slow/failed hydration leaves
  // the server-rendered rows fully visible instead of stuck at opacity 0.
  useEffect(() => {
    sectionRef.current?.classList.add("is-ready");
  }, []);

  const leftRows = vehicle.rows.filter((_, i) => i % 2 === 0);
  const rightRows = vehicle.rows.filter((_, i) => i % 2 === 1);

  return (
    // min-h gives the sticky child room to actually pin while scrolling;
    // without extra height here the section and its sticky child are the
    // same size and "sticky" never has anywhere to stick to.
    <section ref={sectionRef} className="spec-showcase relative min-h-[200vh]">
      <div className="sticky top-16 grid min-h-[560px] place-items-center overflow-hidden py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">Ogni auto, radiografata</p>
          </div>

          <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.1fr_1fr]">
            <div className="order-2 grid content-center gap-4 lg:order-1">
              {leftRows.map((row, i) => (
                <SpecRow key={row.key} label={row.label} value={row.value} icon={row.icon} fromSide="left" index={i} />
              ))}
            </div>

            <div className="order-1 lg:order-2">
              <VehicleCardVisual vehicle={vehicle} />
            </div>

            <div className="order-3 grid content-center gap-4">
              {rightRows.map((row, i) => (
                <SpecRow key={row.key} label={row.label} value={row.value} icon={row.icon} fromSide="right" index={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VehicleCardVisual({ vehicle }: { vehicle: SpecShowcaseVehicle }) {
  return (
    <div className="relative rounded-[28px] border border-white/10 bg-gradient-to-b from-slate-800/90 to-slate-900 p-4 shadow-[0_40px_100px_-40px_rgba(6,10,25,0.9)]">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {vehicle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vehicle.imageUrl} alt={vehicle.title} className="h-full w-full object-cover" loading="lazy" />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {vehicle.title.split(" ")[0]}
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{vehicle.title}</h3>
          <p className="text-sm text-slate-400">{vehicle.subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Prezzo</p>
          <p className="text-xl font-bold tracking-tight text-white">{vehicle.priceLabel}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 px-3 py-1.5 text-xs font-bold text-slate-950">
        <CheckIcon /> Verificata
      </div>
      <Link
        href={`/auto/${vehicle.id}`}
        className="mt-4 block rounded-2xl bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-white/10"
      >
        Vedi la scheda completa
      </Link>
    </div>
  );
}

function SpecRow({
  label,
  value,
  icon,
  fromSide,
  index,
}: {
  label: string;
  value: string;
  icon: SpecShowcaseVehicle["rows"][number]["icon"];
  fromSide: "left" | "right";
  index: number;
}) {
  return (
    <div
      className="spec-row flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur"
      style={{ "--row-from": fromSide === "left" ? "-24px" : "24px", animationDelay: `${index * 80}ms` } as React.CSSProperties}
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-cyan-400/15 text-cyan-300">
        <SpecIcon name={icon} />
      </span>
      <span>
        <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <span className="block text-sm font-semibold text-white">{value}</span>
      </span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[3]" aria-hidden="true">
      <path d="M20 7 9 18l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpecIcon({ name }: { name: SpecShowcaseVehicle["rows"][number]["icon"] }) {
  const common = "h-4 w-4 fill-none stroke-current stroke-[2]";
  switch (name) {
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "gauge":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 13V9M5 6l1.5 1.5" strokeLinecap="round" />
        </svg>
      );
    case "fuel":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path d="M14 7h3a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0 3 0v-6l-3-3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3 20h13M4 11h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "gearbox":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "check":
    default:
      return <CheckIcon />;
  }
}
