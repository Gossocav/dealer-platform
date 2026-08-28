import Link from "next/link";
import type { ReactNode } from "react";
import { RevealOnScroll } from "@/components/marketplace/reveal-on-scroll";

/**
 * I mattoni delle due pagine di presentazione -- /per-chi-compra e
 * /per-le-concessionarie.
 *
 * Stanno insieme in un file solo perche' le due pagine sono deliberatamente
 * speculari: chi arriva dalla home deve riconoscere lo stesso impianto da
 * qualunque delle due porte entri. Copiati in due file, al primo ritocco di
 * stile su una delle due pagine l'altra sarebbe rimasta indietro, e la
 * simmetria -- che e' il motivo per cui esistono -- si sarebbe persa.
 */

export function PresentazioneHero({
  occhiello,
  titolo,
  sottotitolo,
  children,
}: {
  occhiello: string;
  titolo: string;
  sottotitolo: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-16 sm:px-6 sm:pt-20 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(76,130,247,0.45), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-5xl">
        <RevealOnScroll>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">{occhiello}</p>
          <h1
            className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl"
            style={{ textWrap: "balance" }}
          >
            {titolo}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">{sottotitolo}</p>
        </RevealOnScroll>
        {children ? <RevealOnScroll delayMs={80}>{children}</RevealOnScroll> : null}
      </div>
    </section>
  );
}

export function Sezione({
  occhiello,
  titolo,
  sottotitolo,
  children,
}: {
  occhiello: string;
  titolo: string;
  sottotitolo?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.06] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <RevealOnScroll>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">{occhiello}</p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl" style={{ textWrap: "balance" }}>
            {titolo}
          </h2>
          {sottotitolo ? <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">{sottotitolo}</p> : null}
        </RevealOnScroll>
        <RevealOnScroll delayMs={80} className="mt-8">
          {children}
        </RevealOnScroll>
      </div>
    </section>
  );
}

export function SchedaPunto({ titolo, testo }: { titolo: string; testo: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-blue-400/40 hover:bg-white/[0.05]">
      <h3 className="text-base font-semibold text-white">{titolo}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{testo}</p>
    </article>
  );
}

export function SchedaNumerata({ numero, titolo, testo }: { numero: number; titolo: string; testo: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white">
        {numero}
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">{titolo}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{testo}</p>
    </article>
  );
}

export function BottonePrimario({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-7 py-3.5 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
    >
      {children}
    </Link>
  );
}

export function BottoneSecondario({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-500/10"
    >
      {children}
    </Link>
  );
}

export function ChiusuraInvito({
  titolo,
  testo,
  children,
}: {
  titolo: string;
  testo: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <RevealOnScroll
        className="relative mx-auto max-w-5xl overflow-hidden rounded-[34px] border border-white/10 px-6 py-16 text-center sm:px-10"
        style={{ background: "linear-gradient(160deg, #12224a, #0b1120 70%)" }}
      >
        <h2 className="mx-auto max-w-xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ textWrap: "balance" }}>
          {titolo}
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-slate-400">{testo}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </RevealOnScroll>
    </section>
  );
}
