"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import { caricaTutto } from "@/lib/carica-tutto";
import { formattaImporto } from "@/lib/conto-economico";
import { resolveVehicleLabel } from "@/lib/public-marketplace";
import { resolveVehicleLifecycleState } from "@/lib/vehicle-state-machine";
import {
  capitaleFermo,
  etichettaStato,
  oggiIso,
  quadroDelPiazzale,
  quadroDelVenduto,
  type Fascia,
  type FasciaId,
  type Quadro,
  type VetturaGiacenza,
} from "@/lib/giacenza";

/**
 * I giorni di giacenza, fascia per fascia, con dentro le singole vetture.
 *
 * Il grafico da' il quadro -- quante auto sono ferme da piu' di 90 giorni --
 * ma da solo non basta a fare niente: si clicca una fascia e sotto compaiono
 * **quali**, con targa e giorni esatti, e da li' si apre la scheda. Un numero
 * senza i nomi che ci stanno dietro e' una preoccupazione, non un'informazione.
 *
 * Due quadri separati e non uno: quanto e' fermo adesso, e quanto ci e' voluto
 * a vendere quello che e' stato venduto. Il perche' sta scritto in
 * `src/lib/giacenza.ts`.
 */

type RigaLetta = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  plate: string | null;
  vin: string | null;
  status: string | null;
  published: boolean | null;
  price: string | number | null;
  vehicle_economics: DatiConto | DatiConto[] | null;
};

type DatiConto = {
  purchase_date: string | null;
  sale_date: string | null;
};

function primoConto(valore: RigaLetta["vehicle_economics"]): DatiConto | null {
  return (Array.isArray(valore) ? valore[0] : valore) ?? null;
}

/** Il prezzo arriva come testo da import diversi: si legge, o non c'e'. */
function leggiPrezzo(valore: string | number | null): number | null {
  if (typeof valore === "number") return Number.isFinite(valore) ? valore : null;
  const pulito = String(valore ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const numero = Number(pulito);
  return pulito !== "" && Number.isFinite(numero) ? numero : null;
}

export function StockAgePage() {
  const [vetture, setVetture] = useState<VetturaGiacenza[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [fasciaPiazzale, setFasciaPiazzale] = useState<FasciaId | null>(null);
  const [fasciaVenduto, setFasciaVenduto] = useState<FasciaId | null>(null);

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

      // Letto per intero: un elenco troncato alle prime mille righe farebbe
      // sparire dal grafico proprio le vetture piu' vecchie, che sono quelle
      // per cui la pagina esiste.
      const elenco = await caricaTutto<RigaLetta>((da, a) =>
        supabase
          .from("vehicles")
          .select("id, brand, model, version, plate, vin, status, published, price, vehicle_economics(purchase_date, sale_date)")
          .eq("dealer_id", dealerId)
          .range(da, a)
          .returns<RigaLetta[]>()
      );

      if (!vivo) return;

      if (elenco.error) {
        setErrore("Non e stato possibile leggere il parco veicoli.");
        setCaricamento(false);
        return;
      }

      setVetture(
        elenco.righe.map((riga) => {
          const conto = primoConto(riga.vehicle_economics);
          return {
            vehicleId: riga.id,
            etichetta: resolveVehicleLabel(riga as never),
            targa: riga.plate ?? riga.vin ?? null,
            stato: resolveVehicleLifecycleState(riga.status, riga.published),
            purchaseDate: conto?.purchase_date ?? null,
            saleDate: conto?.sale_date ?? null,
            prezzo: leggiPrezzo(riga.price),
          };
        })
      );

      setCaricamento(false);
    };

    void carica();
    return () => {
      vivo = false;
    };
  }, []);

  const oggi = useMemo(() => oggiIso(), []);
  const piazzale = useMemo(() => quadroDelPiazzale(vetture, oggi), [vetture, oggi]);
  const venduto = useMemo(() => quadroDelVenduto(vetture), [vetture]);

  return (
    <DealerDashboardShell title="Giacenza">
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Giacenza</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Da quanto sono ferme le tue auto</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          I giorni si contano dalla <strong className="font-semibold text-slate-800">data di acquisto</strong>, quella che
          scrivi nel conto economico di ogni vettura. Non dalla data in cui l&apos;annuncio e&apos; stato caricato qui: sono
          due cose diverse, e un&apos;auto comprata a marzo e messa online ad agosto e&apos; ferma da cinque mesi, non da tre
          giorni.
        </p>
      </section>

      {errore ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</section>
      ) : null}

      {caricamento ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Sto contando i giorni...
        </section>
      ) : null}

      {!caricamento && vetture.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-800">Non c&apos;e&apos; ancora nessuna vettura in archivio.</p>
        </section>
      ) : null}

      {!caricamento && vetture.length > 0 ? (
        <>
          <QuadroSezione
            titolo="Ferme in piazzale oggi"
            sottotitolo="Bozze e pubblicate, dalla data di acquisto a oggi. Clicca una fascia per vedere quali."
            quadro={piazzale}
            fasciaScelta={fasciaPiazzale}
            onScegli={setFasciaPiazzale}
            mostraCapitale
            colonnaData="Acquistata il"
            campoData={(v) => v.purchaseDate}
            spiegazioneSenzaData="Sono in piazzale, ma senza data di acquisto non si sa da quando. Apri la scheda, riquadro Conto economico, e scrivi quando l'hai comprata."
          />

          <QuadroSezione
            titolo="Quanto ci e' voluto a venderle"
            sottotitolo="Solo le vetture gia' vendute, dalla data di acquisto a quella di vendita."
            quadro={venduto}
            fasciaScelta={fasciaVenduto}
            onScegli={setFasciaVenduto}
            colonnaData="Venduta il"
            campoData={(v) => v.saleDate}
            spiegazioneSenzaData="Manca la data di acquisto o quella di vendita, quindi la durata non si puo' calcolare. Non vuol dire che siano state vendute subito."
          />
        </>
      ) : null}
    </DealerDashboardShell>
  );
}

