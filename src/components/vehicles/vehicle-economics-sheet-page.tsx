"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import { resolveVehicleLabel } from "@/lib/public-marketplace";
import { formatRegistrationLabel, formatVehicleStatus } from "@/lib/vehicles";
import {
  VOCI_DI_COSTO,
  costoTotale,
  formattaImporto,
  margine,
  marginePercentuale,
  perche,
  type VociConto,
} from "@/lib/conto-economico";

/**
 * Il conto economico di una vettura, su un foglio A4 da stampare.
 *
 * E' un **documento interno**: quanto e' costata, voce per voce, e quanto ha
 * reso. Non e' la scheda del veicolo, che invece finisce sul parabrezza e non
 * deve riportare niente di tutto questo -- il prezzo di acquisto sul vetro di
 * un'auto in vendita e' l'unica cosa che non deve succedere mai. Sono due
 * fogli separati per questo motivo, e questo lo dice in fondo alla pagina.
 *
 * Le somme si rifanno qui e non si leggono dalle colonne calcolate del
 * database: sono le stesse formule di `conto-economico.ts`, gia' legate a
 * quelle del database da un test. Cosi' il foglio stampato dice esattamente
 * quello che il concessionario vede nella scheda a schermo.
 */

type ContoLetto = VociConto & {
  purchase_date: string | null;
  supplier: string | null;
  sale_date: string | null;
  notes: string | null;
};

type VeicoloLetto = {
  brand: string | null;
  model: string | null;
  version: string | null;
  plate: string | null;
  vin: string | null;
  mileage: number | null;
  registration_date: string | null;
  status: string | null;
};

type ConcessionariaLetta = {
  name: string | null;
  legal_name: string | null;
  city: string | null;
  province: string | null;
};

