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
  "registration_month",
  "year",
  "mileage",
  "fuel",
  "transmission",
  "color",
  "warranty",
  "equipment",
].join(", ");

const COLONNE_CLIENTE = "id, first_name, last_name, company, fiscal_code, vat_number, address, zip_code, city, province, phone, mobile, email";

/**
 * Le righe del foglio che valgono anche come dato del veicolo, e la colonna di
 * ciascuna.
 *
 * Sono tre e non di piu' per una ragione misurata: il 28/08/2026 nessuno dei
 * 235 veicoli in produzione aveva targa, telaio o garanzia -- arrivano tutti
 * dall'importazione dai siti delle concessionarie, che quei tre campi non li
 * espone. Erano quindi tre righe vuote su **ogni** scheda stampata, proprio le
 * due che identificano l'automobile e quella che dice cosa copre la garanzia.
 *
 * Le altre righe restano modificabili solo per la stampa: i chilometri sono
 * formattati ("78.500 km") e rimetterli in una colonna numerica vorrebbe dire
 * indovinare, e marca e modello riscritti a mano sul foglio sarebbero una
 * correzione di battitura, non un dato da propagare all'annuncio pubblico.
 */
const SALVABILI = [
  { etichetta: "Targa", colonna: "plate" },
  { etichetta: "Numero di telaio", colonna: "vin" },
  { etichetta: "Garanzia", colonna: "warranty" },
] as const;

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
  const [dealerId, setDealerId] = useState<string | null>(null);
  // Quello che il concessionario riscrive sul foglio, per etichetta. Vive solo
  // finche' la pagina e' aperta: la scheda resta un documento da stampare, non
  // un registro. Le tre righe che si possono anche salvare sul veicolo hanno
  // un bottone apposta.
  const [modifiche, setModifiche] = useState<Record<string, string>>({});
  const [salvataggio, setSalvataggio] = useState<"fermo" | "invio" | "fatto" | "errore">("fermo");
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

      if (alive) setDealerId(dealerId);

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

  // Il testo di una riga: quello riscritto se c'e', altrimenti quello che
  // arriva dalla scheda del veicolo.
  const testoDi = (etichetta: string, originale: string | null) => modifiche[etichetta] ?? originale ?? "";

  const scrivi = (etichetta: string, testo: string) => {
    setModifiche((precedenti) => ({ ...precedenti, [etichetta]: testo }));
    // Un salvataggio gia' andato a buon fine non deve continuare a dire
    // "salvato" mentre si riscrive la riga: direbbe una cosa non piu' vera.
    setSalvataggio("fermo");
  };

  // Il pannello qui sopra e la riga sul foglio dicono la stessa cosa: se si
  // ritocca il pannello, la riscrittura fatta a mano su quella riga smette di
  // valere, altrimenti resterebbe a coprire il valore nuovo senza spiegare
  // perche'.
  const dimentica = (etichetta: string) => {
    setModifiche((precedenti) => {
      if (!(etichetta in precedenti)) return precedenti;
      const successivi = { ...precedenti };
      delete successivi[etichetta];
      return successivi;
    });
  };

  // Le tre righe che si possono riportare sul veicolo, e la colonna di
  // ciascuna. Sono le tre che in produzione nessuna auto ha: arrivano tutte
  // dall'importazione dai siti, che targa, telaio e garanzia non li espone.
  const daSalvare = SALVABILI.filter(({ etichetta }) => {
    const scritto = modifiche[etichetta];
    return typeof scritto === "string" && scritto.trim().length > 0;
  });

  const salvaSulVeicolo = async () => {
    if (!dealerId || daSalvare.length === 0) return;

    setSalvataggio("invio");

    const aggiornamento: Record<string, string> = {};
    for (const { etichetta, colonna } of daSalvare) {
      aggiornamento[colonna] = modifiche[etichetta].trim();
    }

    // Vincolata alla concessionaria oltre che all'identificativo, come la
    // lettura qui sopra: non si scrive sull'auto di un altro.
    const { error: erroreSalvataggio } = await supabase
      .from("vehicles")
      .update(aggiornamento)
      .eq("id", vehicleId)
      .eq("dealer_id", dealerId);

    if (erroreSalvataggio) {
      setSalvataggio("errore");
      return;
    }

    setVehicle((precedente) => (precedente ? { ...precedente, ...aggiornamento } : precedente));

    // Le righe salvate smettono di essere "riscritture": adesso il valore
    // arriva dal veicolo, e il testo sul foglio non cambia di una virgola.
    // Serve a far sparire la proposta di salvare una cosa gia' salvata.
    setModifiche((precedenti) => {
      const successivi = { ...precedenti };
      for (const { etichetta } of daSalvare) delete successivi[etichetta];
      return successivi;
    });
    setSalvataggio("fatto");
  };

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
              onChange={(evento) => {
                setDataConsegna(evento.target.value);
                dimentica("Data di consegna");
              }}
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
              onChange={(evento) => {
                setKmConsegna(evento.target.value);
                dimentica("Chilometri alla consegna");
              }}
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
            Il foglio qui sotto si scrive direttamente: clicca su una riga per completarla o correggerla. Quello che
            scrivi vale per questa stampa e non viene salvato, perche la scheda e un documento da stampare, non un
            registro delle consegne.
          </p>

          {/* Targa, telaio e garanzia sono l'eccezione, ed e' un'eccezione
              misurata: nessun veicolo in produzione le ha, perche' arrivano
              dall'importazione dai siti che non le espone. Chi le scrive qui
              le sta scrivendo per la prima volta, non le sta correggendo --
              e riscriverle a ogni consegna sarebbe la stessa fatica di
              scriverle a penna. Il bottone lascia la scelta a lui: niente si
              salva da solo. */}
          {daSalvare.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-100 p-3 sm:col-span-2">
              <p className="min-w-0 flex-1 text-xs leading-5 text-slate-600">
                Hai compilato <strong className="font-semibold text-slate-800">{daSalvare.map(({ etichetta }) => etichetta.toLowerCase()).join(", ")}</strong>:
                vuoi tenerli anche sulla scheda del veicolo, cosi da non riscriverli la prossima volta?
              </p>
              <button
                type="button"
                onClick={() => void salvaSulVeicolo()}
                disabled={salvataggio === "invio"}
                className="inline-flex flex-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {salvataggio === "invio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Salva anche sul veicolo
              </button>
            </div>
          ) : null}

          {salvataggio === "fatto" ? (
            <p className="text-xs font-semibold text-emerald-700 sm:col-span-2">Salvato sulla scheda del veicolo.</p>
          ) : null}
          {salvataggio === "errore" ? (
            <p className="text-xs font-semibold text-red-700 sm:col-span-2">
              Non e stato possibile salvare sul veicolo. Il foglio resta compilato: puoi stamparlo lo stesso.
            </p>
          ) : null}
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
          <Righe righe={righeVeicolo(vehicle ?? {})} testoDi={testoDi} scrivi={scrivi} />
        </Blocco>

        <Blocco titolo="Chi ritira il veicolo">
          <Righe righe={righeCliente(cliente)} testoDi={testoDi} scrivi={scrivi} />
        </Blocco>

        <Blocco titolo="Consegna">
          <Righe
            righe={[
              { etichetta: "Data di consegna", valore: formattaDataItaliana(dataConsegna) },
              { etichetta: "Chilometri alla consegna", valore: normalizzaKm(kmConsegna) },
              { etichetta: "Garanzia", valore: pulisci(vehicle?.warranty) },
            ]}
            testoDi={testoDi}
            scrivi={scrivi}
          />
        </Blocco>

        {/* Le dotazioni restano una riga sola di testo, come vengono stampate:
            un elenco a campi separati sarebbe piu' ordinato a schermo ma
            costringerebbe a decidere dove finisce una voce e comincia
            l'altra, cosa che sul foglio non serve a nessuno. */}
        <Blocco titolo="Dotazioni">
          <CampoModificabile
            etichetta="Dotazioni"
            testo={testoDi("Dotazioni", dotazioni.length > 0 ? dotazioni.join(" • ") : null)}
            scrivi={scrivi}
            classe="text-[11px] leading-5 text-slate-700"
          />
        </Blocco>

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
 *
 * Da qui si scrive anche a schermo, prima di stampare: la riga vuota si puo'
 * riempire e quella piena si puo' correggere. Restava altrimenti l'unico modo
 * di completare una scheda, la penna -- e su targa e telaio capitava sempre.
 */
