"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Loader2, Plus, Search, X } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { FunzioneNonCompresa } from "@/components/dashboard/funzione-non-compresa";
import { getActiveDealerId } from "@/lib/active-tenant";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { pianoComprende } from "@/lib/funzioni-per-piano";
import {
  leggiRilievo,
  normalizzaFiltriPerizia,
  perRicercaParziale,
  ricercaInCorso,
  riepilogoPerizia,
  titoloPerizia,
  type FiltriPerizia,
} from "@/lib/scheda-perizia";
import { supabase } from "@/lib/supabaseClient";
import { usePianoInVigore } from "@/lib/use-piano-in-vigore";

type RigaPerizia = {
  id: string;
  brand: string | null;
  model: string | null;
  plate: string | null;
  mileage: number | null;
  owner_name: string | null;
  appraised_on: string | null;
  status: string | null;
  offered_price: number | string | null;
  reconditioning_total: number | string | null;
  conditions: unknown;
};

const COLONNE =
  "id, brand, model, plate, mileage, owner_name, appraised_on, status, offered_price, reconditioning_total, conditions";

const MODULO_VUOTO = { dal: "", al: "", cliente: "", marca: "", modello: "" };

type ModuloRicerca = typeof MODULO_VUOTO;

/**
 * Quante voci ha l'elenco, contate e non scritte a mano.
 *
 * Erano scritte a mano, ed erano gia' sbagliate di una il giorno stesso:
 * l'elenco delle voci cresce e un numero copiato in una frase non lo segue.
 */
const VOCI_DA_GUARDARE = riepilogoPerizia({}).vociTotali;

function importo(valore: number | string | null) {
  const numero = typeof valore === "string" ? Number(valore) : valore;
  if (typeof numero !== "number" || !Number.isFinite(numero)) return "-";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(numero);
}

function data(valore: string | null) {
  if (!valore) return "-";
  const quando = new Date(valore);
  return Number.isNaN(quando.getTime()) ? valore : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(quando);
}

/**
 * L'elenco delle perizie fatte.
 *
 * La colonna che conta e' "da sistemare": e' il numero di difetti rilevati, ed
 * e' quello che si guarda tornando su una perizia di due settimane prima per
 * decidere se quell'auto conviene ancora.
 */
