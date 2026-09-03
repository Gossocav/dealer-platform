/**
 * I promemoria: cosa scade e cosa c'e' da fare.
 *
 * Chiesti dal titolare il 03/09/2026. Una riga con una data che a un certo
 * punto arriva: la revisione di una vettura, il richiamo di una lead, il
 * cliente da risentire dopo un preventivo. Sono la stessa cosa per chi li
 * riceve, e stanno in una tabella sola.
 *
 * **Un promemoria senza data non e' un promemoria, e' un appunto.** La data e'
 * l'unico campo obbligatorio, e lo impone anche il database.
 */

export type TipoPromemoria = {
  valore: string;
  etichetta: string;
  /** Vero per le scadenze che si scrivono sulla scheda della vettura. */
  scadenzaVeicolo?: boolean;
};

export const TIPI_PROMEMORIA: readonly TipoPromemoria[] = [
  { valore: "revisione", etichetta: "Revisione", scadenzaVeicolo: true },
  { valore: "assicurazione", etichetta: "Assicurazione", scadenzaVeicolo: true },
  { valore: "tagliando", etichetta: "Tagliando", scadenzaVeicolo: true },
  { valore: "garanzia", etichetta: "Garanzia", scadenzaVeicolo: true },
  { valore: "richiamo_lead", etichetta: "Richiamare la lead" },
  { valore: "richiamo_cliente", etichetta: "Richiamare il cliente" },
  { valore: "preventivo", etichetta: "Preventivo da risentire" },
  { valore: "altro", etichetta: "Altro" },
] as const;

/** Le scadenze che compaiono sulla scheda della vettura, nell'ordine giusto. */
export const SCADENZE_VEICOLO = TIPI_PROMEMORIA.filter((tipo) => tipo.scadenzaVeicolo);

export function etichettaTipo(valore: string | null | undefined) {
  const cercato = String(valore ?? "").trim();
  return TIPI_PROMEMORIA.find((tipo) => tipo.valore === cercato)?.etichetta ?? "Altro";
}

export type Promemoria = {
  id: string;
  tipo: string | null;
  titolo: string | null;
  note: string | null;
  scade_il: string;
  vehicle_id: string | null;
  lead_id: string | null;
  customer_id: string | null;
  stato: string | null;
};

/**
 * Quanto manca, e come si legge.
 *
 * Il giorno stesso non e' scaduto: una revisione fatta il giorno della
 * scadenza e' in regola, e chiamare un cliente alle sei di sera del giorno in
 * cui ci si era ripromessi di chiamarlo conta ancora.
 */
export type Urgenza = {
  scaduto: boolean;
  oggi: boolean;
  giorni: number;
  etichetta: string;
};

export function urgenza(scadeIl: string | null | undefined, adesso: Date = new Date()): Urgenza | null {
  const testo = String(scadeIl ?? "").trim();
  if (!testo) return null;

  const data = new Date(`${testo.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(data.getTime())) return null;

  const giornata = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const giorni = Math.round((data.getTime() - giornata.getTime()) / (24 * 60 * 60 * 1000));
  const quando = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(data);

  if (giorni < 0) {
    const da = Math.abs(giorni);
    return {
      scaduto: true,
      oggi: false,
      giorni,
      etichetta: `Scaduto il ${quando} — ${da} ${da === 1 ? "giorno" : "giorni"} fa`,
    };
  }

  if (giorni === 0) return { scaduto: false, oggi: true, giorni, etichetta: "Oggi" };
  if (giorni === 1) return { scaduto: false, oggi: false, giorni, etichetta: "Domani" };

  return { scaduto: false, oggi: false, giorni, etichetta: `Fra ${giorni} giorni — ${quando}` };
}

/**
 * Come si chiama un promemoria nell'elenco.
 *
 * Il titolo scritto a mano vince: chi si e' preso la briga di scrivere
 * "richiamare Rossi per la Panda" ha detto qualcosa di piu' preciso del tipo.
 */
export function titoloPromemoria(promemoria: Pick<Promemoria, "tipo" | "titolo">): string {
  const scritto = String(promemoria.titolo ?? "").trim();
  return scritto.length > 0 ? scritto : etichettaTipo(promemoria.tipo);
}

export type GruppiPromemoria<T> = {
  scaduti: T[];
  oggi: T[];
  settimana: T[];
  piuAvanti: T[];
};

/**
 * Divide i promemoria in quattro mucchi, nell'ordine in cui bruciano.
 *
 * **Scaduti in cima, sempre.** Un elenco ordinato solo per data mette in alto
 * quello di tre mesi fa insieme a quello di stamattina, e chi guarda non
 * distingue piu' l'arretrato da quello che deve fare adesso. Serve alla
 * schermata e all'email del mattino, che devono raccontare la stessa cosa
 * nello stesso ordine.
 */
export function raggruppaPerUrgenza<T extends { scade_il: string }>(
  promemoria: readonly T[],
  adesso: Date = new Date()
): GruppiPromemoria<T> {
  const gruppi: GruppiPromemoria<T> = { scaduti: [], oggi: [], settimana: [], piuAvanti: [] };

  const ordinati = [...promemoria].sort((a, b) => a.scade_il.localeCompare(b.scade_il));

  for (const voce of ordinati) {
    const quanto = urgenza(voce.scade_il, adesso);
    if (!quanto) continue;

    if (quanto.scaduto) gruppi.scaduti.push(voce);
    else if (quanto.oggi) gruppi.oggi.push(voce);
    else if (quanto.giorni <= 7) gruppi.settimana.push(voce);
    else gruppi.piuAvanti.push(voce);
  }

  return gruppi;
}

/** Quanti ne bruciano adesso: scaduti piu' quelli di oggi. Il numero del pallino. */
export function quantiUrgenti<T extends { scade_il: string }>(promemoria: readonly T[], adesso: Date = new Date()) {
  const gruppi = raggruppaPerUrgenza(promemoria, adesso);
  return gruppi.scaduti.length + gruppi.oggi.length;
}

/** La data di oggi come la scrive il database. */
export function oggiIso(adesso: Date = new Date()) {
  const mese = String(adesso.getMonth() + 1).padStart(2, "0");
  const giorno = String(adesso.getDate()).padStart(2, "0");
  return `${adesso.getFullYear()}-${mese}-${giorno}`;
}
