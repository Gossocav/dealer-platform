import Link from "next/link";

const plans = [
  {
    id: "base",
    name: "Piano Base",
    price: "€149/mese",
    subtitle: "Fino a 50 annunci veicolo attivi",
    href: "/registrazione/base",
    ctaLabel: "Scegli Base",
  },
  {
    id: "pro",
    name: "Piano Pro",
    price: "€399/mese",
    subtitle: "Annunci veicolo attivi illimitati",
    href: "/registrazione/pro",
    ctaLabel: "Scegli Pro",
  },
] as const;

export default function RegistrazionePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-5xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.25)] sm:p-8 lg:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-600">Dealer Registration</p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Scegli il tuo piano prima della registrazione</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Seleziona il piano più adatto alla tua concessionaria per continuare con la creazione dell&apos;account dealer.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="flex h-full flex-col rounded-3xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-900">{plan.name}</h2>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{plan.price}</p>
              <p className="mt-2 text-sm text-slate-600">{plan.subtitle}</p>

              <Link
                href={plan.href}
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300"
              >
                {plan.ctaLabel}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
