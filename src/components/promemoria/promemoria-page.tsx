"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import {
  TIPI_PROMEMORIA,
  etichettaTipo,
  oggiIso,
  raggruppaPerUrgenza,
  titoloPromemoria,
  urgenza,
} from "@/lib/promemoria";
import { supabase } from "@/lib/supabaseClient";

type Riga = {
  id: string;
  dealer_id: string;
  tipo: string | null;
  titolo: string | null;
  note: string | null;
  scade_il: string;
  stato: string | null;
  vehicle_id: string | null;
  vehicle: { plate: string | null; brand: string | null; model: string | null } | null;
};

const COLONNE = "id, dealer_id, tipo, titolo, note, scade_il, stato, vehicle_id, vehicle:vehicles(plate, brand, model)";

/**
 * Tutto quello che scade e tutto quello che c'e' da fare.
 *
 * **Gli scaduti stanno in cima, separati.** Un elenco ordinato solo per data
 * mette quello di tre mesi fa accanto a quello di stamattina, e chi guarda non
 * distingue piu' l'arretrato da quello che deve fare adesso.
 *
 * Da qui si creano i promemoria che non riguardano una vettura -- "richiamare
 * il commercialista" -- mentre le scadenze di un'automobile si scrivono sulla
 * sua scheda, dove si sa gia' di quale macchina si parla.
 */
