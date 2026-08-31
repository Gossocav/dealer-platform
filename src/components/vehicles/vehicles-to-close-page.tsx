"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import { caricaTutto } from "@/lib/carica-tutto";
import { formattaImporto, leggiImporto } from "@/lib/conto-economico";
import { tabellaNonAncoraCreata } from "@/lib/tabella-mancante";
import {
  aspettaUnaRisposta,
  dataDiVenditaProposta,
  giorniDiAttesa,
  prezzoDiVenditaProposto,
  type VeicoloDaChiudere,
} from "@/lib/auto-da-chiudere";
import { resolveVehicleLabel } from "@/lib/public-marketplace";

/**
 * Le automobili sparite dal sito della concessionaria, da chiudere.
 *
 * Il sistema sa **che** e' successo qualcosa -- la vettura non c'e' piu' sul
 * sito -- e non sa **cosa**. Questa schermata chiede l'unica cosa che sa solo
 * il concessionario: venduta a quanto, oppure ritirata.
 *
 * Niente si chiude da solo: un'auto puo' sparire anche per un intoppo del
 * sito, e una vendita inventata falserebbe il margine del mese.
 */

type Riga = VeicoloDaChiudere & {
  targa: string;
  telaio: string;
  prezzoVendita: string;
  dataVendita: string;
  inCorso: boolean;
  esito: "aperta" | "venduta" | "ritirata" | "errore";
};

