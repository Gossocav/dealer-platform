"use client";

import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import {
  clienteDaCompratore,
  compratoreDaCliente,
  compratoreHaUnNome,
  dettaglioCompratore,
  nomeCliente,
  nomeCompratore,
  venditaSenzaCompratore,
  type ClienteInRubrica,
  type Compratore,
} from "@/lib/compratore";
import { supabase } from "@/lib/supabaseClient";

type Vendita = Compratore & {
  id: string;
  customer_id: string | null;
  sold_on: string | null;
  notes: string | null;
};

const COLONNE_VENDITA =
  "id, customer_id, sold_on, notes, buyer_first_name, buyer_last_name, buyer_company, buyer_vat_number, buyer_tax_code, buyer_email, buyer_phone, buyer_address, buyer_zip_code, buyer_city, buyer_province";

const COLONNE_CLIENTE = "id, first_name, last_name, company, vat_number, tax_code, email, phone, mobile, address, zip_code, city, province";

const VUOTO: Compratore = {};

/**
 * Chi ha comprato la vettura.
 *
 * Compare **solo quando la vettura risulta venduta**: prima non c'e' nessun
 * compratore da indicare, e un riquadro vuoto su ogni scheda sarebbe rumore.
 *
 * Se e' venduta e non si sa a chi, lo dice invece di tacere: e' il motivo per
 * cui la domanda si puo' rimandare senza che venga dimenticata. Fino al
 * 03/09/2026 non la faceva nessuno, e in produzione **zero** vetture su 275
 * avevano un cliente collegato.
 */
