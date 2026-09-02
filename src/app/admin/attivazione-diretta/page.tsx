"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { DEMO_PLAN_CATALOG, formattaPrezzoPiano, type DemoPlanCode } from "@/lib/demo-plan-catalog";
import { supabase } from "@/lib/supabaseClient";

/**
 * Attivare una concessionaria direttamente su un piano a pagamento.
 *
 * Serve il giorno che un concessionario dice "ho visto, attivami il Pro":
 * prima l'unica strada era fargli aprire una richiesta di prova per poi
 * convertirla un minuto dopo, cioe' recitare una finzione e poi spegnere
 * sette giorni di scadenza.
 *
 * **I tre passi sono quelli che esistono gia'**, chiamati in fila: si crea la
 * richiesta (segnata come diretta), si attiva, si converte al piano. Non e'
 * stata riscritta nessuna delle due azioni finali: sono in produzione da mesi
 * e sanno gia' rimettere le cose a posto quando qualcosa va storto.
 *
 * L'accesso e' quello di tutte le altre schermate del pannello: si controlla
 * il ruolo qui, oltre che nell'endpoint. Senza questo controllo la pagina si
 * apriva a chiunque avesse una sessione -- i dati non uscivano, perche'
 * l'endpoint risponde 403 comunque, ma un concessionario che digitava
 * l'indirizzo si trovava davanti il modulo e il listino dei piani.
 *
 * Se il terzo passo fallisce, la concessionaria **esiste ed e' operativa**,
 * solo in prova invece che sul piano scelto: la pagina lo dice per esteso e
 * indica dove finire il lavoro, invece di lasciare un errore generico su un
 * account gia' creato a meta'.
 */

type Passo = "fermo" | "creo" | "attivo" | "converto" | "fatto";

type Accesso = "controllo" | "consentito" | "negato";

type Modulo = {
  dealershipName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  vehicleCount: string;
  planCode: DemoPlanCode;
  notes: string;
};

const VUOTO: Modulo = {
  dealershipName: "",
  contactName: "",
  email: "",
  phone: "",
  city: "",
  province: "",
  vehicleCount: "",
  planCode: "pro",
  notes: "",
};

const DESCRIZIONE_PASSO: Record<Exclude<Passo, "fermo" | "fatto">, string> = {
  creo: "Preparo la scheda della concessionaria...",
  attivo: "Creo l'account e mando l'email di accesso...",
  converto: "Attivo il piano scelto...",
};

