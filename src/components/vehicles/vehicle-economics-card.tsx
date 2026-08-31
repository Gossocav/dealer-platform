"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { tabellaNonAncoraCreata } from "@/lib/tabella-mancante";
import {
  VOCI_DI_COSTO,
  costoTotale,
  formattaImporto,
  leggiImporto,
  margine,
  marginePercentuale,
  type VociConto,
} from "@/lib/conto-economico";

/**
 * Il conto economico di una vettura: quanto e' costata, quanto ha reso.
 *
 * Vive in una tabella a parte, invisibile al pubblico in blocco: `vehicles`
 * deve restare leggibile da chiunque perche' e' il marketplace, e la
 * protezione del database nasconde le righe, non le colonne. Metterci dentro
 * il prezzo d'acquisto vorrebbe dire pubblicarlo.
 *
 * Il totale e il margine si vedono mentre si digita, ma a scriverli
 * nell'archivio e' il database: qui sono un'anteprima, non la verita'.
 */

type ContoSalvato = VociConto & {
  purchase_date: string | null;
  supplier: string | null;
  sale_date: string | null;
  cost_other_note: string | null;
  notes: string | null;
  total_cost: number | null;
  margin: number | null;
};

const CAMPI_IMPORTO = ["purchase_price", "cost_transport", "cost_bodywork", "cost_workshop", "cost_preparation", "cost_parts", "cost_commission", "cost_other", "sale_price"] as const;

type CampoImporto = (typeof CAMPI_IMPORTO)[number];

type Modulo = Record<CampoImporto, string> & {
  purchase_date: string;
  supplier: string;
  sale_date: string;
  cost_other_note: string;
  notes: string;
};

const MODULO_VUOTO: Modulo = {
  purchase_price: "",
  cost_transport: "",
  cost_bodywork: "",
  cost_workshop: "",
  cost_preparation: "",
  cost_parts: "",
  cost_commission: "",
  cost_other: "",
  sale_price: "",
  purchase_date: "",
  supplier: "",
  sale_date: "",
  cost_other_note: "",
  notes: "",
};

function scrivi(valore: number | null | undefined): string {
  return typeof valore === "number" && Number.isFinite(valore) && valore !== 0
    ? String(valore).replace(".", ",")
    : "";
}

function voci(modulo: Modulo): VociConto {
  return Object.fromEntries(CAMPI_IMPORTO.map((campo) => [campo, leggiImporto(modulo[campo])])) as VociConto;
}

