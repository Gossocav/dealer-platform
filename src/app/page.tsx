import type { Metadata } from "next";
import Link from "next/link";
import { toAbsoluteUrl } from "@/lib/public-marketplace";

const rootCanonical = toAbsoluteUrl("/");

export const metadata: Metadata = {
  title: "Dealer Platform",
  description: "Piattaforma multi-tenant per concessionarie: marketplace pubblico e area dealer.",
  alternates: {
    canonical: rootCanonical,
  },
  openGraph: {
    title: "Dealer Platform",
    description: "Piattaforma multi-tenant per concessionarie: marketplace pubblico e area dealer.",
    url: rootCanonical,
    type: "website",
  },
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.14),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_48%,_#eef2f7_100%)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="overflow-hidden rounded-[40px] border border-slate-200 bg-slate-950 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)]">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative px-8 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className="relative max-w-4xl">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950">DP</span>
                  MARKETPLACE AUTO
                </div>

                <h1 className="mt-8 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Trova la tua prossima auto
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                  Un marketplace automotive pulito e professionale per cercare auto pubblicate da concessionarie reali, con schede leggibili e accesso rapido al catalogo.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/auto"
                    className="inline-flex items-center justify-center rounded-3xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/10 transition hover:bg-slate-100"
                  >
                    Sfoglia auto
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-3xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Accedi concessionaria
                  </Link>
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {HERO_METRICS.map((metric) => (
                    <div key={metric.label} className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <p className="text-sm font-medium text-slate-300">{metric.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative border-t border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.82)_0%,_rgba(15,23,42,0.98)_100%)] px-8 py-10 sm:px-10 sm:py-12 lg:border-l lg:border-t-0 lg:px-12 lg:py-16">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className="relative flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Ricerca rapida veicolo</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Entra subito nel catalogo con un filtro essenziale.</h2>
                </div>

                <form action="/ricerca" method="GET" className="rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/10 backdrop-blur">
                  <div className="grid gap-4">
                    <HeroField label="Cerca" name="q" placeholder="Marca, modello o città" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <HeroSelect
                        label="Marca"
                        name="brand"
                        options={["Alfa Romeo", "Audi", "BMW", "Fiat", "Jeep", "Mercedes-Benz", "Peugeot", "Volkswagen"]}
                      />
                      <HeroSelect
                        label="Prezzo"
                        name="priceBand"
                        options={["Fino a 15.000 €", "15.000 - 25.000 €", "25.000 - 40.000 €", "Oltre 40.000 €"]}
                        values={["0-15000", "15000-25000", "25000-40000", "40000-99999999"]}
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-3xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/10 transition hover:bg-slate-100"
                    >
                      Avvia ricerca
                    </button>
                  </div>
                </form>

                <div className="grid gap-3 sm:grid-cols-2">
                  {SEARCH_NOTES.map((note) => (
                    <div key={note.title} className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <p className="text-sm font-semibold text-white">{note.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{note.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          {AUDIENCE_CARDS.map((card) => (
            <article
              key={card.title}
              className={card.inverted
                ? "rounded-[32px] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8"
                : "rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8"
              }
            >
              <p className={card.inverted ? "text-sm font-semibold uppercase tracking-[0.32em] text-white/70" : "text-sm font-semibold uppercase tracking-[0.32em] text-blue-600"}>
                {card.eyebrow}
              </p>
              <h2 className={card.inverted ? "mt-3 text-3xl font-semibold text-white" : "mt-3 text-3xl font-semibold text-slate-900"}>{card.title}</h2>
              <p className={card.inverted ? "mt-4 max-w-2xl text-sm leading-7 text-slate-300" : "mt-4 max-w-2xl text-sm leading-7 text-slate-600"}>{card.description}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {card.points.map((point) => (
                  <div
                    key={point}
                    className={card.inverted ? "rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200" : "rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-700"}
                  >
                    {point}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={card.primaryHref}
                  className={card.inverted
                    ? "inline-flex items-center justify-center rounded-3xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                    : "inline-flex items-center justify-center rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  }
                >
                  {card.primaryLabel}
                </Link>
                <Link
                  href={card.secondaryHref}
                  className={card.inverted
                    ? "inline-flex items-center justify-center rounded-3xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    : "inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  }
                >
                  {card.secondaryLabel}
                </Link>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Vantaggi</p>
              <h2 className="mt-3 text-3xl font-semibold text-slate-900">Un’esperienza chiara per chi compra e per chi vende.</h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
                La homepage accompagna l’utente verso il catalogo pubblico e l’area concessionaria con un linguaggio visivo premium e un percorso d’uso immediato.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/auto" className="inline-flex items-center justify-center rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                Sfoglia auto
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Accedi concessionaria
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-sm ring-1 ring-slate-200">
                  {benefit.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.text}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.18)] sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">Dealer Platform Marketplace</p>
              <p className="mt-1 text-sm text-slate-600">Marketplace pubblico per auto, pensato per clienti e concessionarie.</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
              <Link href="/auto" className="rounded-3xl bg-slate-100 px-4 py-2 transition hover:bg-slate-200">Catalogo</Link>
              <Link href="/login" className="rounded-3xl bg-slate-100 px-4 py-2 transition hover:bg-slate-200">Area concessionaria</Link>
              <Link href="/lead" className="rounded-3xl bg-slate-100 px-4 py-2 transition hover:bg-slate-200">Lead</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

const HERO_METRICS = [
  { label: "Catalogo sempre accessibile", value: "24/7" },
  { label: "Esperienza", value: "Premium" },
  { label: "Flusso", value: "Rapido" },
];

const SEARCH_NOTES = [
  { title: "Catalogo pubblico", text: "Accesso immediato a veicoli e schede dettagliate senza passaggi superflui." },
  { title: "Percorso diretto", text: "Dalla homepage alla ricerca avanzata o alla scheda auto in pochi clic." },
  { title: "Concessionarie reali", text: "Ogni veicolo proviene da partner che gestiscono il proprio stock in piattaforma." },
  { title: "Design coerente", text: "Tono visivo sobrio, automotive e responsivo, in linea con il marketplace." },
];

const AUDIENCE_CARDS = [
  {
    eyebrow: "Per chi compra",
    title: "Cerca auto con un’esperienza più chiara.",
    description: "Consulta il catalogo, filtra rapidamente e arriva alla scheda del veicolo con informazioni essenziali ben leggibili.",
    points: ["Accesso rapido al catalogo pubblico", "Schede auto con dati chiave immediati", "Navigazione mobile-first", "Percorso semplice verso la richiesta informazioni"],
    primaryHref: "/auto",
    primaryLabel: "Sfoglia auto",
    secondaryHref: "/ricerca",
    secondaryLabel: "Ricerca avanzata",
    inverted: false,
  },
  {
    eyebrow: "Per concessionarie",
    title: "Un ingresso ordinato alla tua area operativa.",
    description: "Accedi al gestionale dealer per gestire lead, veicoli e attività mantenendo continuità con il marketplace pubblico.",
    points: ["Accesso veloce all’area riservata", "Coerenza visiva tra pubblico e backoffice", "Presentazione più credibile del catalogo", "Percorso pensato per generare contatti"],
    primaryHref: "/login",
    primaryLabel: "Accedi concessionaria",
    secondaryHref: "/veicoli",
    secondaryLabel: "Area veicoli",
    inverted: true,
  },
] as const;

const BENEFITS = [
  {
    title: "Ricerca immediata",
    text: "Una form essenziale porta subito l’utente verso il catalogo filtrato, senza appesantire la homepage.",
    icon: <IconSearch />,
  },
  {
    title: "Tono premium",
    text: "Palette sobria, contrasti curati e superfici pulite per trasmettere affidabilità e qualità del marketplace.",
    icon: <IconShield />,
  },
  {
    title: "CTA distinte",
    text: "Le azioni principali separano chiaramente il percorso cliente dal percorso concessionaria.",
    icon: <IconRoute />,
  },
  {
    title: "Responsive reale",
    text: "Sezioni, card e call to action mantengono leggibilità e gerarchia sia su mobile sia su desktop.",
    icon: <IconViewport />,
  },
];

function HeroField({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        className="w-full rounded-3xl border border-white/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function HeroSelect({ label, name, options, values }: { label: string; name: string; options: string[]; values?: string[] }) {
  const finalValues = values ?? options;

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{label}</span>
      <select
        name={name}
        className="w-full rounded-3xl border border-white/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      >
        <option value="">Tutti</option>
        {options.map((option, index) => (
          <option key={`${name}-${option}-${index}`} value={finalValues[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 3 5 6v5c0 4.4 2.9 8.47 7 9.8 4.1-1.33 7-5.4 7-9.8V6l-7-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRoute() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M7 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8c0 5 4 0 4 5s4 0 4 5h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconViewport() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 20h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