export function VehicleEconomicsSheetPage({ vehicleId }: { vehicleId: string }) {
  const [veicolo, setVeicolo] = useState<VeicoloLetto | null>(null);
  const [conto, setConto] = useState<ContoLetto | null>(null);
  const [concessionaria, setConcessionaria] = useState<ConcessionariaLetta | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

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

      const [{ data: rigaVeicolo, error: erroreVeicolo }, { data: rigaConto }, { data: rigaConcessionaria }] =
        await Promise.all([
          supabase
            .from("vehicles")
            .select("brand, model, version, plate, vin, mileage, registration_date, status")
            // Vincolato alla concessionaria oltre che all'identificativo: un
            // conto economico non deve poter essere stampato da un altro.
            .eq("id", vehicleId)
            .eq("dealer_id", dealerId)
            .maybeSingle<VeicoloLetto>(),
          supabase
            .from("vehicle_economics")
            .select(
              "purchase_price, purchase_date, supplier, cost_minivoltura, cost_transport, cost_bodywork, cost_workshop, cost_tyres, cost_preparation, cost_parts, cost_commission, cost_other, sale_price, sale_date, notes"
            )
            .eq("vehicle_id", vehicleId)
            .eq("dealer_id", dealerId)
            .maybeSingle<ContoLetto>(),
          supabase
            .from("dealers")
            .select("name, legal_name, city, province")
            .eq("id", dealerId)
            .maybeSingle<ConcessionariaLetta>(),
        ]);

      if (!vivo) return;

      if (erroreVeicolo || !rigaVeicolo) {
        setErrore("Veicolo non trovato.");
        setCaricamento(false);
        return;
      }

      setVeicolo(rigaVeicolo);
      setConto(rigaConto ?? null);
      setConcessionaria(rigaConcessionaria ?? null);
      setCaricamento(false);
    };

    void carica();
    return () => {
      vivo = false;
    };
  }, [vehicleId]);

  if (caricamento) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-200 text-sm text-slate-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparo il conto...
      </main>
    );
  }

  if (errore || !veicolo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-200">
        <div className="rounded-2xl bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-800">{errore ?? "Veicolo non trovato."}</p>
          <Link
            href={`/veicoli/${vehicleId}`}
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Torna al veicolo
          </Link>
        </div>
      </main>
    );
  }

  const nomeConcessionaria =
    testo(concessionaria?.name) ?? testo(concessionaria?.legal_name) ?? "Concessionaria";
  const luogo = [testo(concessionaria?.city), testo(concessionaria?.province)].filter(Boolean).join(" · ");
  const titolo = resolveVehicleLabel(veicolo as never);
  const voci: VociConto = conto ?? {};
  const totale = costoTotale(voci);
  const guadagno = margine(voci);
  const percentuale = marginePercentuale(voci);
  const manca = perche(voci);

  return (
    <main className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4">
        <Link href={`/veicoli/${vehicleId}`} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          ← Torna al veicolo
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />
          Stampa
        </button>
      </div>

      {/* `vehicle-sheet` e' la classe con cui questo progetto disegna un A4 da
          stampare: margini dentro il foglio, niente intestazioni del browser,
          blocchi che non si spezzano a meta'. */}
      <article className="vehicle-sheet mx-auto flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white p-[14mm] text-slate-900 shadow-lg print:min-h-0 print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-4">
          <div>
            <p className="text-lg font-bold uppercase tracking-[0.2em]">{nomeConcessionaria}</p>
            {luogo ? <p className="mt-1 text-xs text-slate-600">{luogo}</p> : null}
          </div>
          <p className="text-lg font-black tracking-tight">KEYAUTO</p>
        </header>

        <div className="sheet-block mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conto economico</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">{titolo}</h1>
        </div>

        {/* Marca, modello e allestimento non identificano niente: al
            31/08/2026 in produzione c'erano cinque "Peugeot 2008 Allure
            PureTech 100 S&S" identiche in tutto. Su un foglio che finisce in
            un fascicolo, e che a distanza di mesi deve dire **quale**
            automobile, targa e telaio sono la sola cosa che lo dice -- quindi
            stanno in una sezione propria, grandi, non in una riga sotto al
            titolo. */}
        <div className="sheet-block mt-6 border-2 border-slate-900 p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600">Identificazione del veicolo</h2>

          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3">
            <Identificativo etichetta="Targa" valore={testo(veicolo.plate)} grande />
            <Identificativo etichetta="Numero di telaio" valore={testo(veicolo.vin)} grande />
            <Identificativo
              etichetta="Immatricolazione"
              valore={formatRegistrationLabel(veicolo as never)}
            />
            <Identificativo
              etichetta="Chilometri"
              valore={
                typeof veicolo.mileage === "number" && Number.isFinite(veicolo.mileage)
                  ? `${new Intl.NumberFormat("it-IT").format(veicolo.mileage)} km`
                  : null
              }
            />
          </div>

          {/* Senza nessuno dei due il foglio non identifica la vettura, e
              tacerlo lo renderebbe inutile senza che chi lo stampa se ne
              accorga. */}
          {!testo(veicolo.plate) && !testo(veicolo.vin) ? (
            <p className="mt-3 border-t border-slate-300 pt-2 text-xs font-semibold text-slate-700">
              Questa vettura non ha ne&apos; targa ne&apos; numero di telaio: il foglio non dice quale automobile sia.
              Scrivili nella scheda del veicolo e ristampa.
            </p>
          ) : null}
        </div>

        {/* Senza nessun conto salvato il foglio non finge zeri: dice che non
            c'e' niente da stampare e dove si scrive. */}
        {!conto ? (
          <div className="sheet-block mt-8 border-2 border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm font-semibold">Per questa vettura non e&apos; stato ancora compilato nessun conto.</p>
            <p className="mt-1 text-sm text-slate-600">
              Si scrive nella scheda del veicolo, nel riquadro &laquo;Conto economico&raquo;.
            </p>
          </div>
        ) : null}

        <div className="sheet-block mt-8 grid grid-cols-2 gap-8">
          <section>
            <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.14em]">Acquisto</h2>
            <Voce etichetta="Prezzo di acquisto" valore={importo(voci.purchase_price)} forte />
            <Voce etichetta="Data di acquisto" valore={data(conto?.purchase_date)} />
            <Voce etichetta="Fornitore" valore={testo(conto?.supplier) ?? "—"} />
          </section>

          <section>
            <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.14em]">Vendita</h2>
            <Voce etichetta="Prezzo di vendita" valore={importo(voci.sale_price)} forte />
            <Voce etichetta="Data di vendita" valore={data(conto?.sale_date)} />
            <Voce etichetta="Stato" valore={formatVehicleStatus(veicolo.status, null)} />
          </section>
        </div>

        <div className="sheet-block mt-8">
          <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.14em]">Costi</h2>
          <div className="grid grid-cols-2 gap-x-8">
            {VOCI_DI_COSTO.map(({ campo, etichetta }) => (
              <Voce key={campo} etichetta={etichetta} valore={importo(voci[campo])} />
            ))}
          </div>
        </div>

        <div className="sheet-block mt-8 border-t-2 border-slate-900 pt-4">
          <Riga etichetta="Costo totale" valore={formattaImporto(totale)} />
          <Riga etichetta="Prezzo di vendita" valore={importo(voci.sale_price)} />
          <Riga
            etichetta="Margine"
            valore={guadagno === null ? "—" : formattaImporto(guadagno)}
            nota={manca ?? undefined}
            grande
          />
          <Riga etichetta="Marginalita" valore={percentuale === null ? "—" : `${percentuale.toFixed(1)}%`} />
        </div>

        {testo(conto?.notes) ? (
          <div className="sheet-block mt-8">
            <h2 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.14em]">Note</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-6">{testo(conto?.notes)}</p>
          </div>
        ) : null}

        <footer className="mt-auto border-t border-slate-300 pt-4 text-[10px] leading-4 text-slate-500">
          <p className="font-semibold uppercase tracking-[0.14em]">Documento interno — non consegnare al cliente</p>
          <p className="mt-1">
            Stampato il {data(oggi())}. Nessuno di questi importi compare sul marketplace, sulla scheda pubblica del
            veicolo o sulla scheda da parabrezza.
          </p>
        </footer>
      </article>
    </main>
  );
}

