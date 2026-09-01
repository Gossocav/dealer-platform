"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { caricaTutto } from "@/lib/carica-tutto";
import { dimensioneCifra } from "@/lib/cifre";
import { formattaImporto } from "@/lib/conto-economico";
import { tabellaNonAncoraCreata } from "@/lib/tabella-mancante";
import { resolveVehicleLabel } from "@/lib/public-marketplace";
import {
  inPerdita,
  meseCorrente,
  mesiConVendite,
  migliori,
  nomeDelMese,
  peggiori,
  riepilogoDelMese,
  type ContoVenduto,
} from "@/lib/statistiche-margine";

/**
 * Quanto ha guadagnato questo mese.
 *
 * E' la domanda per cui il conto economico di ogni singola vettura esiste:
 * finche' i margini restano chiusi nelle schede, nessuno li guarda.
 *
 * Un dato che manca non vale zero. Le vetture chiuse senza prezzo -- cosa
 * permessa apposta, i conti sono a discrezione del concessionario -- restano
 * fuori dai calcoli, e la schermata dice quante sono: un numero accanto al
 * quale c'e' scritto "di cui due senza prezzo" e' un numero di cui ci si puo'
 * fidare.
 */

type RigaLetta = {
  vehicle_id: string;
  sale_date: string | null;
  sale_price: number | null;
  total_cost: number | null;
  margin: number | null;
  // La relazione col veicolo: Supabase la tipizza come elenco, PostgREST
  // restituisce un oggetto quando il legame e' uno-a-uno. Si accettano
  // entrambe le forme invece di scommettere su una.
  vehicles: DatiVeicolo | DatiVeicolo[] | null;
};

type DatiVeicolo = { brand: string | null; model: string | null; version: string | null };

function primoVeicolo(valore: RigaLetta["vehicles"]): DatiVeicolo {
  const trovato = Array.isArray(valore) ? valore[0] : valore;
  return trovato ?? { brand: null, model: null, version: null };
}