export function PerizieListPage() {
  const router = useRouter();
  const [perizie, setPerizie] = useState<RigaPerizia[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  // Due stati e non uno: quello che si sta scrivendo e quello che e' stato
  // cercato. Interrogare il database a ogni tasto vorrebbe dire una richiesta
  // per lettera, e un elenco che si rimescola sotto le dita mentre si scrive.
  const [modulo, setModulo] = useState<ModuloRicerca>(MODULO_VUOTO);
  const [filtri, setFiltri] = useState<FiltriPerizia>({});
  const { planCode, caricamento: caricamentoPiano } = usePianoInVigore();

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!vivo) return;

    if (!userId) {
      setErrore("Sessione non valida. Effettua di nuovo l'accesso.");
      setCaricamento(false);
      return;
    }

    const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, { activeDealerId: getActiveDealerId() });

    if (!vivo) return;

    if (!dealerId) {
      setErrore("Concessionaria non associata all'utente.");
      setCaricamento(false);
      return;
    }

    // Letto per intero: il database ne consegna mille per volta e non lo dice.
    //
    // I filtri si applicano **nell'interrogazione** e non dopo: cercare fra
    // righe gia' scaricate vorrebbe dire scaricarle tutte comunque, e ogni
    // perizia si porta dietro il suo rilievo, cioe' la parte piu' pesante.
    const elenco = await caricaTutto<RigaPerizia>((da, a) => {
      let interrogazione = supabase
        .from("vehicle_appraisals")
        .select(COLONNE)
        .eq("dealer_id", dealerId);

      if (filtri.dal) interrogazione = interrogazione.gte("appraised_on", filtri.dal);
      if (filtri.al) interrogazione = interrogazione.lte("appraised_on", filtri.al);
      if (filtri.cliente) interrogazione = interrogazione.ilike("owner_name", perRicercaParziale(filtri.cliente));
      if (filtri.marca) interrogazione = interrogazione.ilike("brand", perRicercaParziale(filtri.marca));
      if (filtri.modello) interrogazione = interrogazione.ilike("model", perRicercaParziale(filtri.modello));

      return interrogazione
        .order("appraised_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(da, a)
        .returns<RigaPerizia[]>();
    });

    if (!vivo) return;

    if (elenco.error) {
      setErrore("Non e stato possibile leggere le perizie.");
      setCaricamento(false);
      return;
    }

      setPerizie(elenco.righe);
      setErrore(null);
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [filtri]);

  const nuova = async () => {
    setCreando(true);
    setErrore(null);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    const dealerId = userId
      ? await resolveDealerIdFromTenantSources(supabase, userId, { activeDealerId: getActiveDealerId() })
      : null;

    if (!dealerId) {
      setErrore("Concessionaria non associata all'utente.");
      setCreando(false);
      return;
    }

    // La riga nasce vuota e si apre subito: chi peritia ha l'auto davanti, e
    // un modulo da compilare prima di poter cominciare lo farebbe scrivere su
    // un foglio.
    const creata = await supabase
      .from("vehicle_appraisals")
      .insert({ dealer_id: dealerId })
      .select("id")
      .maybeSingle<{ id: string }>();

    setCreando(false);

    if (creata.error || !creata.data?.id) {
      setErrore("Non e stato possibile aprire una perizia nuova.");
      return;
    }

    router.push(`/perizie/${creata.data.id}`);
  };

  if (caricamentoPiano) {
    return (
      <DealerDashboardShell title="Perizie">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">Caricamento...</div>
      </DealerDashboardShell>
    );
  }

  if (!pianoComprende(planCode, "perizia")) {
    return (
      <DealerDashboardShell title="Perizie">
        <FunzioneNonCompresa funzione="perizia" titolo="Perizie" tornaA="/dashboard" etichettaRitorno="Torna al pannello" />
      </DealerDashboardShell>
    );
  }

  return (
    <DealerDashboardShell title="Perizie">
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Perizie</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Le vetture che hai controllato</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              La perizia si compila prima di comprare: l&apos;auto in permuta, o quella che vai a vedere. Resta salvata e
              si ristampa quando serve.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void nuova()}
            disabled={creando}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Nuova perizia
          </button>
        </div>

        {/* La ricerca sta sopra l'elenco e non dentro un pannello da aprire:
            una perizia si ricerca quando il venditore richiama, e in quel
            momento si ha il telefono in mano. */}
        <form
          className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(evento) => {
            evento.preventDefault();
            setFiltri(normalizzaFiltriPerizia(modulo));
          }}
        >
          <CampoRicerca etichetta="Dal" tipo="date" valore={modulo.dal} onChange={(v) => setModulo((m) => ({ ...m, dal: v }))} />
          <CampoRicerca etichetta="Al" tipo="date" valore={modulo.al} onChange={(v) => setModulo((m) => ({ ...m, al: v }))} />
          <CampoRicerca etichetta="Chi vende" valore={modulo.cliente} onChange={(v) => setModulo((m) => ({ ...m, cliente: v }))} />
          <CampoRicerca etichetta="Marca" valore={modulo.marca} onChange={(v) => setModulo((m) => ({ ...m, marca: v }))} />
          <CampoRicerca etichetta="Modello" valore={modulo.modello} onChange={(v) => setModulo((m) => ({ ...m, modello: v }))} />

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Search className="h-4 w-4" />
              Cerca
            </button>

            {ricercaInCorso(filtri) ? (
              <button
                type="button"
                onClick={() => {
                  setModulo(MODULO_VUOTO);
                  setFiltri({});
                }}
                title="Azzera la ricerca"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-600 transition hover:border-slate-900 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </form>

        {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

        {caricamento ? (
          <p className="mt-6 text-sm text-slate-600">Caricamento perizie...</p>
        ) : perizie.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <ClipboardCheck className="h-6 w-6" />
            </span>

            {/* Chi ha appena cercato non deve leggere "non hai ancora fatto
                perizie": ne ha fatte, e quella frase gli farebbe temere di
                averle perse. */}
            {ricercaInCorso(filtri) ? (
              <>
                <p className="mt-4 font-semibold text-slate-900">Nessuna perizia con questi filtri</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  Le perizie che hai fatto sono al loro posto: e&apos; questa ricerca a non trovarne. Prova ad allargare
                  il periodo, o a scrivere solo una parte del nome.
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 font-semibold text-slate-900">Nessuna perizia, per ora</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
                  La prossima volta che vai a vedere un&apos;auto, aprine una: {VOCI_DA_GUARDARE} voci da spuntare, le
                  quattro gomme da misurare, e alla fine il conto di quanto costa rimetterla a posto.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Vettura</th>
                  <th className="py-3 pr-4 font-semibold">Chi vende</th>
                  <th className="py-3 pr-4 font-semibold">Data</th>
                  <th className="py-3 pr-4 font-semibold">Chilometri</th>
                  <th className="py-3 pr-4 font-semibold">Da sistemare</th>
                  <th className="py-3 pr-4 font-semibold">Rimessa a nuovo</th>
                  <th className="py-3 pr-4 font-semibold">Offerta</th>
                  <th className="py-3 font-semibold">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perizie.map((perizia) => {
                  const riepilogo = riepilogoPerizia(leggiRilievo(perizia.conditions));

                  return (
                    <tr key={perizia.id} className="transition hover:bg-slate-50">
                      <td className="py-3 pr-4">
                        <Link href={`/perizie/${perizia.id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
                          {titoloPerizia(perizia)}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {riepilogo.vociCompilate} voci compilate su {riepilogo.vociTotali}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{perizia.owner_name?.trim() || "-"}</td>
                      <td className="py-3 pr-4 text-slate-600">{data(perizia.appraised_on)}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        {typeof perizia.mileage === "number" ? `${new Intl.NumberFormat("it-IT").format(perizia.mileage)} km` : "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {riepilogo.daSistemare.length > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            {riepilogo.daSistemare.length}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{importo(perizia.reconditioning_total)}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{importo(perizia.offered_price)}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            perizia.status === "chiusa" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {perizia.status === "chiusa" ? "Chiusa" : "Aperta"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DealerDashboardShell>
  );
}

function CampoRicerca({
  etichetta,
  valore,
  onChange,
  tipo = "text",
}: {
  etichetta: string;
  valore: string;
  onChange: (valore: string) => void;
  tipo?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{etichetta}</span>
      <input
        type={tipo}
        value={valore}
        onChange={(evento) => onChange(evento.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
      />
    </label>
  );
}