export default function AttivazioneDirettaPage() {
  const [modulo, setModulo] = useState<Modulo>(VUOTO);
  const [passo, setPasso] = useState<Passo>("fermo");
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [esito, setEsito] = useState<{ nome: string; piano: string } | null>(null);
  // Un clic crea l'account **e manda l'email**, e un'email non si richiama
  // indietro: un indirizzo sbagliato manda le credenziali a un estraneo. La
  // conferma ripete a schermo le due cose che non si possono correggere dopo.
  const [conferma, setConferma] = useState(false);
  const [accesso, setAccesso] = useState<Accesso>("controllo");
  // Il pulsante si disabilita solo al disegno successivo, e fra il clic e la
  // lettura della sessione resta premibile: due clic rapidi facevano partire
  // due catene complete, cioe' due concessionarie con la stessa email e due
  // email di accesso gia' spedite. Questa serratura chiude nello stesso
  // istante del clic, prima di qualunque attesa.
  const inEsecuzione = useRef(false);

  useEffect(() => {
    let attivo = true;

    const controlla = async () => {
      const { data, error } = await supabase.auth.getUser();
      const utente = data?.user;

      if (!attivo) return;

      if (error || !utente) {
        setAccesso("negato");
        return;
      }

      let ammesso = isPlatformAdminRole(resolveUserRoleFromMetadata(utente));

      if (!ammesso) {
        const profilo = await supabase.from("profiles").select("role").eq("id", utente.id).maybeSingle<{ role: string | null }>();
        if (!profilo.error) ammesso = isPlatformAdminRole(profilo.data?.role);
      }

      if (!attivo) return;
      setAccesso(ammesso ? "consentito" : "negato");
    };

    void controlla();

    return () => {
      attivo = false;
    };
  }, []);

  const aggiorna = (campo: keyof Modulo, valore: string) => {
    setModulo((precedente) => ({ ...precedente, [campo]: valore }));
    setErrore(null);
    // Cambiare un dato annulla la conferma: quella che si stava per dare
    // riguardava un'email che adesso e' un'altra.
    setConferma(false);
  };

  const attiva = async () => {
    if (inEsecuzione.current) return;
    inEsecuzione.current = true;
    setPasso("creo");
    try {
      await eseguiAttivazione();
    } finally {
      inEsecuzione.current = false;
    }
  };

  const eseguiAttivazione = async () => {
    setErrore(null);
    setAvviso(null);
    setEsito(null);

    const { data, error: erroreSessione } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (erroreSessione || !token) {
      setErrore("Sessione scaduta. Rientra nel pannello e riprova.");
      return;
    }

    const intestazioni = { "content-type": "application/json", authorization: `Bearer ${token}` };

    // --- 1. la richiesta, segnata come diretta ---
    const creazione = await fetch("/api/admin/dealers/attivazione-diretta", {
      method: "POST",
      headers: intestazioni,
      body: JSON.stringify(modulo),
    }).catch(() => null);

    const creata = creazione ? await creazione.json().catch(() => ({})) : {};

    if (!creazione?.ok || !creata?.requestId) {
      setPasso("fermo");
      setConferma(false);
      setErrore(creata?.error ?? "Non e stato possibile preparare l'attivazione.");
      return;
    }

    const requestId: string = creata.requestId;

    // --- 2. l'attivazione vera: account, email di accesso, concessionaria ---
    setPasso("attivo");
    const attivazione = await fetch("/api/admin/demo-requests", {
      method: "POST",
      headers: intestazioni,
      body: JSON.stringify({ requestId, action: "activate_demo" }),
    }).catch(() => null);

    const attivata = attivazione ? await attivazione.json().catch(() => ({})) : {};

    if (!attivazione?.ok) {
      setPasso("fermo");
      setConferma(false);
      setErrore(
        `${attivata?.error ?? "L'attivazione non e riuscita."} La scheda e stata preparata: la trovi fra le Richieste demo e puoi riprovare da li'.`
      );
      return;
    }

    // --- 3. il piano a pagamento, al posto della prova ---
    setPasso("converto");
    const conversione = await fetch("/api/admin/demo-requests", {
      method: "POST",
      headers: intestazioni,
      body: JSON.stringify({ requestId, action: "convert_demo", planCode: modulo.planCode }),
    }).catch(() => null);

    const convertita = conversione ? await conversione.json().catch(() => ({})) : {};

    if (!conversione?.ok) {
      // L'account esiste e funziona: manca solo il piano. Dirlo per esteso
      // evita che il titolare creda di dover ricominciare da capo -- e che
      // ricreandola si ritrovi due concessionarie con la stessa email.
      setPasso("fermo");
      setConferma(false);
      setAvviso(
        `La concessionaria e stata creata e ha gia ricevuto l'email di accesso, ma e rimasta in prova: ${
          convertita?.error ?? "il passaggio al piano non e riuscito"
        }. Aprila in Richieste demo e usa "Converti" per metterla sul piano ${modulo.planCode}.`
      );
      return;
    }

    setPasso("fatto");
    setEsito({ nome: modulo.dealershipName, piano: modulo.planCode });
    setModulo(VUOTO);
    setConferma(false);
  };

  const inCorso = passo === "creo" || passo === "attivo" || passo === "converto";

  if (accesso === "controllo") {
    return (
      <AdminShell title="Attivazione diretta">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Controllo dell&apos;accesso in corso...
        </div>
      </AdminShell>
    );
  }

  if (accesso === "negato") {
    return (
      <AdminShell title="Accesso negato">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
          Questa sezione e riservata agli account amministrativi.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Attivazione diretta"
      description="Crea una concessionaria gia su un piano a pagamento, senza farle aprire una prova."
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Da usare quando un concessionario ha gia deciso e non vuole il periodo di prova. Riceve subito l&apos;email per
          entrare, e parte sul piano che scegli qui: nessuna scadenza da spegnere dopo.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Campo etichetta="Nome della concessionaria" valore={modulo.dealershipName} onChange={(v) => aggiorna("dealershipName", v)} />
          <Campo etichetta="Referente" valore={modulo.contactName} onChange={(v) => aggiorna("contactName", v)} />
          <Campo etichetta="Email" tipo="email" valore={modulo.email} onChange={(v) => aggiorna("email", v)} nota="Qui arriva il link per entrare" />
          <Campo etichetta="Telefono" valore={modulo.phone} onChange={(v) => aggiorna("phone", v)} />
          <Campo etichetta="Citta" valore={modulo.city} onChange={(v) => aggiorna("city", v)} />
          <Campo etichetta="Provincia" valore={modulo.province} onChange={(v) => aggiorna("province", v)} nota="Due lettere, serve alla ricerca per distanza" />
          <Campo etichetta="Quante auto ha (facoltativo)" valore={modulo.vehicleCount} onChange={(v) => aggiorna("vehicleCount", v)} />

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Piano</span>
            <select
              value={modulo.planCode}
              onChange={(evento) => aggiorna("planCode", evento.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {DEMO_PLAN_CATALOG.map((piano) => (
                <option key={piano.code} value={piano.code}>
                  {piano.name} — {formattaPrezzoPiano(piano)}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Note (facoltativo)</span>
            <textarea
              value={modulo.notes}
              onChange={(evento) => aggiorna("notes", evento.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        {errore ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errore}</p> : null}

        {avviso ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <p className="font-semibold">L&apos;account c&apos;e, il piano no.</p>
            <p className="mt-1">{avviso}</p>
            <Link href="/admin/demo-requests" className="mt-2 inline-block font-semibold underline">
              Vai alle Richieste demo
            </Link>
          </div>
        ) : null}

        {esito ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            <p className="font-semibold">{esito.nome} e attiva sul piano {esito.piano}.</p>
            <p className="mt-1">
              Ha ricevuto l&apos;email con il link per impostare la password. Se non la trova, il link si rigenera dalla
              scheda in Richieste demo.
            </p>
          </div>
        ) : null}

        {/* Due passaggi invece di uno. Il primo non fa niente di irreversibile;
            il secondo crea l'account e manda l'email, e l'email non torna
            indietro. Fra i due si rileggono l'indirizzo e il piano, che sono
            le due cose che dopo non si correggono. */}
        {conferma ? (
          <div className="mt-6 rounded-2xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Controlla prima di procedere</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Concessionaria</dt>
                <dd className="font-medium text-slate-900">{modulo.dealershipName || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Piano</dt>
                <dd className="font-medium text-slate-900">
                  {DEMO_PLAN_CATALOG.find((piano) => piano.code === modulo.planCode)?.name ?? modulo.planCode}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">L&apos;email di accesso va a</dt>
                <dd className="break-all font-semibold text-slate-900">{modulo.email || "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Premendo Conferma l&apos;account viene creato e l&apos;email parte subito. Non si puo&apos; richiamare
              indietro: se l&apos;indirizzo e sbagliato, le credenziali arrivano a un estraneo.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void attiva()}
                disabled={inCorso}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Conferma e attiva
              </button>
              <button
                type="button"
                onClick={() => setConferma(false)}
                disabled={inCorso}
                className="text-sm font-semibold text-slate-700 underline disabled:opacity-60"
              >
                Torna a correggere
              </button>

              {inCorso ? <span className="text-sm text-slate-600">{DESCRIZIONE_PASSO[passo]}</span> : null}
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setConferma(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Attiva la concessionaria
            </button>
          </div>
        )}
      </section>
    </AdminShell>
  );
}

function Campo({
  etichetta,
  valore,
  onChange,
  tipo = "text",
  nota,
}: {
  etichetta: string;
  valore: string;
  onChange: (valore: string) => void;
  tipo?: string;
  nota?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{etichetta}</span>
      <input
        type={tipo}
        value={valore}
        onChange={(evento) => onChange(evento.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
      />
      {nota ? <span className="mt-1 block text-xs text-slate-500">{nota}</span> : null}
    </label>
  );
}