export function MarginSummary({ dealerId }: { dealerId: string | null }) {
  const [conti, setConti] = useState<ContoVenduto[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [daCreare, setDaCreare] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [mese, setMese] = useState<string>(() => meseCorrente());

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      if (!dealerId) return;

      // Letto per intero: da qui escono somme, e una somma su un elenco
      // troncato in silenzio e' un numero sbagliato che sembra giusto.
      const esito = await caricaTutto<RigaLetta>((da, a) =>
        supabase
          .from("vehicle_economics")
          .select("vehicle_id, sale_date, sale_price, total_cost, margin, vehicles(brand, model, version)")
          .eq("dealer_id", dealerId)
          .not("sale_date", "is", null)
          .order("sale_date", { ascending: false })
          .range(da, a)
          .returns<RigaLetta[]>()
      );

      if (!vivo) return;

      if (esito.error) {
        setDaCreare(tabellaNonAncoraCreata(esito.error.message, "vehicle_economics"));
        setErrore(tabellaNonAncoraCreata(esito.error.message, "vehicle_economics") ? null : "Non e stato possibile leggere i conti.");
        setCaricamento(false);
        return;
      }

      const letti: ContoVenduto[] = esito.righe.map((riga) => ({
        vehicleId: riga.vehicle_id,
        etichetta: resolveVehicleLabel(primoVeicolo(riga.vehicles) as never),
        saleDate: riga.sale_date,
        salePrice: riga.sale_price,
        totalCost: riga.total_cost,
        margin: riga.margin,
      }));

      setConti(letti);

      // Si apre sul mese corrente, ma se non c'e' ancora nessuna vendita si
      // apre sull'ultimo mese che ne ha: una schermata vuota all'apertura fa
      // credere che non funzioni.
      const mesi = mesiConVendite(letti);
      if (mesi.length > 0 && !mesi.includes(meseCorrente())) {
        setMese(mesi[0]);
      }

      setCaricamento(false);
    };

    void carica();
    return () => {
      vivo = false;
    };
  }, [dealerId]);

  const mesi = useMemo(() => mesiConVendite(conti), [conti]);
  const riepilogo = useMemo(() => riepilogoDelMese(conti, mese), [conti, mese]);
  const delMese = useMemo(() => conti.filter((conto) => (conto.saleDate ?? "").startsWith(mese)), [conti, mese]);
  const perdite = useMemo(() => inPerdita(delMese), [delMese]);

  if (caricamento) {
    return (
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Conto del mese...
        </p>
      </section>
    );
  }

  if (daCreare) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 sm:p-6">
        <p className="font-semibold">Il conto del mese non e ancora attivo sul tuo account.</p>
        <p className="mt-1">E una funzione appena rilasciata: manca un ultimo passaggio dalla nostra parte.</p>
      </section>
    );
  }

  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Il conto del mese</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Quanto hai guadagnato</h3>
        </div>

        {mesi.length > 0 ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mese</span>
            <select
              value={mese}
              onChange={(evento) => setMese(evento.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {(mesi.includes(mese) ? mesi : [mese, ...mesi]).map((voce) => (
                <option key={voce} value={voce}>
                  {nomeDelMese(voce)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {errore ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

      {conti.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-slate-50 px-5 py-6 text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-800">Nessuna vendita registrata, per ora.</p>
          <p className="mt-1">
            Il conto si riempie da solo man mano che chiudi le vetture vendute e ne scrivi il prezzo.{" "}
            <Link href="/veicoli/da-chiudere" className="font-semibold text-slate-900 underline">
              Vai a Da chiudere
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cifra etichetta="Margine del mese" valore={formattaImporto(riepilogo.margine)} tono={riepilogo.margine >= 0 ? "buono" : "cattivo"} />
            <Cifra
              etichetta="Marginalita"
              valore={riepilogo.marginePercentuale === null ? "—" : `${riepilogo.marginePercentuale.toFixed(1)}%`}
              nota="sul venduto"
            />
            <Cifra etichetta="Venduto" valore={formattaImporto(riepilogo.ricavo)} nota={`${riepilogo.conMargine} vetture`} />
            <Cifra
              etichetta="Margine per vettura"
              valore={formattaImporto(riepilogo.marginePerVettura)}
              nota="media del mese"
            />
          </div>

          {/* Non si dice piu' "manca il prezzo di vendita": dal 31/08/2026 il
              margine esige anche quello di acquisto, e in produzione c'era
              gia' una vettura venduta a 11.500 con l'acquisto mai inserito.
              Dirle di scrivere il prezzo di vendita l'avrebbe mandata a
              cercare un dato che c'era gia'. */}
          {riepilogo.senzaConto > 0 ? (
            <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
              In questo mese risultano <strong className="font-semibold text-slate-800">{riepilogo.venduti} vetture vendute</strong>, ma{" "}
              <strong className="font-semibold text-slate-800">{riepilogo.senzaConto}</strong>{" "}
              {riepilogo.senzaConto === 1 ? "non ha" : "non hanno"} il conto completo &mdash; manca il prezzo di acquisto o quello
              di vendita &mdash; e quindi {riepilogo.senzaConto === 1 ? "non entra" : "non entrano"} in questi calcoli. La scheda
              del veicolo dice quale dei due manca.
            </p>
          ) : null}

          {perdite.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-800">
                {perdite.length === 1 ? "Una vettura venduta in perdita" : `${perdite.length} vetture vendute in perdita`}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {perdite.map((conto) => (
                  <Voce key={conto.vehicleId} conto={conto} />
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Classifica titolo="Hanno reso di piu" voci={migliori(delMese)} vuoto="Nessuna vettura con il prezzo, in questo mese." />
            <Classifica titolo="Hanno reso di meno" voci={peggiori(delMese)} vuoto="Nessuna vettura con il prezzo, in questo mese." />
          </div>
        </>
      )}
    </section>
  );
}

function Cifra({ etichetta, valore, nota, tono = "neutro" }: { etichetta: string; valore: string; nota?: string; tono?: "neutro" | "buono" | "cattivo" }) {
  const colore = tono === "buono" ? "text-emerald-700" : tono === "cattivo" ? "text-red-700" : "text-slate-900";

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-500">{etichetta}</p>
      {/* Stessa regola dei riquadri del parco auto: la misura scende quando
          la cifra si allunga, invece di uscire dal bordo. */}
      <p className={`mt-3 break-words font-semibold tabular-nums leading-tight ${dimensioneCifra(valore)} ${colore}`}>
        {valore}
      </p>
      {nota ? <p className="mt-1 text-xs text-slate-500">{nota}</p> : null}
    </div>
  );
}

function Classifica({ titolo, voci, vuoto }: { titolo: string; voci: ContoVenduto[]; vuoto: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <p className="text-sm font-semibold text-slate-900">{titolo}</p>
      {voci.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{vuoto}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {voci.map((conto) => (
            <Voce key={conto.vehicleId} conto={conto} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Voce({ conto }: { conto: ContoVenduto }) {
  const positivo = (conto.margin ?? 0) >= 0;

  return (
    <li className="flex items-baseline justify-between gap-3">
      <Link href={`/veicoli/${conto.vehicleId}`} className="min-w-0 truncate text-sm text-slate-700 underline-offset-2 hover:underline">
        {conto.etichetta}
      </Link>
      <span className={`flex-none text-sm font-semibold tabular-nums ${positivo ? "text-emerald-700" : "text-red-700"}`}>
        {formattaImporto(conto.margin)}
      </span>
    </li>
  );
}
