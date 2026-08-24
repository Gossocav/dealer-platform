"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import {
  dotazioniVeicolo,
  etichettaCliente,
  pianoIncludeSchedaConsegna,
  righeCliente,
  righeConcessionaria,
  righeVeicolo,
  type ClienteInConsegna,
  type ConcessionariaInIntestazione,
  type RigaConsegna,
  type VeicoloDaConsegnare,
} from "@/lib/scheda-consegna";
import { usePianoInVigore } from "@/lib/use-piano-in-vigore";

const COLONNE_VEICOLO = [
  "id",
  "brand",
  "model",
  "version",
  "plate",
  "vin",
  "registration_date",
  "year",
  "mileage",
  "fuel",
  "transmission",
  "color",
  "warranty",
  "equipment",
].join(", ");

const COLONNE_CLIENTE = "id, first_name, last_name, company, fiscal_code, vat_number, address, zip_code, city, province, phone, mobile, email";

type ClienteInArchivio = ClienteInConsegna & { id: string };

/**
 * La scheda di consegna veicolo, servizio del Piano Elite.
 *
 * Non salva niente. E' un foglio: si sceglie il cliente, si scrivono data e
 * chilometri, si stampa, si firma. Un registro delle consegne vorrebbe una
 * tabella nuova nel database, e in questo progetto le modifiche al database le
 * applica a mano il titolare: si fa quando serve davvero, non "per quando
 * servira'".
 */