export function PromemoriaPage() {
  const [righe, setRighe] = useState<Riga[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [ricarica, setRicarica] = useState(0);
  const [mostraFatti, setMostraFatti] = useState(false);

  const [apertoNuovo, setApertoNuovo] = useState(false);
  const [tipo, setTipo] = useState("altro");
  const [titolo, setTitolo] = useState("");
  const [scadeIl, setScadeIl] = useState(oggiIso());
  const [note, setNote] = useState("");
  const [salvataggio, setSalvataggio] = useState(false);

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

      const idConcessionaria = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!vivo) return;

      if (!idConcessionaria) {
        setErrore("Concessionaria non associata all'utente.");
        setCaricamento(false);
        return;
      }

      setDealerId(idConcessionaria);

      const elenco = await caricaTutto<Riga>((da, a) =>
        supabase
          .from("promemoria")
          .select(COLONNE)
          .eq("dealer_id", idConcessionaria)
          .eq("stato", mostraFatti ? "fatto" : "aperto")
          .order("scade_il", { ascending: true, nullsFirst: false })
          .range(da, a)
          .returns<Riga[]>()
      );

      if (!vivo) return;

      if (elenco.error) {
        setErrore("Non e stato possibile leggere i promemoria.");
        setCaricamento(false);
        return;
      }

      setRighe(elenco.righe);
      setErrore(null);
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [ricarica, mostraFatti]);

  const crea = async () => {
    if (!dealerId) return;

    if (!scadeIl) {
      setErrore("Scegli il giorno: un promemoria senza data non avvisa nessuno.");
      return;
    }

    setSalvataggio(true);
    setErrore(null);

    const scritto = await supabase.from("promemoria").insert({
      dealer_id: dealerId,
      tipo,
      titolo: titolo.trim() || null,
      note: note.trim() || null,
      scade_il: scadeIl,
    });

    setSalvataggio(false);

    if (scritto.error) {
      setErrore("Non e stato possibile creare il promemoria.");
      return;
    }

    setApertoNuovo(false);
    setTitolo("");
    setNote("");
    setRicarica((n) => n + 1);
  };

  const segnaFatto = async (riga: Riga) => {
    const scritto = await supabase
      .from("promemoria")
      .update({ stato: "fatto", fatto_il: new Date().toISOString() })
      .eq("id", riga.id)
      .eq("dealer_id", riga.dealer_id);

    if (scritto.error) {
      setErrore("Non e stato possibile segnarlo come fatto.");
      return;
    }

    setRicarica((n) => n + 1);
  };

  const elimina = async (riga: Riga) => {
    if (!window.confirm(`Eliminare "${titoloPromemoria(riga)}"?`)) return;

    const scritto = await supabase.from("promemoria").delete().eq("id", riga.id).eq("dealer_id", riga.dealer_id);

    if (scritto.error) {
      setErrore("Non e stato possibile eliminare il promemoria.");
      return;
    }

    setRicarica((n) => n + 1);
  };

  const gruppi = raggruppaPerUrgenza(righe);

  return (
    <DealerDashboardShell title="Promemoria">
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Promemoria</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Cosa scade e cosa c&apos;e&apos; da fare</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Le scadenze di una vettura -- revisione, assicurazione, tagliando, garanzia -- si scrivono sulla sua
              scheda. Qui finiscono tutte insieme, con quello che ti sei segnato a mano.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setMostraFatti((precedente) => !precedente)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900"
            >
              {mostraFatti ? "Vedi quelli aperti" : "Vedi quelli fatti"}
            </button>

            <button
              type="button"
              onClick={() => setApertoNuovo((precedente) => !precedente)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Nuovo promemoria
            </button>
          </div>
        </div>

        {apertoNuovo ? (
          <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipo</span>
              <select
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {TIPI_PROMEMORIA.map((voce) => (
                  <option key={voce.valore} value={voce.valore}>
                    {voce.etichetta}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Quando</span>
              <input
                type="date"
                value={scadeIl}
                onChange={(evento) => setScadeIl(evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cosa (facoltativo)</span>
              <input
                type="text"
                value={titolo}
                onChange={(evento) => setTitolo(evento.target.value)}
                placeholder="Es. Richiamare Rossi per la Panda"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Note</span>
              <input
                type="text"
                value={note}
                onChange={(evento) => setNote(evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void crea()}
                disabled={salvataggio}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salva
              </button>
            </div>
          </div>
        ) : null}

        {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

        {caricamento ? (
          <p className="mt-6 text-sm text-slate-600">Caricamento promemoria...</p>
        ) : righe.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <BellRing className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold text-slate-900">
              {mostraFatti ? "Niente di gia' fatto" : "Nessun promemoria aperto"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
              {mostraFatti
                ? "Qui finiscono i promemoria che segni come fatti."
                : "Apri una vettura e scrivi quando scadono revisione e assicurazione, oppure segnati qui una cosa da fare."}
            </p>
          </div>
        ) : mostraFatti ? (
          <Elenco righe={righe} onFatto={null} onElimina={elimina} />
        ) : (
          <div className="mt-6 space-y-6">
            <Gruppo titolo="Scaduti" righe={gruppi.scaduti} onFatto={segnaFatto} onElimina={elimina} allarme />
            <Gruppo titolo="Oggi" righe={gruppi.oggi} onFatto={segnaFatto} onElimina={elimina} allarme />
            <Gruppo titolo="Questa settimana" righe={gruppi.settimana} onFatto={segnaFatto} onElimina={elimina} />
            <Gruppo titolo="Piu' avanti" righe={gruppi.piuAvanti} onFatto={segnaFatto} onElimina={elimina} />
          </div>
        )}
      </section>
    </DealerDashboardShell>
  );
}

function Gruppo({
  titolo,
  righe,
  onFatto,
  onElimina,
  allarme = false,
}: {
  titolo: string;
  righe: Riga[];
  onFatto: (riga: Riga) => void | Promise<void>;
  onElimina: (riga: Riga) => void | Promise<void>;
  allarme?: boolean;
}) {
  if (righe.length === 0) return null;

  return (
    <div>
      <p className={`text-sm font-semibold ${allarme ? "text-amber-800" : "text-slate-700"}`}>
        {titolo} ({righe.length})
      </p>
      <Elenco righe={righe} onFatto={onFatto} onElimina={onElimina} />
    </div>
  );
}

function Elenco({
  righe,
  onFatto,
  onElimina,
}: {
  righe: Riga[];
  onFatto: ((riga: Riga) => void | Promise<void>) | null;
  onElimina: (riga: Riga) => void | Promise<void>;
}) {
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {righe.map((riga) => {
        const quanto = urgenza(riga.scade_il);
        const vettura = riga.vehicle;

        return (
          <li key={riga.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{titoloPromemoria(riga)}</span>
              <span className="mt-0.5 block text-sm text-slate-600">
                {etichettaTipo(riga.tipo)}
                {vettura ? (
                  <>
                    {" · "}
                    <Link href={`/veicoli/${riga.vehicle_id}`} className="underline-offset-2 hover:underline">
                      {[vettura.plate, vettura.brand, vettura.model].filter(Boolean).join(" ")}
                    </Link>
                  </>
                ) : null}
                {riga.note ? ` · ${riga.note}` : ""}
              </span>
            </span>

            <span
              className={`flex-none text-sm font-semibold ${
                quanto?.scaduto ? "text-red-700" : quanto?.oggi ? "text-amber-700" : "text-slate-600"
              }`}
            >
              {quanto?.etichetta ?? riga.scade_il}
            </span>

            <span className="flex flex-none items-center gap-3">
              {onFatto ? (
                <button
                  type="button"
                  onClick={() => void onFatto(riga)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-900"
                >
                  <Check className="h-4 w-4" />
                  Fatto
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onElimina(riga)}
                title="Elimina"
                className="text-slate-400 transition hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
