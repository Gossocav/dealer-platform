"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer, Save } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { FunzioneNonCompresa } from "@/components/dashboard/funzione-non-compresa";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { pianoComprende } from "@/lib/funzioni-per-piano";
import {
  MILLIMETRI_MINIMI_BATTISTRADA,
  RUOTE,
  SEZIONI_PERIZIA,
  etichettaStato,
  leggiRilievo,
  riepilogoPerizia,
  titoloPerizia,
  type RilievoPerizia,
} from "@/lib/scheda-perizia";
import { supabase } from "@/lib/supabaseClient";
import { usePianoInVigore } from "@/lib/use-piano-in-vigore";

const COLONNE = [
  "id",
  "dealer_id",
  "brand",
  "model",
  "version",
  "plate",
  "vin",
  "registration_date",
  "mileage",
  "fuel",
  "transmission",
  "color",
  "owner_name",
  "owner_phone",
  "conditions",
  "cost_body",
  "cost_mechanical",
  "cost_tyres",
  "cost_interior",
  "cost_other",
  "reconditioning_total",
  "offered_price",
  "notes",
  "appraiser",
  "appraised_on",
  "status",
].join(", ");

type Perizia = {
  id: string;
  /** Dichiarato anche qui, non solo nell'id: ogni interrogazione del
   *  gestionale nomina la concessionaria, anche dove il database lo impone. */
  dealer_id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  plate: string | null;
  vin: string | null;
  registration_date: string | null;
  mileage: number | null;
  fuel: string | null;
  transmission: string | null;
  color: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  conditions: unknown;
  cost_body: number | string | null;
  cost_mechanical: number | string | null;
  cost_tyres: number | string | null;
  cost_interior: number | string | null;
  cost_other: number | string | null;
  offered_price: number | string | null;
  notes: string | null;
  appraiser: string | null;
  appraised_on: string | null;
  status: string | null;
};

const VOCI_COSTO = [
  { chiave: "cost_body", etichetta: "Carrozzeria" },
  { chiave: "cost_mechanical", etichetta: "Meccanica" },
  { chiave: "cost_tyres", etichetta: "Pneumatici" },
  { chiave: "cost_interior", etichetta: "Interni" },
  { chiave: "cost_other", etichetta: "Altro" },
] as const;

type ChiaveCosto = (typeof VOCI_COSTO)[number]["chiave"];

