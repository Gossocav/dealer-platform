/**
 * Lo stato, scritto in italiano.
 *
 * Le pagine amministrative mostravano il codice tecnico cosi' com'era --
 * "pending_review", "activated", "revoked" -- lasciando a chi guarda il
 * compito di tradurlo. Le etichette vivono qui, in un posto solo, perche' lo
 * stesso stato compariva in due pagine con due nomi diversi.
 */
export type TipoStato = "concessionaria" | "richiesta" | "demo";

const ETICHETTE: Record<TipoStato, Record<string, string>> = {
  concessionaria: {
    pending_review: "Da approvare",
    approved: "Attiva",
    rejected: "Rifiutata",
    suspended: "Sospesa",
    cancelled: "Chiusa",
  },
  richiesta: {
    pending: "Da contattare",
    contacted: "Contattata",
    activated: "Demo attiva",
    rejected: "Rifiutata",
    converted: "Convertita in abbonamento",
    revoked: "Demo revocata",
  },
  demo: {
    provisioning: "In attivazione",
    active: "In corso",
    expired: "Scaduta",
    converted: "Convertita",
    revoked: "Revocata",
  },
};

// Verde: va tutto bene. Ambra: aspetta qualcosa da noi. Rosso: si e' chiuso
// male. Grigio: e' finito senza clamore. Il colore non basta da solo -- ogni
// pastiglia porta anche la parola.
const COLORI: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  active: "bg-emerald-100 text-emerald-800",
  activated: "bg-emerald-100 text-emerald-800",
  converted: "bg-indigo-100 text-indigo-800",
  pending_review: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  contacted: "bg-sky-100 text-sky-800",
  provisioning: "bg-sky-100 text-sky-800",
  rejected: "bg-rose-100 text-rose-800",
  revoked: "bg-orange-100 text-orange-800",
  suspended: "bg-orange-100 text-orange-800",
  expired: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
};

export function etichettaStato(tipo: TipoStato, valore: string | null | undefined) {
  const codice = String(valore ?? "").trim().toLowerCase();
  if (!codice) return "-";

  // Un codice che non conosciamo si mostra com'e': "non lo so" detto per
  // intero e' meglio di un trattino che sembra un dato mancante.
  return ETICHETTE[tipo][codice] ?? codice;
}

export function StatoBadge({
  tipo,
  valore,
  className = "",
}: {
  tipo: TipoStato;
  valore: string | null | undefined;
  className?: string;
}) {
  const codice = String(valore ?? "").trim().toLowerCase();
  const colore = COLORI[codice] ?? "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colore} ${className}`.trim()}
    >
      {etichettaStato(tipo, valore)}
    </span>
  );
}
