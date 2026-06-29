import Link from "next/link";
import { CheckCircle2, FilePlus2, ImagePlus, Sparkles } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";

const checklist = [
  "Dati principali veicolo",
  "Foto e media gallery",
  "Prezzo e disponibilita",
  "Pubblicazione su marketplace",
] as const;

export function NewVehiclePageContent() {
  return (
    <DealerDashboardShell
      title="Nuovo Veicolo"
      dealerName="Gossocar Premium Motors"
      avatarInitials="GP"
      unreadNotifications={3}
    >
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inserimento guidato</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Crea una nuova scheda veicolo</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Questa pagina e pronta per l'integrazione dati. Al momento usa una struttura mock tipizzata,
          mantenendo UX e navigazione reali.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <FilePlus2 className="h-4 w-4" /> Salva bozza
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Sparkles className="h-4 w-4" /> Pubblica
          </button>
          <Link
            href="/veicoli"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Torna ai veicoli
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] xl:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900">Anteprima form</h3>
          <p className="mt-1 text-sm text-slate-500">Struttura pronta per collegamento API e validazioni.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              "Marca",
              "Modello",
              "Versione",
              "Anno",
              "Prezzo",
              "Chilometraggio",
              "Alimentazione",
              "Cambio",
            ].map((label) => (
              <label key={label} className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
                <input
                  type="text"
                  placeholder={`Inserisci ${label.toLowerCase()}`}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                />
              </label>
            ))}
          </div>

          <label className="mt-3 block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Descrizione</span>
            <textarea
              rows={4}
              placeholder="Descrizione commerciale del veicolo"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
            />
          </label>
        </article>

        <article className="dashboard-fade-up space-y-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Checklist pubblicazione</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {checklist.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="inline-flex items-center gap-2 font-medium text-slate-700">
              <ImagePlus className="h-4 w-4 text-sky-600" />
              Upload foto veicolo
            </p>
            <p className="mt-1">Area mock pronta per drag and drop immagini.</p>
          </div>
        </article>
      </section>
    </DealerDashboardShell>
  );
}
