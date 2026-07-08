import { redirect } from "next/navigation";
import { resolveServerDealerAccess } from "@/lib/server-dealer-access";

export default async function AccountInAttesaPage() {
  const dealerAccess = await resolveServerDealerAccess();

  if (dealerAccess.state === "suspended" || dealerAccess.state === "cancelled") {
    redirect("/account/sospeso");
  }

  if (dealerAccess.state === "approved") {
    redirect("/dashboard");
  }

  if (dealerAccess.state !== "pending_review" && dealerAccess.state !== "rejected") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Verifica account</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Verifica account in corso...</h1>
          <p className="mt-4 text-base leading-7 text-slate-700">Stiamo verificando lo stato del tuo account.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Verifica account</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Richiesta ricevuta</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Il tuo account concessionario e stato creato correttamente ed e attualmente in verifica.
        </p>
        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
          <p>
            Stato attuale: <span className="font-semibold text-slate-900">account in verifica</span>
          </p>
          <p>
            Tempi stimati di approvazione: <span className="font-semibold text-slate-900">1-2 giorni lavorativi</span>
          </p>
          <p>
            Assistenza: <a className="font-semibold text-blue-700 underline" href="mailto:support@dealerplatform.it">support@dealerplatform.it</a>
          </p>
        </div>
      </section>
    </main>
  );
}
