import Link from "next/link";

const eliteFeatures = [
  {
    title: "Software Dealer Platform completo",
    description:
      "Accedi a tutte le funzionalita della piattaforma senza limiti, dalla gestione veicoli alla ricezione lead, con la stessa base tecnica dei piani Pro.",
  },
  {
    title: "Visibilita sui social ufficiali Dealer Platform",
    description:
      "I tuoi veicoli e la tua concessionaria vengono promossi sui canali social ufficiali di Dealer Platform, ampliando la copertura oltre il marketplace.",
  },
  {
    title: "Gestione campagna Google Ads",
    description:
      "Il team Dealer Platform imposta e gestisce per te le campagne Google Ads. Il budget pubblicitario e concordato con il cliente e sostenuto direttamente da lui, separatamente dal canone.",
  },
  {
    title: "Report mensile delle performance marketing",
    description:
      "Ricevi ogni mese un report con i risultati delle attivita di marketing, utile per valutare l'andamento degli investimenti pubblicitari.",
  },
];

export default function RegistrazioneElitePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Piano Elite</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Piano Elite</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            La soluzione completa per concessionarie che vogliono affidare a Dealer Platform anche la visibilita online e la gestione della pubblicita.
          </p>
          <p className="mt-4 text-2xl font-semibold text-slate-900">€699/mese</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Il budget pubblicitario per le campagne Google Ads non e incluso nel canone: viene concordato con il cliente e sostenuto direttamente da lui.
          </p>

          <div className="mt-8 space-y-6">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Chi siamo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base">
                Dealer Platform e una piattaforma pensata per aiutare concessionarie e rivenditori automotive a pubblicare, gestire e valorizzare il proprio parco veicoli online.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Cosa include il Piano Elite</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {eliteFeatures.map((feature) => (
                  <div key={feature.title} className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{feature.description}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">A chi e adatto</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base">
                Concessionarie che vogliono delegare a Dealer Platform anche la promozione online, senza gestire in autonomia campagne pubblicitarie e canali social.
              </p>
            </article>
          </div>

          <Link
            href="/registrazione"
            className="mt-6 inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cambia piano
          </Link>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-semibold text-slate-900">Registrazione diretta disattivata</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
            L&apos;accesso al piano Elite passa dalla richiesta Demo e dalla successiva attivazione assistita.
          </p>
          <Link
            href="/demo"
            className="mt-5 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Richiedi Demo
          </Link>
        </section>
      </div>
    </main>
  );
}