type QuadroSezioneProps = {
  titolo: string;
  sottotitolo: string;
  quadro: Quadro;
  fasciaScelta: FasciaId | null;
  onScegli: (fascia: FasciaId | null) => void;
  mostraCapitale?: boolean;
  colonnaData: string;
  campoData: (vettura: VetturaGiacenza) => string | null;
  spiegazioneSenzaData: string;
};

function QuadroSezione({
  titolo,
  sottotitolo,
  quadro,
  fasciaScelta,
  onScegli,
  mostraCapitale = false,
  colonnaData,
  campoData,
  spiegazioneSenzaData,
}: QuadroSezioneProps) {
  const massimo = Math.max(1, ...quadro.fasce.map((fascia) => fascia.vetture.length));
  const elencate = useMemo(() => {
    const scelte = fasciaScelta ? quadro.fasce.filter((f) => f.id === fasciaScelta) : quadro.fasce;
    return scelte.flatMap((fascia) => fascia.vetture).sort((a, b) => b.giorni - a.giorni);
  }, [quadro, fasciaScelta]);

  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{titolo}</h3>
          <p className="mt-1 text-sm text-slate-500">{sottotitolo}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{quadro.totale}</p>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">nel conto</p>
        </div>
      </div>

      {quadro.totale === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
          Nessuna vettura ha le date che servono per questo conto. Il grafico compare appena ne scrivi una.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-2">
            {quadro.fasce.map((fascia) => (
              <BarraFascia
                key={fascia.id}
                fascia={fascia}
                massimo={massimo}
                totale={quadro.totale}
                scelta={fasciaScelta === fascia.id}
                onScegli={() => onScegli(fasciaScelta === fascia.id ? null : fascia.id)}
                mostraCapitale={mostraCapitale}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>
              Media: <strong className="font-semibold tabular-nums text-slate-900">{quadro.giorniMedi} giorni</strong>
            </span>
            <span>
              La piu&apos; ferma: <strong className="font-semibold tabular-nums text-slate-900">{quadro.giorniMassimi} giorni</strong>
            </span>
          </div>
        </>
      )}

      {elencate.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900">
              {fasciaScelta ? quadro.fasce.find((f) => f.id === fasciaScelta)?.etichetta : "Tutte, dalla piu' ferma"}
              <span className="ml-2 text-sm font-normal text-slate-500">{elencate.length}</span>
            </h4>
            {fasciaScelta ? (
              <button type="button" onClick={() => onScegli(null)} className="text-sm font-semibold text-slate-700 underline">
                Mostra tutte
              </button>
            ) : null}
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <th className="pb-2 pr-4">Vettura</th>
                  <th className="pb-2 pr-4">Targa o telaio</th>
                  <th className="pb-2 pr-4">Stato</th>
                  <th className="pb-2 pr-4">{colonnaData}</th>
                  <th className="pb-2 pr-4 text-right">Prezzo</th>
                  <th className="pb-2 text-right">Giorni</th>
                </tr>
              </thead>
              <tbody>
                {elencate.map((vettura) => (
                  <tr key={vettura.vehicleId} className="border-b border-slate-100">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/veicoli/${vettura.vehicleId}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {vettura.etichetta}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 uppercase tracking-wide text-slate-600">{vettura.targa ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{etichettaStato(vettura.stato)}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{formattaData(campoData(vettura))}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">
                      {vettura.prezzo === null ? "—" : formattaImporto(vettura.prezzo)}
                    </td>
                    <td className={`py-2.5 text-right font-semibold tabular-nums ${coloreGiorni(vettura.giorni)}`}>
                      {vettura.giorni}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Le vetture senza data non stanno in nessuna fascia e non
          comparirebbero mai: sono automobili vere, e finche' restano fuori il
          grafico racconta meno parco di quello che c'e'. */}
      {quadro.senzaData.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-900">
            {quadro.senzaData.length === 1
              ? "Una vettura senza data, fuori dal conto"
              : `${quadro.senzaData.length} vetture senza data, fuori dal conto`}
          </h4>
          <p className="mt-1 text-sm leading-6 text-amber-900">{spiegazioneSenzaData}</p>
          <ElencoSemplice vetture={quadro.senzaData} />
        </div>
      ) : null}

      {quadro.incoerenti.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <h4 className="text-sm font-semibold text-red-900">
            {quadro.incoerenti.length === 1 ? "Una data che non sta in piedi" : `${quadro.incoerenti.length} date che non stanno in piedi`}
          </h4>
          <p className="mt-1 text-sm leading-6 text-red-900">
            Acquistata nel futuro, oppure venduta prima di essere stata comprata. Quasi sempre e&apos; un anno battuto
            storto: aprila e correggi la data.
          </p>
          <ElencoSemplice vetture={quadro.incoerenti} />
        </div>
      ) : null}
    </section>
  );
}

function ElencoSemplice({ vetture }: { vetture: VetturaGiacenza[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {vetture.map((vettura) => (
        <li key={vettura.vehicleId} className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <Link href={`/veicoli/${vettura.vehicleId}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
            {vettura.etichetta}
          </Link>
          <span className="uppercase tracking-wide text-slate-500">{vettura.targa ?? "senza targa"}</span>
          <span className="text-slate-500">{etichettaStato(vettura.stato)}</span>
        </li>
      ))}
    </ul>
  );
}

type BarraFasciaProps = {
  fascia: Fascia;
  massimo: number;
  totale: number;
  scelta: boolean;
  onScegli: () => void;
  mostraCapitale: boolean;
};

function BarraFascia({ fascia, massimo, totale, scelta, onScegli, mostraCapitale }: BarraFasciaProps) {
  const quante = fascia.vetture.length;
  const larghezza = `${Math.max((quante / massimo) * 100, quante > 0 ? 4 : 0)}%`;
  const capitale = mostraCapitale ? capitaleFermo(fascia.vetture) : null;
  const percentuale = totale > 0 ? Math.round((quante / totale) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onScegli}
      aria-pressed={scelta}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 ${scelta ? "bg-slate-100" : ""}`}
    >
      <span className="w-36 shrink-0 text-sm font-medium text-slate-700">{fascia.etichetta}</span>
      <span className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${coloreFascia(fascia.id)}`} style={{ width: larghezza }} />
      </span>
      <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{quante}</span>
      <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-slate-500 sm:block">{percentuale}%</span>
      {mostraCapitale ? (
        <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-slate-500 md:block">
          {capitale === null ? "" : formattaImporto(capitale)}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Il colore cresce con l'attesa: verde fino a due mesi, ambra fino a quattro,
 * rosso oltre. Il numero resta comunque scritto accanto -- chi non distingue
 * il verde dal rosso deve poter leggere lo stesso quadro.
 */
function coloreFascia(id: FasciaId): string {
  if (id === "0-30" || id === "31-60") return "bg-emerald-500";
  if (id === "61-90" || id === "91-120") return "bg-amber-500";
  return "bg-red-500";
}

function coloreGiorni(giorni: number): string {
  if (giorni <= 60) return "text-emerald-700";
  if (giorni <= 120) return "text-amber-700";
  return "text-red-700";
}

/** 12/08/2026, come la legge un italiano. */
function formattaData(valore: string | null): string {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valore ?? ""));
  return trovato ? `${trovato[3]}/${trovato[2]}/${trovato[1]}` : "—";
}
