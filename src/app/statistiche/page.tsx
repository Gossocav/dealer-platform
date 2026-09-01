"use client";

import Link from "next/link";
import { Children, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Car, Inbox, Loader2, PencilLine, Rocket, Tag, TrendingUp, Users, Wallet } from "lucide-react";
import { FunzioneNonCompresa } from "@/components/dashboard/funzione-non-compresa";
import { MarginSummary } from "@/components/dashboard/margin-summary";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { resolveDealerIdForCurrentUser } from "@/lib/active-tenant";
import { caricaTutto } from "@/lib/carica-tutto";
import { formattaEuroTondo, formattaNumero, quotaPercentuale } from "@/lib/cifre";
import { pianoComprende } from "@/lib/funzioni-per-piano";
import { usePianoInVigore } from "@/lib/use-piano-in-vigore";
import { resolveVehicleLabel } from "@/lib/public-marketplace";
import { supabase } from "@/lib/supabaseClient";
import { formatRegistrationLabel } from "@/lib/vehicles";

type Vehicle = {
  id: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  registration_date?: string | null;
  registration_month?: string | null;
  year?: string | null;
  price?: string | null;
  status?: string | null;
  published?: boolean | null;
  created_at?: string | null;
};

type Lead = {
  id: string;
  vehicle_id?: string | null;
  // Il veicolo richiesto, agganciato al lead: sulla scheda si scriveva
  // l'identificativo interno, una stringa di trentasei caratteri che non
  // dice niente a nessuno.
  vehicles?: DatiVeicoloLead | DatiVeicoloLead[] | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type DatiVeicoloLead = { brand: string | null; model: string | null; version: string | null };

function veicoloDelLead(valore: Lead["vehicles"]): DatiVeicoloLead | null {
  return (Array.isArray(valore) ? valore[0] : valore) ?? null;
}

type Customer = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

type Appointment = {
  id: string;
  title?: string | null;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  status?: string | null;
  created_at?: string | null;
};

const formatDate = (timestamp: string | null | undefined) => {
  if (!timestamp) return "-";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
};

const parsePrice = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const digits = value.replace(/[€\s.,]/g, "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
};

export default function StatistichePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dealerIdCorrente, setDealerIdCorrente] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);

  // I totali si contano nel database, non contando le righe scaricate.
  //
  // Prima la pagina scaricava *tutte* le righe di quattro tabelle e ne
  // misurava la lunghezza. Ma il database ne restituisce al massimo mille per
  // richiesta: superata quella soglia i numeri smettevano di crescere, senza
  // nessun errore e senza nessun avviso. Una concessionaria con 1.400 lead ne
  // avrebbe letti 1.000 per sempre.
  //
  // I veicoli restano scaricati per intero, e va bene: il piano piu' alto ne
  // consente 300, quindi il tetto non li tocca -- e servono comunque interi
  // per il prezzo medio.
  const [totals, setTotals] = useState({ leads: 0, customers: 0, appointments: 0 });
  const { planCode, caricamento: caricamentoPiano } = usePianoInVigore();

  useEffect(() => {
    let attivo = true;

    const fetchAll = async () => {
      setLoading(true);
      setStatusMessage(null);

      const adesso = new Date().toISOString();

      // Ogni interrogazione dice di quale concessionaria sono i dati che
      // chiede. La protezione del database lo garantisce comunque, ma una
      // pagina che chiede "i lead" invece dei "miei lead" e' scritta male: se
      // un domani quella protezione venisse allentata, sarebbe questa riga a
      // fare la differenza.
      const dealerId = await resolveDealerIdForCurrentUser(supabase);
      setDealerIdCorrente(dealerId ?? null);

      if (!attivo) return;

      if (!dealerId) {
        setLoading(false);
        setStatusMessage("Concessionaria non associata all'utente.");
        return;
      }

      const [vehiclesRes, leadsCount, customersCount, appointmentsCount, latestLeadsRes, latestCustomersRes, upcomingRes] =
        await Promise.all([
          // Letto per intero, non per i primi mille: da questo elenco escono
          // i conteggi per stato e il valore dello stock, e un elenco troncato
          // li darebbe per difetto **senza dirlo**. Oggi il tetto del piano
          // piu' capiente e' 300 annunci, quindi non ci si arriva -- ma e' lo
          // stesso difetto che ha gia' morso due volte altrove, e costa una
          // riga evitarlo. `caricaTutto` avvisa nei log quando tocca il tetto.
          caricaTutto<Vehicle>((da, a) =>
            supabase
              .from("vehicles")
              .select("id, brand, model, version, registration_date, registration_month, year, price, status, published, created_at")
              .eq("dealer_id", dealerId)
              .order("created_at", { ascending: false })
              .range(da, a)
          ),
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          // Gli ultimi cinque li sceglie il database: ordinare a mano un
          // elenco gia' troncato dava "gli ultimi cinque fra i primi mille",
          // che non sono gli ultimi cinque.
          supabase
            .from("leads")
            .select("id, vehicle_id, first_name, last_name, email, phone, message, status, created_at, vehicles(brand, model, version)")
            .eq("dealer_id", dealerId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("customers")
            .select("id, first_name, last_name, company, email, phone, created_at")
            .eq("dealer_id", dealerId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("appointments")
            .select("id, title, description, start_at, end_at, status, created_at")
            .eq("dealer_id", dealerId)
            .gte("start_at", adesso)
            .order("start_at", { ascending: true })
            .limit(5),
        ]);

      if (!attivo) return;

      setLoading(false);

      const primoErrore =
        vehiclesRes.error ??
        leadsCount.error ??
        customersCount.error ??
        appointmentsCount.error ??
        latestLeadsRes.error ??
        latestCustomersRes.error ??
        upcomingRes.error;

      if (primoErrore) {
        setStatusMessage(primoErrore.message || "Errore nel recupero dei dati.");
        setStatusMessageType("error");
        return;
      }

      setVehicles(vehiclesRes.righe as Vehicle[]);
      setLeads((latestLeadsRes.data ?? []) as Lead[]);
      setCustomers((latestCustomersRes.data ?? []) as Customer[]);
      setAppointments((upcomingRes.data ?? []) as Appointment[]);
      setTotals({
        leads: leadsCount.count ?? 0,
        customers: customersCount.count ?? 0,
        appointments: appointmentsCount.count ?? 0,
      });
    };

    void fetchAll();

    return () => {
      attivo = false;
    };
  }, []);

  const totalVehicles = vehicles.length;
  const publishedVehicles = vehicles.filter((vehicle) => vehicle.published).length;
  const draftVehicles = vehicles.filter((vehicle) => !vehicle.published).length;
  const totalLeads = totals.leads;
  const totalCustomers = totals.customers;
  const totalAppointments = totals.appointments;
  const totalValue = vehicles.reduce((sum, vehicle) => sum + parsePrice(vehicle.price), 0);
  const averagePrice = totalVehicles > 0 ? Math.round(totalValue / totalVehicles) : 0;

  // I veicoli arrivano gia' ordinati dal database. Qui prima c'era .sort(),
  // che riordina l'elenco *sul posto*: modificava lo stato di React invece di
  // ricavarne una copia.
  const latestVehicles = useMemo(() => vehicles.slice(0, 5), [vehicles]);

  // Lead e clienti arrivano gia' come "ultimi cinque", scelti dal database.
  const latestLeads = leads;

  const latestCustomers = customers;

  // Gia' filtrati e ordinati dal database: solo quelli non ancora passati, dal
  // piu' vicino. Prima si scaricava tutta l'agenda per tenerne cinque.
  const upcomingAppointments = appointments;

  const quotaPubblicati = quotaPercentuale(publishedVehicles, totalVehicles);
  const quotaBozze = quotaPercentuale(draftVehicles, totalVehicles);

  return (
    <DealerDashboardShell title="Statistiche">
      {/* Niente sfondo, margini o riquadro attorno a tutta la pagina: li mette
          gia' il guscio del gestionale. Prima ce n'erano due sovrapposti, ed
          era il motivo per cui questa pagina sembrava fatta da un'altra mano
          rispetto a Vendite e Giacenza. */}
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Statistiche</p>
            {/* Il titolo si diceva tre volte: nella barra in alto, come
                soprattitolo e come titolo. Qui resta la frase che dice cosa
                si sta guardando. */}
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Come sta andando la concessionaria</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Il parco auto, le persone che ti hanno contattato e il conto del mese, in una pagina sola.
            </p>
          </div>

          <Link
            href="/agenda"
            className="inline-flex flex-none items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <CalendarDays className="h-4 w-4" /> Nuovo appuntamento
          </Link>
        </div>
      </section>

      {statusMessage ? (
        <section
          className={`rounded-2xl border px-4 py-3 text-sm ${statusMessageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {statusMessage}
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Sto raccogliendo i numeri...
        </section>
      ) : null}

      {/* ============ IL PARCO AUTO ============ */}
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Il parco auto</h3>
          <Link href="/veicoli" className="text-sm font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline">
            Vai ai veicoli
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Veicoli in archivio" value={formattaNumero(totalVehicles)} icon={Car} accent="blu" />
          <MetricCard
            label="Pubblicati"
            value={formattaNumero(publishedVehicles)}
            delta={quotaPubblicati === null ? undefined : `${quotaPubblicati.toFixed(0)}% del parco`}
            tone="positive"
            icon={Rocket}
            accent="verde"
          />
          <MetricCard
            label="Bozze"
            value={formattaNumero(draftVehicles)}
            delta={quotaBozze === null ? undefined : `${quotaBozze.toFixed(0)}% del parco`}
            icon={PencilLine}
            accent="ambra"
          />
          <MetricCard
            label="Valore del parco"
            value={formattaEuroTondo(totalValue)}
            delta="somma dei prezzi in vetrina"
            icon={Wallet}
            accent="viola"
          />
          <MetricCard
            label="Prezzo medio"
            value={formattaEuroTondo(averagePrice)}
            delta="per vettura"
            icon={Tag}
            accent="viola"
          />
          <MetricCard label="Appuntamenti" value={formattaNumero(totalAppointments)} icon={CalendarDays} accent="rosa" />
        </div>

        {/* Una barra sola divisa in due, e non due barre accanto: pubblicati e
            bozze sono parti dello stesso parco. Prima questa pagina metteva
            sulla stessa scala veicoli, lead e clienti -- tre cose che non si
            sommano fra loro e il cui confronto non voleva dire niente. */}
        {totalVehicles > 0 ? (
          <div className="mt-6">
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
              <span className="h-full bg-emerald-500" style={{ width: `${quotaPubblicati ?? 0}%` }} />
              <span className="h-full bg-amber-400" style={{ width: `${quotaBozze ?? 0}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                In vetrina <strong className="font-semibold tabular-nums text-slate-900">{publishedVehicles}</strong>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                Da pubblicare <strong className="font-semibold tabular-nums text-slate-900">{draftVehicles}</strong>
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* ============ LE PERSONE ============ */}
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Chi ti ha contattato</h3>
          <Link href="/lead" className="text-sm font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline">
            Vai ai lead
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Richieste ricevute" value={formattaNumero(totalLeads)} icon={Inbox} accent="blu" />
          <MetricCard label="Clienti in rubrica" value={formattaNumero(totalCustomers)} icon={Users} accent="verde" />
          <MetricCard
            label="Richieste per vettura"
            value={totalVehicles > 0 ? (totalLeads / totalVehicles).toFixed(1) : "—"}
            delta="media sul parco"
            icon={TrendingUp}
            accent="grigio"
          />
        </div>
      </section>

      {/* I conteggi di attivita' -- quante auto, quante richieste -- sono di
          tutti i piani. I margini no: sono conto economico, e si aprono dal
          Pro. Chi non ce l'ha legge cosa si sta perdendo invece di trovare
          un buco nella pagina. */}
      {caricamentoPiano ? null : pianoComprende(planCode, "conto-economico") ? (
        <MarginSummary dealerId={dealerIdCorrente} />
      ) : (
        <FunzioneNonCompresa funzione="conto-economico" titolo="Il conto del mese" />
      )}

      {/* ============ GLI ULTIMI ARRIVATI ============ */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Elenco titolo="Ultimi veicoli inseriti" vuoto="Nessun veicolo, per ora." dove="/veicoli">
          {latestVehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/veicoli/${vehicle.id}`}
              className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
            >
              <p className="font-semibold text-slate-900">
                {[vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") || "Veicolo senza nome"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Immatricolazione{" "}
                {formatRegistrationLabel({
                  registration_date: vehicle.registration_date,
                  registration_month: vehicle.registration_month,
                  year: vehicle.year,
                }) ?? "—"}
                {" · "}
                {formattaEuroTondo(parsePrice(vehicle.price) || null)}
              </p>
            </Link>
          ))}
        </Elenco>

        <Elenco titolo="Ultime richieste" vuoto="Nessuna richiesta, per ora." dove="/lead">
          {latestLeads.map((lead) => {
            const veicolo = veicoloDelLead(lead.vehicles);
            return (
              <Link
                key={lead.id}
                href={`/lead/${lead.id}`}
                className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
              >
                <p className="font-semibold text-slate-900">
                  {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Senza nome"}
                </p>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {[lead.email, lead.phone].filter(Boolean).join(" · ") || "Nessun recapito"}
                </p>
                {/* Prima qui compariva l'identificativo interno del veicolo.
                    Se il lead non e' legato a nessuna vettura non si scrive
                    una riga vuota: si omette. */}
                {veicolo ? (
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Chiede: {resolveVehicleLabel(veicolo as never)}
                  </p>
                ) : null}
              </Link>
            );
          })}
        </Elenco>

        <Elenco titolo="Ultimi clienti" vuoto="Nessun cliente, per ora." dove="/clienti">
          {latestCustomers.map((customer) => (
            <div key={customer.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">
                {customer.company?.trim() || `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || "Senza nome"}
              </p>
              <p className="mt-1 truncate text-sm text-slate-600">
                {[customer.email, customer.phone].filter(Boolean).join(" · ") || "Nessun recapito"}
              </p>
            </div>
          ))}
        </Elenco>

        <Elenco titolo="Prossimi appuntamenti" vuoto="Niente in calendario." dove="/agenda">
          {upcomingAppointments.map((appointment) => (
            <div key={appointment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{appointment.title ?? "Senza titolo"}</p>
              <p className="mt-1 text-sm text-slate-600">{formatDate(appointment.start_at)}</p>
              {appointment.description ? (
                <p className="mt-1 truncate text-xs text-slate-500">{appointment.description}</p>
              ) : null}
            </div>
          ))}
        </Elenco>
      </div>
    </DealerDashboardShell>
  );
}

/**
 * Un elenco breve con il suo titolo e il collegamento alla sezione intera.
 *
 * Le quattro liste in fondo erano quattro blocchi copiati, ognuno con la sua
 * frase per il caso vuoto scritta in modo diverso ("Nessun veicolo
 * disponibile", "Nessun appuntamento in calendario").
 */
function Elenco({
  titolo,
  vuoto,
  dove,
  children,
}: {
  titolo: string;
  vuoto: string;
  dove: string;
  children: ReactNode;
}) {
  const righe = Children.toArray(children);

  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{titolo}</h3>
        <Link href={dove} className="text-sm font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline">
          Vedi tutto
        </Link>
      </div>

      {righe.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{vuoto}</p>
      ) : (
        <div className="mt-4 space-y-3">{righe}</div>
      )}
    </section>
  );
}