export function VehicleEconomicsCard({ vehicleId, dealerId }: { vehicleId: string; dealerId: string | null }) {
  const [modulo, setModulo] = useState<Modulo>(MODULO_VUOTO);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState<"fermo" | "invio" | "fatto" | "errore">("fermo");
  const [errore, setErrore] = useState<string | null>(null);
  const [daCreare, setDaCreare] = useState(false);

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      if (!dealerId) return;

      // Vincolata alla concessionaria oltre che al veicolo: il conto
      // economico di un'auto non deve poter uscire per quella di un altro.
      const { data, error } = await supabase
        .from("vehicle_economics")
        .select("purchase_price, purchase_date, supplier, cost_transport, cost_bodywork, cost_workshop, cost_preparation, cost_parts, cost_commission, cost_other, cost_other_note, sale_price, sale_date, notes, total_cost, margin")
        .eq("vehicle_id", vehicleId)
        .eq("dealer_id", dealerId)
        .maybeSingle<ContoSalvato>();

      if (!vivo) return;

      if (error) {
        // La finestra fra il codice in linea e la tabella creata a mano: dire
        // "operazione non riuscita" farebbe sembrare un guasto quello che e'
        // solo un passaggio non ancora fatto. Il passaggio e' applicare
        // 20260831010000_conto_economico_veicolo.sql, ma quel nome sullo
        // schermo non aiuterebbe il concessionario: non e' lui a doverlo fare.
        setDaCreare(tabellaNonAncoraCreata(error.message, "vehicle_economics"));
        setErrore(
          tabellaNonAncoraCreata(error.message, "vehicle_economics")
            ? null
            : "Non e stato possibile leggere il conto economico."
        );
        setCaricamento(false);
        return;
      }

      if (data) {
        setModulo({
          purchase_price: scrivi(data.purchase_price),
          cost_transport: scrivi(data.cost_transport),
          cost_bodywork: scrivi(data.cost_bodywork),
          cost_workshop: scrivi(data.cost_workshop),
          cost_preparation: scrivi(data.cost_preparation),
          cost_parts: scrivi(data.cost_parts),
          cost_commission: scrivi(data.cost_commission),
          cost_other: scrivi(data.cost_other),
          sale_price: scrivi(data.sale_price),
          purchase_date: data.purchase_date ?? "",
          supplier: data.supplier ?? "",
          sale_date: data.sale_date ?? "",
          cost_other_note: data.cost_other_note ?? "",
          notes: data.notes ?? "",
        });
      }

      setCaricamento(false);
    };

    void carica();
    return () => {
      vivo = false;
    };
  }, [vehicleId, dealerId]);

  const aggiorna = (campo: keyof Modulo, valore: string) => {
    setModulo((precedente) => ({ ...precedente, [campo]: valore }));
    setSalvataggio("fermo");
  };

  const conto = voci(modulo);
  const totale = costoTotale(conto);
  const guadagno = margine(conto);
  const percentuale = marginePercentuale(conto);

  // Un importo scritto storto non si salva in silenzio come zero: si dice.
  const importiIlleggibili = CAMPI_IMPORTO.filter((campo) => modulo[campo].trim() !== "" && leggiImporto(modulo[campo]) === null);

  const salva = async () => {
    if (!dealerId || importiIlleggibili.length > 0) return;

    setSalvataggio("invio");
    setErrore(null);

    const { error } = await supabase.from("vehicle_economics").upsert(
      {
        vehicle_id: vehicleId,
        dealer_id: dealerId,
        purchase_price: leggiImporto(modulo.purchase_price),
        purchase_date: modulo.purchase_date || null,
        supplier: modulo.supplier.trim() || null,
        cost_transport: leggiImporto(modulo.cost_transport) ?? 0,
        cost_bodywork: leggiImporto(modulo.cost_bodywork) ?? 0,
        cost_workshop: leggiImporto(modulo.cost_workshop) ?? 0,
        cost_preparation: leggiImporto(modulo.cost_preparation) ?? 0,
        cost_parts: leggiImporto(modulo.cost_parts) ?? 0,
        cost_commission: leggiImporto(modulo.cost_commission) ?? 0,
        cost_other: leggiImporto(modulo.cost_other) ?? 0,
        cost_other_note: modulo.cost_other_note.trim() || null,
        sale_price: leggiImporto(modulo.sale_price),
        sale_date: modulo.sale_date || null,
        notes: modulo.notes.trim() || null,
      },
      { onConflict: "vehicle_id" }
    );

    if (error) {
      setSalvataggio("errore");
      if (tabellaNonAncoraCreata(error.message, "vehicle_economics")) {
        setDaCreare(true);
        setErrore(null);
        return;
      }
      setErrore("Non e stato possibile salvare. Riprova, oppure segnala il problema.");
      return;
    }

    setSalvataggio("fatto");
  };

  if (caricamento) {
    return (
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Conto economico...
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conto economico</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Quanto e costata, quanto ha reso</h2>
        </div>
        <p className="max-w-xs text-xs leading-5 text-slate-500">
          Visibile solo a te. Questi dati non escono mai sul marketplace ne sulla scheda pubblica del veicolo.
        </p>
      </div>

      {/* Le due somme in cima: sono la ragione per cui si compila il resto. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Riquadro etichetta="Costo totale" valore={formattaImporto(totale)} />
        <Riquadro
          etichetta="Margine"
          valore={formattaImporto(guadagno)}
          tono={guadagno === null ? "neutro" : guadagno >= 0 ? "buono" : "cattivo"}
          nota={guadagno === null ? "si vede dopo la vendita" : undefined}
        />
        <Riquadro
          etichetta="Margine %"
          valore={percentuale === null ? "—" : `${percentuale.toFixed(1)}%`}
          tono={percentuale === null ? "neutro" : percentuale >= 0 ? "buono" : "cattivo"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Gruppo titolo="Acquisto">
          <Importo etichetta="Prezzo di acquisto" valore={modulo.purchase_price} onChange={(v) => aggiorna("purchase_price", v)} />
          <Data etichetta="Data di acquisto" valore={modulo.purchase_date} onChange={(v) => aggiorna("purchase_date", v)} />
          <Testo etichetta="Fornitore" valore={modulo.supplier} onChange={(v) => aggiorna("supplier", v)} placeholder="Da chi l'hai comprata" />
        </Gruppo>

        <Gruppo titolo="Costi">
          {VOCI_DI_COSTO.map(({ campo, etichetta }) => (
            <Importo key={campo} etichetta={etichetta} valore={modulo[campo]} onChange={(v) => aggiorna(campo, v)} />
          ))}
          {modulo.cost_other.trim() ? (
            <Testo etichetta="Che cos'e l'altro costo" valore={modulo.cost_other_note} onChange={(v) => aggiorna("cost_other_note", v)} placeholder="Es. gommatura" />
          ) : null}
        </Gruppo>

        <Gruppo titolo="Vendita">
          <Importo etichetta="Prezzo di vendita" valore={modulo.sale_price} onChange={(v) => aggiorna("sale_price", v)} />
          <Data etichetta="Data di vendita" valore={modulo.sale_date} onChange={(v) => aggiorna("sale_date", v)} />
          <Testo etichetta="Note" valore={modulo.notes} onChange={(v) => aggiorna("notes", v)} placeholder="Quello che ti serve ricordare" />
        </Gruppo>
      </div>

      {importiIlleggibili.length > 0 ? (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Un importo non si legge. Scrivilo come 18.000 oppure 18000,50: il punto separa le migliaia, la virgola i centesimi.
        </p>
      ) : null}

      {daCreare ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <p className="font-semibold">Il conto economico non e ancora attivo sul tuo account.</p>
          <p className="mt-1">
            E una funzione appena rilasciata: manca un ultimo passaggio dalla nostra parte, che si fa una volta sola. Quello
            che scrivi adesso non viene salvato. Se la vedi ancora domani, scrivici.
          </p>
        </div>
      ) : null}

      {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvataggio === "invio" || importiIlleggibili.length > 0 || daCreare}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {salvataggio === "invio" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salva il conto
        </button>
        {salvataggio === "fatto" ? <span className="text-sm font-semibold text-emerald-700">Salvato.</span> : null}
      </div>
    </section>
  );
}

function Riquadro({
  etichetta,
  valore,
  tono = "neutro",
  nota,
}: {
  etichetta: string;
  valore: string;
  tono?: "neutro" | "buono" | "cattivo";
  nota?: string;
}) {
  const colore = tono === "buono" ? "text-emerald-700" : tono === "cattivo" ? "text-red-700" : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{etichetta}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${colore}`}>{valore}</p>
      {nota ? <p className="mt-0.5 text-xs text-slate-500">{nota}</p> : null}
    </div>
  );
}

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{titolo}</p>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

const CLASSE_CAMPO =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";

function Importo({ etichetta, valore, onChange }: { etichetta: string; valore: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{etichetta}</span>
      <div className="relative">
        <input
          inputMode="decimal"
          value={valore}
          onChange={(evento) => onChange(evento.target.value)}
          placeholder="0"
          className={`${CLASSE_CAMPO} pr-8 tabular-nums`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
      </div>
    </label>
  );
}

function Data({ etichetta, valore, onChange }: { etichetta: string; valore: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{etichetta}</span>
      <input type="date" value={valore} onChange={(evento) => onChange(evento.target.value)} className={CLASSE_CAMPO} />
    </label>
  );
}

function Testo({
  etichetta,
  valore,
  onChange,
  placeholder,
}: {
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{etichetta}</span>
      <input value={valore} onChange={(evento) => onChange(evento.target.value)} placeholder={placeholder} className={CLASSE_CAMPO} />
    </label>
  );
}