export function VehicleDeliverySheetPage({ vehicleId }: { vehicleId: string }) {
  const [vehicle, setVehicle] = useState<VeicoloDaConsegnare | null>(null);
  const [dealer, setDealer] = useState<ConcessionariaInIntestazione | null>(null);
  const [clienti, setClienti] = useState<ClienteInArchivio[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [dataConsegna, setDataConsegna] = useState("");
  const [kmConsegna, setKmConsegna] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { planCode, caricamento: caricamentoPiano } = usePianoInVigore();

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        if (alive) {
          setError("Sessione non valida. Effettua di nuovo il login.");
          setLoading(false);
        }
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!dealerId) {
        if (alive) {
          setError("Concessionaria non associata all'utente.");
          setLoading(false);
        }
        return;
      }

      const [{ data: vehicleRow, error: vehicleError }, { data: dealerRow }, { data: customerRows }] = await Promise.all([
        supabase
          .from("vehicles")
          .select(COLONNE_VEICOLO)
          // Vincolata alla concessionaria oltre che all'identificativo: una
          // scheda di consegna non deve poter uscire per l'auto di un altro.
          .eq("id", vehicleId)
          .eq("dealer_id", dealerId)
          .maybeSingle<VeicoloDaConsegnare>(),
        supabase
          .from("dealers")
          .select("legal_name, name, address, zip_code, city, province, vat_number, phone, email")
          .eq("id", dealerId)
          .maybeSingle<ConcessionariaInIntestazione>(),
        supabase
          .from("customers")
          .select(COLONNE_CLIENTE)
          .eq("dealer_id", dealerId)
          .order("last_name", { ascending: true, nullsFirst: false }),
      ]);

      if (!alive) return;

      if (vehicleError || !vehicleRow) {
        setError(vehicleError?.message || "Veicolo non trovato.");
        setLoading(false);
        return;
      }

      setVehicle(vehicleRow);
      setDealer(dealerRow ?? null);
      setClienti((customerRows ?? []) as ClienteInArchivio[]);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [vehicleId]);

  const cliente = useMemo(() => clienti.find((voce) => voce.id === clienteId) ?? null, [clienti, clienteId]);
  const dealerName = String(dealer?.legal_name ?? dealer?.name ?? "").trim() || "Concessionaria";
  const dotazioni = useMemo(() => dotazioniVeicolo(vehicle?.equipment), [vehicle]);

  if (loading || caricamentoPiano) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-200">
        <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-200 px-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-sm text-slate-700">{error}</p>
          <Link href={`/veicoli/${vehicleId}`} className="mt-4 inline-block text-sm font-semibold text-slate-900 underline">
            Torna al veicolo
          </Link>
        </div>
      </main>
    );
  }

  // Il piano si controlla qui e non si nasconde soltanto il bottone: chi
  // arriva all'indirizzo a mano deve leggere perche' non puo' entrare, invece
  // di trovare un foglio che non gli spetta.
  if (!pianoIncludeSchedaConsegna(planCode)) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-200 px-4">
        <div className="max-w-lg rounded-2xl bg-white p-8 shadow">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Scheda di consegna</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Disponibile con il Piano Elite</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            La scheda di consegna e il documento da stampare e far firmare al cliente quando ritira il veicolo. E compresa
            nel Piano Elite, insieme alla capienza di 300 annunci e alla promozione sui canali social.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/abbonamento"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Vedi i piani
            </Link>
            <Link
              href={`/veicoli/${vehicleId}`}
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Torna al veicolo
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 max-w-[210mm] px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

        <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 shadow sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cliente</span>
            <select
              value={clienteId}
              onChange={(evento) => setClienteId(evento.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Compila a mano sul foglio</option>
              {clienti.map((voce) => (
                <option key={voce.id} value={voce.id}>
                  {etichettaCliente(voce)}
                </option>
              ))}
            </select>
            {clienti.length === 0 ? (
              <span className="mt-1 block text-xs text-slate-500">
                Non ci sono clienti in archivio: le righe restano vuote da compilare al momento della consegna.
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Data di consegna</span>
            <input
              type="date"
              value={dataConsegna}
              onChange={(evento) => setDataConsegna(evento.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Chilometri alla consegna
            </span>
            <input
              inputMode="numeric"
              value={kmConsegna}
              onChange={(evento) => setKmConsegna(evento.target.value)}
              placeholder="Es. 78500"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Note</span>
            <textarea
              value={note}
              onChange={(evento) => setNote(evento.target.value)}
              rows={2}
              placeholder="Accessori consegnati, secondo set di chiavi, interventi concordati..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
            Quello che scrivi qui finisce sul foglio ma non viene salvato: la scheda e un documento da stampare, non un
            registro delle consegne.
          </p>
        </div>
      </div>

      <article className="vehicle-sheet mx-auto flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white p-[14mm] text-slate-900 shadow-lg print:min-h-0 print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-4">
          <div>
            <p className="text-lg font-bold uppercase tracking-[0.16em]">{dealerName}</p>
            {righeConcessionaria(dealer ?? {}).map((riga) => (
              <p key={riga} className="text-[11px] leading-4 text-slate-600">
                {riga}
              </p>
            ))}
          </div>
          <p className="text-lg font-black tracking-tight">KEYAUTO</p>
        </header>

        <h1 className="mt-6 text-[26px] font-black uppercase leading-none tracking-tight">Scheda di consegna veicolo</h1>

        <Blocco titolo="Il veicolo consegnato">
          <Righe righe={righeVeicolo(vehicle ?? {})} />
        </Blocco>

        <Blocco titolo="Chi ritira il veicolo">
          <Righe righe={righeCliente(cliente)} />
        </Blocco>

        <Blocco titolo="Consegna">
          <Righe
            righe={[
              { etichetta: "Data di consegna", valore: formattaDataItaliana(dataConsegna) },
              { etichetta: "Chilometri alla consegna", valore: normalizzaKm(kmConsegna) },
              { etichetta: "Garanzia", valore: pulisci(vehicle?.warranty) },
            ]}
          />
        </Blocco>

        {dotazioni.length > 0 ? (
          <Blocco titolo="Dotazioni">
            <p className="text-[11px] leading-5 text-slate-700">{dotazioni.join(" • ")}</p>
          </Blocco>
        ) : null}

        <Blocco titolo="Note">
          {note.trim() ? (
            <p className="whitespace-pre-line text-[11px] leading-5 text-slate-700">{note.trim()}</p>
          ) : (
            <div className="space-y-4 pt-1">
              <LineaVuota />
              <LineaVuota />
            </div>
          )}
        </Blocco>

        <p className="mt-6 text-[10px] leading-4 text-slate-600">
          Il cliente dichiara di aver ritirato il veicolo sopra descritto, di averne verificato lo stato e la
          corrispondenza ai dati riportati, e di aver ricevuto i documenti di circolazione e le chiavi.
        </p>

        <div className="mt-auto grid grid-cols-2 gap-10 pt-12">
          <Firma etichetta="Timbro e firma della concessionaria" />
          <Firma etichetta="Firma del cliente per ricevuta" />
        </div>
      </article>
    </main>
  );
}

function Blocco({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{titolo}</h2>
      <div className="mt-2 border-t border-slate-300 pt-2">{children}</div>
    </section>
  );
}

/**
 * Un valore che manca non diventa un trattino: diventa una riga su cui
 * scrivere. Su un foglio da firmare il trattino sembra dire "non ce l'ha",
 * la riga dice "compilami".
 */
function Righe({ righe }: { righe: RigaConsegna[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-2">
      {righe.map((riga) => (
        <div key={riga.etichetta} className="flex items-baseline gap-2">
          <dt className="w-[42%] flex-none text-[10px] uppercase tracking-[0.08em] text-slate-500">{riga.etichetta}</dt>
          <dd className="min-w-0 flex-1 text-[11px] font-semibold text-slate-900">
            {riga.valore ?? <LineaVuota />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LineaVuota() {
  return <span className="block border-b border-dotted border-slate-400 pt-3" aria-label="da compilare" />;
}

function Firma({ etichetta }: { etichetta: string }) {
  return (
    <div>
      <span className="block border-b border-slate-500 pb-10" />
      <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-slate-500">{etichetta}</p>
    </div>
  );
}

function pulisci(value: unknown) {
  const testo = String(value ?? "").trim();
  return testo.length > 0 ? testo : null;
}

function formattaDataItaliana(value: string) {
  const parti = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return parti ? `${parti[3]}/${parti[2]}/${parti[1]}` : null;
}

function normalizzaKm(value: string) {
  const cifre = value.replace(/\D/g, "");
  if (!cifre) return null;
  return `${new Intl.NumberFormat("it-IT").format(Number(cifre))} km`;
}