function Righe({
  righe,
  testoDi,
  scrivi,
}: {
  righe: RigaConsegna[];
  testoDi: (etichetta: string, originale: string | null) => string;
  scrivi: (etichetta: string, testo: string) => void;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-2">
      {righe.map((riga) => (
        <div key={riga.etichetta} className="flex items-baseline gap-2">
          <dt className="w-[42%] flex-none text-[10px] uppercase tracking-[0.08em] text-slate-500">{riga.etichetta}</dt>
          <dd className="min-w-0 flex-1">
            <CampoModificabile
              etichetta={riga.etichetta}
              testo={testoDi(riga.etichetta, riga.valore)}
              scrivi={scrivi}
              classe="text-[11px] font-semibold text-slate-900"
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Lo spazio per la penna dove non c'e' un campo: le due righe delle note. */
function LineaVuota() {
  return <span className="block border-b border-dotted border-slate-400 pt-3" aria-label="da compilare" />;
}

/**
 * Il valore di una riga del foglio, scrivibile.
 *
 * E' un campo di testo travestito da testo stampato: nessun bordo e nessuno
 * sfondo, cosi' il foglio resta un foglio. Vuoto porta la riga punteggiata di
 * prima -- che in stampa serve, e' lo spazio per la penna quando il dato non
 * c'e' -- e pieno non lascia nessun segno sulla carta. A schermo, e solo a
 * schermo, un accenno al passaggio del mouse dice che si puo' scrivere.
 */
function CampoModificabile({
  etichetta,
  testo,
  scrivi,
  classe,
}: {
  etichetta: string;
  testo: string;
  scrivi: (etichetta: string, testo: string) => void;
  classe: string;
}) {
  const vuoto = testo.trim().length === 0;

  return (
    <input
      value={testo}
      onChange={(evento) => scrivi(etichetta, evento.target.value)}
      aria-label={etichetta}
      className={`w-full min-w-0 border-b bg-transparent py-[2px] outline-none ${classe} ${
        vuoto
          ? "border-dotted border-slate-400"
          : "border-transparent hover:border-slate-300 focus:border-slate-900 print:border-transparent"
      }`}
    />
  );
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