export function VehiclesToClosePage() {
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [dealerName, setDealerName] = useState("");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [contiDaCreare, setContiDaCreare] = useState(false);

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

      const risolto = await resolveDealerIdFromTenantSources(supabase, userId, { activeDealerId: getActiveDealerId() });
      if (!vivo) return;

      if (!risolto) {
        setErrore("Concessionaria non associata all'utente.");
        setCaricamento(false);
        return;
      }

      setDealerId(risolto);

    const [{ data: concessionaria }, elenco] = await Promise.all([
      supabase.from("dealers").select("legal_name, name").eq("id", risolto).maybeSingle<{ legal_name: string | null; name: string | null }>(),
      // Letto per intero: da qui esce un elenco di cose da fare, e un elenco
      // troncato in silenzio si manifesterebbe come lavoro che sparisce.
      caricaTutto<VeicoloDaChiudere>((da, a) =>
        supabase
          .from("vehicles")
          .select("id, brand, model, version, price, status, plate, vin, import_missing_since")
          .eq("dealer_id", risolto)
          .not("import_missing_since", "is", null)
          .order("import_missing_since", { ascending: true })
          .range(da, a)
      ),
    ]);

      if (!vivo) return;

      setDealerName(String(concessionaria?.legal_name ?? concessionaria?.name ?? "").trim());

      if (elenco.error) {
        setErrore("Non e stato possibile leggere l'elenco.");
        setCaricamento(false);
        return;
      }

    setRighe(
      elenco.righe.filter(aspettaUnaRisposta).map((veicolo) => ({
        ...veicolo,
        targa: veicolo.plate ?? "",
        telaio: veicolo.vin ?? "",
        prezzoVendita: prezzoDiVenditaProposto(veicolo)?.toString().replace(".", ",") ?? "",
        dataVendita: dataDiVenditaProposta(veicolo),
        inCorso: false,
        esito: "aperta" as const,
      }))
    );
      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, []);

  const aggiorna = (id: string, campi: Partial<Riga>) => {
    setRighe((precedenti) => precedenti.map((riga) => (riga.id === id ? { ...riga, ...campi } : riga)));
  };

  const chiudi = async (riga: Riga, come: "venduta" | "ritirata") => {
    if (!dealerId) return;

    const targa = riga.targa.trim();
    const telaio = riga.telaio.trim();
    const prezzo = leggiImporto(riga.prezzoVendita);

    // Targa o telaio: sono l'unica cosa che dice **quale** automobile e'
    // stata venduta. Marca e modello si ripetono -- in produzione c'erano
    // cinque "Peugeot 2008 Allure PureTech 100 S&S" identiche in tutto -- e
    // fra sei mesi un archivio senza targa non e' piu' ricostruibile.
    // Lo pretende anche il database, con un trigger: qui si dice prima, per
    // non far arrivare il concessionario a un errore che poteva evitare.
    if (come === "venduta" && !targa && !telaio) {
      aggiorna(riga.id, { esito: "errore" });
      setErrore("Per segnare una vettura come venduta serve la targa oppure il numero di telaio.");
      return;
    }

    // Il prezzo invece **non** e' obbligatorio, ed e' una scelta: pretenderlo
    // costringerebbe a inventare una cifra pur di chiudere la riga, ed e' il
    // modo piu' sicuro di riempire l'archivio di numeri falsi. I conti li
    // scrive il concessionario se e quando vuole.
    if (come === "venduta" && riga.prezzoVendita.trim() !== "" && prezzo === null) {
      aggiorna(riga.id, { esito: "errore" });
      setErrore("Il prezzo non si legge. Scrivilo come 18.000 oppure 18000,50, oppure lascialo vuoto.");
      return;
    }

    aggiorna(riga.id, { inCorso: true });
    setErrore(null);

    // Prima il conto economico, poi lo stato del veicolo: se il primo
    // fallisce l'auto resta da chiudere e si riprova, mentre l'ordine opposto
    // lascerebbe una vettura segnata venduta senza il prezzo che la spiega.
    if (come === "venduta" && (prezzo !== null || riga.dataVendita)) {
      const { error: erroreConto } = await supabase.from("vehicle_economics").upsert(
        { vehicle_id: riga.id, dealer_id: dealerId, sale_price: prezzo, sale_date: riga.dataVendita || null },
        { onConflict: "vehicle_id" }
      );

      if (erroreConto) {
        aggiorna(riga.id, { inCorso: false, esito: "errore" });
        if (tabellaNonAncoraCreata(erroreConto.message, "vehicle_economics")) {
          setContiDaCreare(true);
          return;
        }
        setErrore("Non e stato possibile salvare il prezzo di vendita.");
        return;
      }
    }

    const { error: erroreVeicolo } = await supabase
      .from("vehicles")
      .update({
        // La sincronizzazione non tocca targa e telaio -- non li legge dal
        // sito -- quindi quello che si scrive qui resta.
        plate: targa || null,
        vin: telaio || null,
        status: come === "venduta" ? "sold" : "archived",
        published: false,
        // Non aspetta piu' una risposta: l'ha appena data lui.
        import_missing_since: null,
      })
      .eq("id", riga.id)
      .eq("dealer_id", dealerId);

    if (erroreVeicolo) {
      aggiorna(riga.id, { inCorso: false, esito: "errore" });
      setErrore("Non e stato possibile aggiornare lo stato del veicolo.");
      return;
    }

    aggiorna(riga.id, { inCorso: false, esito: come });
  };

  const aperte = useMemo(() => righe.filter((riga) => riga.esito === "aperta" || riga.esito === "errore"), [righe]);
  const chiuse = righe.length - aperte.length;

  return (
    <DealerDashboardShell title="Da chiudere" dealerName={dealerName}>
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Da chiudere</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">
          {caricamento ? "..." : aperte.length === 0 ? "Nessuna vettura in attesa" : `${aperte.length} vetture sparite dal tuo sito`}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Queste automobili non sono piu sul tuo sito e le abbiamo tolte dalla vetrina. Non le segniamo vendute da sole: potresti
          averle ritirate tu, o il sito potrebbe aver avuto un intoppo. Dicci com e andata e il conto economico si chiude.
        </p>
        {chiuse > 0 ? <p className="mt-3 text-sm font-semibold text-emerald-700">{chiuse} chiuse in questa sessione.</p> : null}
      </section>

      {errore ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</section>
      ) : null}

      {contiDaCreare ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Il conto economico non e ancora attivo sul tuo account. E una funzione appena rilasciata: manca un ultimo passaggio
          dalla nostra parte. Puoi comunque segnare le vetture come ritirate.
        </section>
      ) : null}

      {caricamento ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Sto cercando le vetture da chiudere...
        </section>
      ) : null}

      {!caricamento && aperte.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center">
          <p className="text-sm text-slate-600">
            Non c e niente in sospeso. Quando una vettura sparira dal tuo sito la troverai qui.
          </p>
          <Link href="/veicoli" className="mt-4 inline-block text-sm font-semibold text-slate-900 underline">
            Torna al parco auto
          </Link>
        </section>
      ) : null}

      {aperte.map((riga) => {
        const attesa = giorniDiAttesa(riga);

        return (
          <section key={riga.id} className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/veicoli/${riga.id}`} className="text-lg font-semibold text-slate-900 underline-offset-2 hover:underline">
                  {resolveVehicleLabel(riga as never)}
                </Link>
                <p className="mt-1 text-sm text-slate-500">
                  Era esposta a {formattaImporto(riga.price)}
                  {attesa !== null ? ` · sparita dal sito ${attesa === 0 ? "oggi" : `${attesa} giorni fa`}` : ""}
                </p>
              </div>
            </div>

            {/* Targa e telaio per primi, e segnati come obbligatori: sono
                l'unica cosa che dice quale automobile e' stata venduta.
                Arrivano vuoti perche' l'importazione dal sito non li espone. */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Targa *</span>
                <input
                  value={riga.targa}
                  onChange={(evento) => aggiorna(riga.id, { targa: evento.target.value.toUpperCase(), esito: "aperta" })}
                  placeholder="AB123CD"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase tracking-wide text-slate-900 outline-none focus:border-slate-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">oppure numero di telaio *</span>
                <input
                  value={riga.telaio}
                  onChange={(evento) => aggiorna(riga.id, { telaio: evento.target.value.toUpperCase(), esito: "aperta" })}
                  placeholder="WAUZZZ8K..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase tracking-wide text-slate-900 outline-none focus:border-slate-900"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Venduta a <span className="font-normal text-slate-400">(facoltativo)</span></span>
                <input
                  inputMode="decimal"
                  value={riga.prezzoVendita}
                  onChange={(evento) => aggiorna(riga.id, { prezzoVendita: evento.target.value, esito: "aperta" })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-slate-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Il giorno <span className="font-normal text-slate-400">(facoltativo)</span></span>
                <input
                  type="date"
                  value={riga.dataVendita}
                  onChange={(evento) => aggiorna(riga.id, { dataVendita: evento.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
                />
              </label>

              <button
                type="button"
                onClick={() => void chiudi(riga, "venduta")}
                disabled={riga.inCorso}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {riga.inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Venduta
              </button>

              <button
                type="button"
                onClick={() => void chiudi(riga, "ritirata")}
                disabled={riga.inCorso}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Solo ritirata
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              <strong className="font-semibold text-slate-700">Targa o telaio servono per forza</strong>: sono l&apos;unica cosa
              che dice quale vettura e stata venduta. Prezzo e data invece li scrivi se vuoi &mdash; quelli proposti sono il
              prezzo di listino e il giorno in cui e sparita dal sito. &laquo;Solo ritirata&raquo; la mette in archivio senza
              registrare nessuna vendita.
            </p>
          </section>
        );
      })}
    </DealerDashboardShell>
  );
}