function Identificativo({ etichetta, valore, grande = false }: { etichetta: string; valore: string | null; grande?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{etichetta}</p>
      <p className={`mt-0.5 uppercase tracking-wide ${grande ? "text-xl font-bold" : "text-sm font-medium"}`}>
        {valore ?? "—"}
      </p>
    </div>
  );
}

function Voce({ etichetta, valore, forte = false }: { etichetta: string; valore: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 py-1.5 text-sm">
      <span className="text-slate-600">{etichetta}</span>
      <span className={`tabular-nums ${forte ? "font-semibold" : ""}`}>{valore}</span>
    </div>
  );
}

function Riga({
  etichetta,
  valore,
  nota,
  grande = false,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  grande?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between py-1 ${grande ? "text-lg font-bold" : "text-sm"}`}>
      <span>
        {etichetta}
        {nota ? <span className="ml-2 text-xs font-normal text-slate-500">({nota})</span> : null}
      </span>
      <span className="tabular-nums">{valore}</span>
    </div>
  );
}

function testo(valore: unknown): string | null {
  const pulito = String(valore ?? "").trim();
  return pulito.length > 0 ? pulito : null;
}

/**
 * Un costo a zero si stampa come trattino, non come "0,00 €".
 *
 * E' la stessa scelta della scheda a schermo, dove un campo mai compilato
 * resta vuoto: il database mette zero di suo su ogni voce di costo, quindi
 * stampare "0,00 €" farebbe sembrare compilato quello che nessuno ha toccato.
 */
function importo(valore: number | null | undefined): string {
  if (typeof valore !== "number" || !Number.isFinite(valore) || valore === 0) return "—";
  return formattaImporto(valore);
}

/** 12/08/2026, come la legge un italiano. */
function data(valore: string | null | undefined): string {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valore ?? ""));
  return trovato ? `${trovato[3]}/${trovato[2]}/${trovato[1]}` : "—";
}

function oggi(): string {
  const adesso = new Date();
  return `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, "0")}-${String(adesso.getDate()).padStart(2, "0")}`;
}