function numero(valore: number | string | null | undefined) {
  const n = typeof valore === "string" ? Number(valore) : valore;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function euro(valore: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(valore);
}

/**
 * La perizia di una vettura: si compila con l'auto davanti, si salva, si
 * stampa.
 *
 * **Le voci non compilate restano vuote e si vedono.** In cima c'e' "43 su
 * 51": un rilievo lasciato a meta' non deve poter sembrare finito, perche' la
 * perizia serve proprio a dire cosa e' stato guardato. Nessuna voce parte
 * gia' su "a posto".
 */
export function PeriziaPage({ periziaId }: { periziaId: string }) {
  const [perizia, setPerizia] = useState<Perizia | null>(null);
  const [rilievo, setRilievo] = useState<RilievoPerizia>({});
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState<"fermo" | "salvo" | "salvata">("fermo");
  const { planCode, caricamento: caricamentoPiano } = usePianoInVigore();

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        if (vivo) {
          setErrore("Sessione non valida. Effettua di nuovo l'accesso.");
          setCaricamento(false);
        }
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, { activeDealerId: getActiveDealerId() });

      if (!dealerId) {
        if (vivo) {
          setErrore("Concessionaria non associata all'utente.");
          setCaricamento(false);
        }
        return;
      }

      const letta = await supabase
        .from("vehicle_appraisals")
        .select(COLONNE)
        .eq("id", periziaId)
        .eq("dealer_id", dealerId)
        .maybeSingle<Perizia>();

      if (!vivo) return;

      if (letta.error) {
        setErrore("Non e stato possibile leggere la perizia.");
        setCaricamento(false);
        return;
      }

      if (!letta.data) {
        setErrore("Perizia non trovata.");
        setCaricamento(false);
        return;
      }

      setPerizia(letta.data);
      setRilievo(leggiRilievo(letta.data.conditions));
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [periziaId]);

  const aggiorna = useCallback(<K extends keyof Perizia>(campo: K, valore: Perizia[K]) => {
    setPerizia((precedente) => (precedente ? { ...precedente, [campo]: valore } : precedente));
    setSalvataggio("fermo");
  }, []);

  const scegliStato = (sezione: string, voce: string, stato: string) => {
    setRilievo((precedente) => {
      const sezioni = { ...(precedente.sezioni ?? {}) };
      const dentro = { ...(sezioni[sezione] ?? {}) };
      const scelto = dentro[voce]?.stato === stato ? undefined : stato;
      dentro[voce] = { ...dentro[voce], stato: scelto };
      sezioni[sezione] = dentro;
      return { ...precedente, sezioni };
    });
    setSalvataggio("fermo");
  };

  const scriviNota = (sezione: string, voce: string, nota: string) => {
    setRilievo((precedente) => {
      const sezioni = { ...(precedente.sezioni ?? {}) };
      const dentro = { ...(sezioni[sezione] ?? {}) };
      dentro[voce] = { ...dentro[voce], nota };
      sezioni[sezione] = dentro;
      return { ...precedente, sezioni };
    });
    setSalvataggio("fermo");
  };

  const scriviRuota = (ruota: string, campo: "marca" | "misura" | "mm", valore: string) => {
    setRilievo((precedente) => {
      const ruote = { ...(precedente.ruote ?? {}) };
      const corrente = { ...(ruote[ruota] ?? {}) };

      if (campo === "mm") {
        const mm = valore.trim() === "" ? null : Number(valore.replace(",", "."));
        corrente.mm = typeof mm === "number" && Number.isFinite(mm) ? mm : null;
      } else {
        corrente[campo] = valore;
      }

      ruote[ruota] = corrente;
      return { ...precedente, ruote };
    });
    setSalvataggio("fermo");
  };

  const riepilogo = useMemo(() => riepilogoPerizia(rilievo), [rilievo]);
  const totaleRimessa = useMemo(
    () => (perizia ? VOCI_COSTO.reduce((somma, voce) => somma + numero(perizia[voce.chiave]), 0) : 0),
    [perizia]
  );

  const salva = async () => {
    if (!perizia) return;

    setSalvataggio("salvo");
    setErrore(null);

    const scrittura = await supabase
      .from("vehicle_appraisals")
      .update({
        brand: perizia.brand,
        model: perizia.model,
        version: perizia.version,
        plate: perizia.plate,
        vin: perizia.vin,
        registration_date: perizia.registration_date || null,
        mileage: perizia.mileage,
        fuel: perizia.fuel,
        transmission: perizia.transmission,
        color: perizia.color,
        owner_name: perizia.owner_name,
        owner_phone: perizia.owner_phone,
        conditions: rilievo,
        cost_body: numero(perizia.cost_body),
        cost_mechanical: numero(perizia.cost_mechanical),
        cost_tyres: numero(perizia.cost_tyres),
        cost_interior: numero(perizia.cost_interior),
        cost_other: numero(perizia.cost_other),
        offered_price: perizia.offered_price === null || perizia.offered_price === "" ? null : numero(perizia.offered_price),
        notes: perizia.notes,
        appraiser: perizia.appraiser,
        appraised_on: perizia.appraised_on || null,
        status: perizia.status ?? "aperta",
      })
      .eq("id", perizia.id)
      .eq("dealer_id", perizia.dealer_id);

    if (scrittura.error) {
      setSalvataggio("fermo");
      setErrore("Non e stato possibile salvare la perizia. Riprova.");
      return;
    }

    setSalvataggio("salvata");
  };

  if (caricamentoPiano || caricamento) {
    return (
      <DealerDashboardShell title="Perizia">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">Caricamento...</div>
      </DealerDashboardShell>
    );
  }

  if (!pianoComprende(planCode, "perizia")) {
    return (
      <DealerDashboardShell title="Perizia">
        <FunzioneNonCompresa funzione="perizia" titolo="Perizie" tornaA="/dashboard" etichettaRitorno="Torna al pannello" />
      </DealerDashboardShell>
    );
  }

  if (!perizia) {
    return (
      <DealerDashboardShell title="Perizia">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {errore ?? "Perizia non trovata."}
          <Link href="/perizie" className="mt-3 block font-semibold underline">
            Torna alle perizie
          </Link>
        </div>
      </DealerDashboardShell>
    );
  }

  return (
    <DealerDashboardShell title="Perizia">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/perizie" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Tutte le perizie
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          {salvataggio === "salvata" ? <span className="text-sm font-medium text-emerald-700">Salvata.</span> : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-900"
          >
            <Printer className="h-4 w-4" />
            Stampa
          </button>
          <button
            type="button"
            onClick={() => void salva()}
            disabled={salvataggio === "salvo"}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {salvataggio === "salvo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva
          </button>
        </div>
      </div>

      {errore ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

      <div className="print:hidden">
      <section className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Perizia</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{titoloPerizia(perizia)}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {riepilogo.vociCompilate} voci compilate su {riepilogo.vociTotali}
              {riepilogo.daSistemare.length > 0 ? ` · ${riepilogo.daSistemare.length} da sistemare` : ""}
            </p>
          </div>

          <label className="text-sm">
            <span className="mr-2 font-medium text-slate-700">Stato</span>
            <select
              value={perizia.status ?? "aperta"}
              onChange={(evento) => aggiorna("status", evento.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="aperta">Aperta</option>
              <option value="chiusa">Chiusa</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etichetta="Marca" valore={perizia.brand} onChange={(v) => aggiorna("brand", v)} />
          <Campo etichetta="Modello" valore={perizia.model} onChange={(v) => aggiorna("model", v)} />
          <Campo etichetta="Versione" valore={perizia.version} onChange={(v) => aggiorna("version", v)} />
          <Campo etichetta="Targa" valore={perizia.plate} onChange={(v) => aggiorna("plate", v.toUpperCase())} />
          <Campo etichetta="Telaio" valore={perizia.vin} onChange={(v) => aggiorna("vin", v.toUpperCase())} />
          <Campo
            etichetta="Immatricolazione"
            tipo="date"
            valore={perizia.registration_date}
            onChange={(v) => aggiorna("registration_date", v)}
          />
          <Campo
            etichetta="Chilometri"
            tipo="number"
            valore={perizia.mileage === null ? "" : String(perizia.mileage)}
            onChange={(v) => aggiorna("mileage", v.trim() === "" ? null : Number(v))}
          />
          <Campo etichetta="Alimentazione" valore={perizia.fuel} onChange={(v) => aggiorna("fuel", v)} />
          <Campo etichetta="Cambio" valore={perizia.transmission} onChange={(v) => aggiorna("transmission", v)} />
          <Campo etichetta="Colore" valore={perizia.color} onChange={(v) => aggiorna("color", v)} />
          <Campo etichetta="Chi la vende" valore={perizia.owner_name} onChange={(v) => aggiorna("owner_name", v)} />
          <Campo etichetta="Telefono" valore={perizia.owner_phone} onChange={(v) => aggiorna("owner_phone", v)} />
        </div>
      </section>

      {SEZIONI_PERIZIA.map((sezione) => (
        <section
          key={sezione.chiave}
          className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6"
        >
          <h3 className="text-lg font-semibold text-slate-900">{sezione.titolo}</h3>
          {sezione.spiegazione ? <p className="mt-1 text-sm leading-6 text-slate-600">{sezione.spiegazione}</p> : null}

          <div className="mt-4 divide-y divide-slate-100">
            {sezione.voci.map((voce) => {
              const scelto = rilievo.sezioni?.[sezione.chiave]?.[voce.chiave];

              return (
                <div key={voce.chiave} className="grid gap-2 py-3 lg:grid-cols-[14rem_1fr_12rem] lg:items-center lg:gap-4">
                  <span className="text-sm font-medium text-slate-800">{voce.etichetta}</span>

                  <div className="flex flex-wrap gap-2">
                    {sezione.stati.map((stato) => {
                      const attivo = scelto?.stato === stato.valore;
                      return (
                        <button
                          key={stato.valore}
                          type="button"
                          onClick={() => scegliStato(sezione.chiave, voce.chiave, stato.valore)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            attivo
                              ? stato.daSistemare
                                ? "border-amber-300 bg-amber-100 text-amber-900"
                                : "border-emerald-300 bg-emerald-100 text-emerald-900"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                          }`}
                        >
                          {stato.etichetta}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={scelto?.nota ?? ""}
                    onChange={(evento) => scriviNota(sezione.chiave, voce.chiave, evento.target.value)}
                    placeholder="Nota"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Pneumatici</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Sotto {MILLIMETRI_MINIMI_BATTISTRADA} mm di battistrada la gomma va messa nel conto: la consumerebbe il cliente
          poche settimane dopo averla comprata.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {RUOTE.map((ruota) => {
            const misurato = rilievo.ruote?.[ruota.chiave];
            const sotto = typeof misurato?.mm === "number" && misurato.mm < MILLIMETRI_MINIMI_BATTISTRADA;

            return (
              <div
                key={ruota.chiave}
                className={`rounded-2xl border px-4 py-3 ${sotto ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
              >
                <p className="text-sm font-semibold text-slate-900">{ruota.etichetta}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={misurato?.marca ?? ""}
                    onChange={(evento) => scriviRuota(ruota.chiave, "marca", evento.target.value)}
                    placeholder="Marca"
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-slate-900"
                  />
                  <input
                    type="text"
                    value={misurato?.misura ?? ""}
                    onChange={(evento) => scriviRuota(ruota.chiave, "misura", evento.target.value)}
                    placeholder="Misura"
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-slate-900"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={misurato?.mm ?? ""}
                    onChange={(evento) => scriviRuota(ruota.chiave, "mm", evento.target.value)}
                    placeholder="mm"
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Quanto costa rimetterla a posto</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Separato per voce, come il conto economico: &ldquo;3.200 euro&rdquo; non dice dove intervenire, quattro numeri
          s&igrave;.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {VOCI_COSTO.map((voce) => (
            <Campo
              key={voce.chiave}
              etichetta={voce.etichetta}
              tipo="number"
              valore={perizia[voce.chiave] === null ? "" : String(perizia[voce.chiave] ?? "")}
              onChange={(v) => aggiorna(voce.chiave as ChiaveCosto, (v.trim() === "" ? 0 : Number(v)) as never)}
            />
          ))}
        </div>

        <p className="mt-4 text-sm text-slate-700">
          Totale rimessa a nuovo: <strong className="text-slate-900">{euro(totaleRimessa)}</strong>
        </p>

        {riepilogo.daSistemare.length > 0 ? (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Da cui nasce il conto</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {riepilogo.daSistemare.map((difetto, indice) => (
                <li key={`${difetto.sezione}-${difetto.voce}-${indice}`}>
                  {difetto.sezione} · {difetto.voce}: {difetto.stato}
                  {difetto.nota ? ` (${difetto.nota})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Conclusione</h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Campo
            etichetta="Valore proposto"
            tipo="number"
            valore={perizia.offered_price === null ? "" : String(perizia.offered_price ?? "")}
            onChange={(v) => aggiorna("offered_price", v.trim() === "" ? null : (Number(v) as never))}
          />
          <Campo etichetta="Chi ha periziato" valore={perizia.appraiser} onChange={(v) => aggiorna("appraiser", v)} />
          <Campo etichetta="Data" tipo="date" valore={perizia.appraised_on} onChange={(v) => aggiorna("appraised_on", v)} />
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">Note</span>
          <textarea
            value={perizia.notes ?? ""}
            onChange={(evento) => aggiorna("notes", evento.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </label>
      </section>
      </div>

      <FoglioStampabile perizia={perizia} rilievo={rilievo} totaleRimessa={totaleRimessa} />
    </DealerDashboardShell>
  );
}

function Campo({
  etichetta,
  valore,
  onChange,
  tipo = "text",
}: {
  etichetta: string;
  valore: string | null;
  onChange: (valore: string) => void;
  tipo?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{etichetta}</span>
      <input
        type={tipo}
        value={valore ?? ""}
        onChange={(evento) => onChange(evento.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
      />
    </label>
  );
}

/**
 * Quello che esce dalla stampante.
 *
 * **Non e' il modulo con i pulsanti.** Stampare la schermata darebbe cinque
 * pastiglie per riga, quattro delle quali non scelte: su carta si legge solo
 * quello che il perito ha deciso, e le voci non guardate restano vuote --
 * si vedono, ed e' giusto che si vedano.
 */
function FoglioStampabile({
  perizia,
  rilievo,
  totaleRimessa,
}: {
  perizia: Perizia;
  rilievo: RilievoPerizia;
  totaleRimessa: number;
}) {
  const riepilogo = riepilogoPerizia(rilievo);

  return (
    <article className="vehicle-sheet hidden bg-white text-slate-900 print:block">
      <header className="border-b-2 border-slate-900 pb-3">
        <p className="text-[10pt] font-semibold uppercase tracking-[0.2em]">Perizia della vettura</p>
        <h1 className="mt-1 text-[18pt] font-bold leading-tight">{titoloPerizia(perizia)}</h1>
        <p className="mt-1 text-[9pt]">
          {perizia.appraised_on ? `Del ${perizia.appraised_on}` : "Senza data"}
          {perizia.appraiser ? ` · Periziata da ${perizia.appraiser}` : ""}
          {` · ${riepilogo.vociCompilate} voci su ${riepilogo.vociTotali}`}
        </p>
      </header>

      <section className="sheet-block mt-3 grid grid-cols-3 gap-x-6 gap-y-1 text-[9pt]">
        <RigaFoglio etichetta="Targa" valore={perizia.plate} />
        <RigaFoglio etichetta="Telaio" valore={perizia.vin} />
        <RigaFoglio etichetta="Immatricolazione" valore={perizia.registration_date} />
        <RigaFoglio etichetta="Chilometri" valore={perizia.mileage === null ? null : String(perizia.mileage)} />
        <RigaFoglio etichetta="Alimentazione" valore={perizia.fuel} />
        <RigaFoglio etichetta="Cambio" valore={perizia.transmission} />
        <RigaFoglio etichetta="Colore" valore={perizia.color} />
        <RigaFoglio etichetta="Chi la vende" valore={perizia.owner_name} />
        <RigaFoglio etichetta="Telefono" valore={perizia.owner_phone} />
      </section>

      {SEZIONI_PERIZIA.map((sezione) => {
        const compilate = sezione.voci
          .map((voce) => ({ voce, scelto: rilievo.sezioni?.[sezione.chiave]?.[voce.chiave] }))
          .filter((riga) => riga.scelto?.stato);

        if (compilate.length === 0) return null;

        return (
          <section key={sezione.chiave} className="sheet-block mt-3">
            <h2 className="border-b border-slate-400 pb-1 text-[11pt] font-bold">{sezione.titolo}</h2>
            <table className="mt-1 w-full text-[9pt]">
              <tbody>
                {compilate.map(({ voce, scelto }) => (
                  <tr key={voce.chiave} className="border-b border-slate-200">
                    <td className="w-1/3 py-1 pr-2">{voce.etichetta}</td>
                    <td className="w-1/4 py-1 pr-2 font-semibold">{etichettaStato(sezione, scelto?.stato) ?? "-"}</td>
                    <td className="py-1">{scelto?.nota ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <section className="sheet-block mt-3">
        <h2 className="border-b border-slate-400 pb-1 text-[11pt] font-bold">Pneumatici</h2>
        <table className="mt-1 w-full text-[9pt]">
          <tbody>
            {RUOTE.map((ruota) => {
              const misurato = rilievo.ruote?.[ruota.chiave];
              return (
                <tr key={ruota.chiave} className="border-b border-slate-200">
                  <td className="w-1/3 py-1 pr-2">{ruota.etichetta}</td>
                  <td className="w-1/4 py-1 pr-2">{misurato?.marca ?? ""} {misurato?.misura ?? ""}</td>
                  <td className="py-1 font-semibold">
                    {typeof misurato?.mm === "number" ? `${misurato.mm} mm` : ""}
                    {typeof misurato?.mm === "number" && misurato.mm < MILLIMETRI_MINIMI_BATTISTRADA ? " — da sostituire" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="sheet-block mt-3">
        <h2 className="border-b border-slate-400 pb-1 text-[11pt] font-bold">Rimessa a nuovo e valutazione</h2>
        <table className="mt-1 w-full text-[9pt]">
          <tbody>
            {VOCI_COSTO.map((voce) => (
              <tr key={voce.chiave} className="border-b border-slate-200">
                <td className="w-1/3 py-1">{voce.etichetta}</td>
                <td className="py-1 text-right font-semibold">{euro(numero(perizia[voce.chiave]))}</td>
              </tr>
            ))}
            <tr className="border-b-2 border-slate-900">
              <td className="py-1 font-bold">Totale rimessa a nuovo</td>
              <td className="py-1 text-right font-bold">{euro(totaleRimessa)}</td>
            </tr>
            <tr>
              <td className="py-2 font-bold">Valore proposto</td>
              <td className="py-2 text-right text-[12pt] font-bold">
                {perizia.offered_price === null ? "-" : euro(numero(perizia.offered_price))}
              </td>
            </tr>
          </tbody>
        </table>

        {perizia.notes ? <p className="mt-2 whitespace-pre-wrap text-[9pt]">{perizia.notes}</p> : null}
      </section>

      <section className="sheet-block mt-6 grid grid-cols-2 gap-8 text-[9pt]">
        <div className="border-t border-slate-500 pt-1">Firma del perito</div>
        <div className="border-t border-slate-500 pt-1">Firma di chi vende</div>
      </section>
    </article>
  );
}

function RigaFoglio({ etichetta, valore }: { etichetta: string; valore: string | null }) {
  return (
    <p>
      <span className="font-semibold">{etichetta}:</span> {String(valore ?? "").trim() || "-"}
    </p>
  );
}
