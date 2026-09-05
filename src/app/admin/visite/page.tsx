"use client";

import { Fragment, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/admin-shell";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

/**
 * Le visite di ogni concessionaria.
 *
 * Chiesto dal titolare il 05/09/2026: monitorare dal pannello il flusso di
 * visitatori e le visualizzazioni degli annunci, concessionaria per
 * concessionaria.
 *
 * **I numeri partono dal giorno in cui la funzione e' stata accesa.** Prima
 * non si misurava niente, e non c'e' nessuno storico da recuperare: una
 * tabella vuota, qui, non e' un guasto -- e la schermata lo dice invece di
 * mostrare degli zeri che sembrerebbero un difetto.
 */

type AnnuncioVisto = {
  vehicleId: string;
  visite: number;
  etichetta: string;
};

type QuadroConcessionaria = {
  dealerId: string;
  nome: string;
  oggi: number;
  ultimi7: number;
  ultimi30: number;
  annunci30: number;
  pagina30: number;
  contatti30: number;
  visitePerContatto: number | null;
  annunciPiuVisti: AnnuncioVisto[];
};

type Risposta = {
  oggi: string;
  giorni: number;
  concessionarie: QuadroConcessionaria[];
  andamento: Array<{ giorno: string; visite: number }>;
};

type StatoPagina = {
  caricamento: boolean;
  autorizzato: boolean;
  errore: string | null;
  dati: Risposta | null;
};

function numero(valore: number) {
  return new Intl.NumberFormat("it-IT").format(valore);
}

function giornoBreve(giorno: string) {
  const data = new Date(`${giorno}T12:00:00Z`);
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" }).format(data);
}

/**
 * L'andamento come barre, disegnate con dei riquadri.
 *
 * Non si carica una libreria di grafici per trenta barre: sarebbe piu' codice
 * da scaricare che dati da mostrare.
 */
function Andamento({ andamento }: { andamento: Risposta["andamento"] }) {
  const massimo = Math.max(1, ...andamento.map((g) => g.visite));

  return (
    <div className="flex h-40 items-end gap-1">
      {andamento.map((giorno) => (
        <div key={giorno.giorno} className="flex flex-1 flex-col items-center gap-1" title={`${giornoBreve(giorno.giorno)}: ${numero(giorno.visite)} visite`}>
          <div
            className="w-full rounded-t bg-blue-500/80 transition hover:bg-blue-600"
            style={{ height: `${Math.max(2, (giorno.visite / massimo) * 100)}%` }}
          />
          <span className="text-[9px] text-slate-400">{giornoBreve(giorno.giorno).slice(0, 2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminVisitePage() {
  const [stato, setStato] = useState<StatoPagina>({
    caricamento: true,
    autorizzato: false,
    errore: null,
    dati: null,
  });
  const [aperta, setAperta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      const {
        data: { user },
        error: erroreUtente,
      } = await supabase.auth.getUser();

      if (!vivo) return;

      if (erroreUtente || !user) {
        setStato({ caricamento: false, autorizzato: false, errore: "Utente non autenticato.", dati: null });
        return;
      }

      let puoEntrare = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

      if (!puoEntrare) {
        const profilo = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
        if (!profilo.error) puoEntrare = isPlatformAdminRole(profilo.data?.role);
      }

      if (!vivo) return;

      if (!puoEntrare) {
        setStato({ caricamento: false, autorizzato: false, errore: null, dati: null });
        return;
      }

      const {
        data: { session },
        error: erroreSessione,
      } = await supabase.auth.getSession();

      if (!vivo) return;

      if (erroreSessione || !session?.access_token) {
        setStato({ caricamento: false, autorizzato: true, errore: "Sessione non valida.", dati: null });
        return;
      }

      const risposta = await fetch("/api/admin/visite", {
        headers: { authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const contenuto = (await risposta.json().catch(() => ({}))) as Risposta & { error?: string };

      if (!vivo) return;

      if (!risposta.ok) {
        setStato({ caricamento: false, autorizzato: true, errore: contenuto.error || "Errore nel caricamento.", dati: null });
        return;
      }

      setStato({ caricamento: false, autorizzato: true, errore: null, dati: contenuto });
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, []);

  if (stato.caricamento) {
    return (
      <AdminShell title="Visite">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Carico le visite...
        </div>
      </AdminShell>
    );
  }

  if (!stato.autorizzato) {
    return (
      <AdminShell title="Visite">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800 shadow-sm">
          {stato.errore ?? "Questa sezione e' riservata agli amministratori della piattaforma."}
        </div>
      </AdminShell>
    );
  }

  const dati = stato.dati;
  const totale30 = dati?.concessionarie.reduce((somma, c) => somma + c.ultimi30, 0) ?? 0;

  return (
    <AdminShell title="Visite">
      <div className="space-y-6">
        {stato.errore ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {stato.errore}
          </div>
        ) : null}

        {dati && totale30 === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Nessuna visita registrata negli ultimi {dati.giorni} giorni. Il conteggio parte dal giorno in cui la
            funzione e&apos; stata attivata: prima di allora la piattaforma non misurava niente, quindi non c&apos;e&apos;
            storico da recuperare.
          </div>
        ) : null}

        {dati && totale30 > 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Andamento degli ultimi {dati.giorni} giorni
            </h2>
            <p className="mt-1 text-2xl font-bold text-slate-900">{numero(totale30)} visite</p>
            <div className="mt-4">
              <Andamento andamento={dati.andamento} />
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-3">Concessionaria</th>
                  <th className="px-4 py-3 text-right">Oggi</th>
                  <th className="px-4 py-3 text-right">7 giorni</th>
                  <th className="px-4 py-3 text-right">30 giorni</th>
                  <th className="px-4 py-3 text-right">di cui annunci</th>
                  <th className="px-4 py-3 text-right">Contatti</th>
                  <th className="px-4 py-3 text-right">Visite per contatto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dati?.concessionarie ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={8}>
                      Nessuna concessionaria.
                    </td>
                  </tr>
                ) : (
                  (dati?.concessionarie ?? []).map((quadro) => (
                    <Fragment key={quadro.dealerId}>
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-900">{quadro.nome}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{numero(quadro.oggi)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{numero(quadro.ultimi7)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{numero(quadro.ultimi30)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{numero(quadro.annunci30)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{numero(quadro.contatti30)}</td>
                        {/* Senza contatti il rapporto non esiste: si scrive un
                            trattino, non uno zero che direbbe il contrario. */}
                        <td className="px-4 py-3 text-right text-slate-700">
                          {quadro.visitePerContatto === null ? "-" : `1 su ${numero(quadro.visitePerContatto)}`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {quadro.annunciPiuVisti.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setAperta(aperta === quadro.dealerId ? null : quadro.dealerId)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              {aperta === quadro.dealerId ? "Chiudi" : "Auto piu' viste"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {aperta === quadro.dealerId ? (
                        <tr className="bg-slate-50">
                          <td className="px-4 py-3" colSpan={8}>
                            <ol className="space-y-1">
                              {quadro.annunciPiuVisti.map((annuncio, posizione) => (
                                <li key={annuncio.vehicleId} className="flex items-center justify-between gap-4 text-sm">
                                  <span className="text-slate-700">
                                    <span className="mr-2 text-slate-400">{posizione + 1}.</span>
                                    {annuncio.etichetta}
                                  </span>
                                  <span className="font-semibold text-slate-900">{numero(annuncio.visite)} visite</span>
                                </li>
                              ))}
                            </ol>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