export function RiquadroCompratore({
  vehicleId,
  dealerId,
  status,
}: {
  vehicleId: string;
  dealerId: string | null;
  status: string | null;
}) {
  const [vendita, setVendita] = useState<Vendita | null>(null);
  const [clienti, setClienti] = useState<ClienteInRubrica[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [ricarica, setRicarica] = useState(0);

  const [clienteScelto, setClienteScelto] = useState("");
  const [modulo, setModulo] = useState<Compratore>(VUOTO);
  const [dataVendita, setDataVendita] = useState("");
  const [note, setNote] = useState("");

  const venduta = String(status ?? "").trim().toLowerCase() === "sold";

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      if (!dealerId || !venduta) {
        if (vivo) setCaricamento(false);
        return;
      }

      const [letta, rubrica] = await Promise.all([
        supabase
          .from("vehicle_sales")
          .select(COLONNE_VENDITA)
          .eq("vehicle_id", vehicleId)
          .eq("dealer_id", dealerId)
          .maybeSingle<Vendita>(),
        supabase
          .from("customers")
          .select(COLONNE_CLIENTE)
          .eq("dealer_id", dealerId)
          .order("last_name", { ascending: true, nullsFirst: false })
          .returns<ClienteInRubrica[]>(),
      ]);

      if (!vivo) return;

      if (letta.error) {
        setErrore("Non e stato possibile leggere la vendita.");
        setCaricamento(false);
        return;
      }

      setVendita(letta.data ?? null);
      setClienti(rubrica.data ?? []);

      if (letta.data) {
        setModulo(letta.data);
        setClienteScelto(letta.data.customer_id ?? "");
        setDataVendita(letta.data.sold_on ?? "");
        setNote(letta.data.notes ?? "");
      }

      setCaricamento(false);
    };

    void carica();

    return () => {
      vivo = false;
    };
  }, [vehicleId, dealerId, venduta, ricarica]);

  if (!venduta || caricamento) return null;

  const scegliCliente = (id: string) => {
    setClienteScelto(id);

    const cliente = clienti.find((voce) => voce.id === id);
    if (cliente) setModulo(compratoreDaCliente(cliente));
  };

  const salva = async () => {
    if (!dealerId) return;

    if (!compratoreHaUnNome(modulo)) {
      setErrore("Scrivi almeno il cognome, oppure la ragione sociale: senza un nome la vendita direbbe soltanto “venduta a qualcuno”.");
      return;
    }

    setSalvataggio(true);
    setErrore(null);

    let customerId: string | null = clienteScelto || null;

    // Chi compra un'auto e' un cliente: se e' nuovo finisce anche in rubrica,
    // cosi' la prossima volta lo si trova gia' li'. Se pero' esiste gia' un
    // cliente con la stessa email, si aggancia quello invece di creare un
    // doppione che poi qualcuno dovra' unire a mano.
    if (!customerId) {
      const email = String(modulo.buyer_email ?? "").trim();

      if (email) {
        const esistente = await supabase
          .from("customers")
          .select("id")
          .eq("dealer_id", dealerId)
          .ilike("email", email)
          .limit(1)
          .maybeSingle<{ id: string }>();

        customerId = esistente.data?.id ?? null;
      }

      if (!customerId) {
        const creato = await supabase
          .from("customers")
          .insert({ dealer_id: dealerId, ...clienteDaCompratore(modulo) })
          .select("id")
          .maybeSingle<{ id: string }>();

        // Se la rubrica non accetta la riga la vendita si registra lo stesso:
        // il compratore e' scritto qui, ed e' quello che conta.
        customerId = creato.data?.id ?? null;
      }
    }

    const riga = {
      dealer_id: dealerId,
      vehicle_id: vehicleId,
      customer_id: customerId,
      sold_on: dataVendita || new Date().toISOString().slice(0, 10),
      notes: note.trim() || null,
      ...modulo,
    };

    const scritto = vendita
      ? await supabase.from("vehicle_sales").update(riga).eq("id", vendita.id).eq("dealer_id", dealerId)
      : await supabase.from("vehicle_sales").insert(riga);

    setSalvataggio(false);

    if (scritto.error) {
      setErrore("Non e stato possibile registrare il compratore. Riprova.");
      return;
    }

    setAperto(false);
    setRicarica((n) => n + 1);
  };

  const nome = nomeCompratore(vendita);
  const daIndicare = venditaSenzaCompratore(status, Boolean(vendita));

  return (
    <section
      className={`rounded-2xl border p-5 ${daIndicare ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Venduta a</p>

          {nome ? (
            <>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{nome}</h3>
              <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                {dettaglioCompratore(vendita).map((riga) => (
                  <p key={riga}>{riga}</p>
                ))}
                {vendita?.sold_on ? <p className="text-slate-500">Venduta il {vendita.sold_on}</p> : null}
                {vendita?.notes ? <p className="text-slate-500">{vendita.notes}</p> : null}
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-1 text-lg font-semibold text-amber-900">Compratore da indicare</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-amber-900">
                Questa vettura risulta venduta, ma non c&apos;e&apos; scritto a chi. Indicarlo adesso costa un minuto;
                fra un anno, quando servira&apos; per una garanzia o un richiamo, non ci sara&apos; piu&apos; modo di
                ricostruirlo.
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setAperto((precedente) => !precedente)}
          className={`inline-flex flex-none items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            daIndicare
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <UserRound className="h-4 w-4" />
          {aperto ? "Chiudi" : nome ? "Modifica" : "Indica il compratore"}
        </button>
      </div>

      {errore ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

      {aperto ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          {clienti.length > 0 ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Scegli dalla rubrica
              </span>
              <select
                value={clienteScelto}
                onChange={(evento) => scegliCliente(evento.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Compratore nuovo</option>
                {clienti.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {nomeCliente(cliente)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Se e&apos; nuovo, scrivilo qui sotto: finisce anche in rubrica, cosi&apos; la prossima volta lo trovi
                gia&apos; pronto.
              </span>
            </label>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etichetta="Nome" valore={modulo.buyer_first_name} onChange={(v) => setModulo((m) => ({ ...m, buyer_first_name: v }))} />
            <Campo etichetta="Cognome" valore={modulo.buyer_last_name} onChange={(v) => setModulo((m) => ({ ...m, buyer_last_name: v }))} />
            <Campo etichetta="Ragione sociale" valore={modulo.buyer_company} onChange={(v) => setModulo((m) => ({ ...m, buyer_company: v }))} />
            <Campo etichetta="Email" tipo="email" valore={modulo.buyer_email} onChange={(v) => setModulo((m) => ({ ...m, buyer_email: v }))} />
            <Campo etichetta="Telefono" valore={modulo.buyer_phone} onChange={(v) => setModulo((m) => ({ ...m, buyer_phone: v }))} />
            <Campo etichetta="Indirizzo" valore={modulo.buyer_address} onChange={(v) => setModulo((m) => ({ ...m, buyer_address: v }))} />
            <Campo etichetta="CAP" valore={modulo.buyer_zip_code} onChange={(v) => setModulo((m) => ({ ...m, buyer_zip_code: v }))} />
            <Campo etichetta="Citta" valore={modulo.buyer_city} onChange={(v) => setModulo((m) => ({ ...m, buyer_city: v }))} />
            <Campo etichetta="Provincia" valore={modulo.buyer_province} onChange={(v) => setModulo((m) => ({ ...m, buyer_province: v }))} />
            <Campo etichetta="Partita IVA" valore={modulo.buyer_vat_number} onChange={(v) => setModulo((m) => ({ ...m, buyer_vat_number: v }))} />
            <Campo etichetta="Codice fiscale" valore={modulo.buyer_tax_code} onChange={(v) => setModulo((m) => ({ ...m, buyer_tax_code: v }))} />
            <Campo etichetta="Venduta il" tipo="date" valore={dataVendita} onChange={setDataVendita} />
          </div>

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Note</span>
            <input
              type="text"
              value={note}
              onChange={(evento) => setNote(evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          <button
            type="button"
            onClick={() => void salva()}
            disabled={salvataggio}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salva il compratore
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Campo({
  etichetta,
  valore,
  onChange,
  tipo = "text",
}: {
  etichetta: string;
  valore: string | null | undefined;
  onChange: (valore: string) => void;
  tipo?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{etichetta}</span>
      <input
        type={tipo}
        value={valore ?? ""}
        onChange={(evento) => onChange(evento.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
      />
    </label>
  );
}
