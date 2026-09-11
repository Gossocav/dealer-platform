/**
 * I turni della sincronizzazione notturna: chi lavora, in che ordine, quando
 * fermarsi, e cosa vuol dire "c'e' ancora da fare".
 *
 * **Il difetto che questo file corregge.** Dal 07/09/2026 il sito di Autogepy
 * ha risposto "troppe richieste" (HTTP 429) a quasi ogni scheda. Il lavoro
 * periodico dava a ogni sito la sua fetta di tempo, e Autogepy la bruciava
 * tutta in letture fallite: prima le stesse tredici auto "nuove" -- mai
 * importate perche' la pagina non si leggeva -- poi le stesse venticinque
 * schede da rileggere, che non venivano segnate e restavano in testa alla
 * fila. Zero progresso per tre giorni, e nessuno che lo dicesse: un flag
 * unico ("ancora da fare") restava acceso per sempre, ogni run andava al
 * tetto delle venti chiamate, e il riepilogo era verde.
 *
 * Qui non c'e' rete ne' database: ci sono le regole, e i test le provano con
 * un sito finto che non risponde mai.
 */

export const FALLIMENTI_CONSECUTIVI_MAX = 3;

/** La finestra su cui si guarda se un sito e' vivo: quanto ne e' stato ricontrollato. */
export const ORE_DELLA_FINESTRA = 24;

/** Quante schede fallite si ricordano per sito, fra una chiamata e l'altra. */
const SALTATE_MASSIME_PER_SITO = 200;

/**
 * Quello che una chiamata passa alla successiva. L'endpoint non ha memoria:
 * ogni chiamata e' un processo nuovo. Il progresso di un sito grande sta gia'
 * nel database (`import_synced_at` manda in fondo alla fila le schede
 * rilette); quello che il database non sa e' **cosa e' gia' fallito in
 * questo run**, e da quale sito si e' cominciato l'ultima volta.
 */
export type Cursore = {
  /** La chiave del sito che ha avuto il primo turno nella chiamata precedente. */
  dopo: string | null;
  /** Per sito, gli identificativi delle schede fallite in questo run: non si ritentano. */
  saltate: Record<string, string[]>;
  /**
   * I siti la cui **importazione** ha trovato il sito che frena: alla chiamata
   * dopo saltano quel passo e vanno dritti al ripasso delle schede che hanno
   * gia'. Vedi `PAUSA_DOPO_IL_FRENO_MS` per il perche'.
   */
  importazioneRimandata: string[];
};

export const CURSORE_VUOTO: Cursore = { dopo: null, saltate: {}, importazioneRimandata: [] };

/**
 * Quanto si aspetta fra una scheda e l'altra su un sito che ha appena
 * risposto "troppe richieste".
 *
 * Misurato su autogepy.it l'11/09/2026: a quattro decimi di secondo rifiuta
 * quasi sempre, a cinque secondi e oltre risponde. Non e' una soglia netta --
 * le risposte sono irregolari -- quindi questo numero va corretto guardando
 * quante schede passano davvero, non calcolato.
 */
export const PAUSA_DOPO_IL_FRENO_MS = 5000;

export function chiaveSorgente(sorgente: { dealer_id: string; import_source: string }) {
  return `${sorgente.dealer_id}|${sorgente.import_source}`;
}

/** Legge un cursore arrivato dall'esterno senza fidarsi della sua forma. */
export function leggiCursore(grezzo: unknown): Cursore {
  if (!grezzo || typeof grezzo !== "object") return CURSORE_VUOTO;
  const oggetto = grezzo as Record<string, unknown>;
  const dopo = typeof oggetto.dopo === "string" && oggetto.dopo.trim() ? oggetto.dopo.trim() : null;
  const saltate: Record<string, string[]> = {};
  if (oggetto.saltate && typeof oggetto.saltate === "object") {
    for (const [chiave, valore] of Object.entries(oggetto.saltate as Record<string, unknown>)) {
      if (!Array.isArray(valore)) continue;
      const ids = valore.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (ids.length > 0) saltate[chiave] = ids.slice(-SALTATE_MASSIME_PER_SITO);
    }
  }
  const importazioneRimandata = Array.isArray(oggetto.importazioneRimandata)
    ? (oggetto.importazioneRimandata as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];

  return { dopo, saltate, importazioneRimandata };
}

/**
 * Segna che per questo sito l'importazione va rimandata alla chiamata dopo.
 *
 * **Il difetto che questo chiude**, misurato l'11/09/2026. Sul sito di
 * Autogepy c'erano diciassette auto che in KeyAuto non erano mai entrate,
 * perche' le loro pagine non si lasciavano leggere. Ogni chiamata provava
 * prima quelle, si prendeva un "troppe richieste" alla prima, e passava la
 * mano all'intero sito -- senza mai arrivare alle centotrentotto schede che
 * c'erano gia' e andavano solo ripassate. Quelle diciassette non entravano
 * mai, quindi restavano diciassette per sempre: un blocco che si teneva in
 * piedi da solo, e per quattro giorni non e' stata aggiornata **nessuna**
 * scheda di quel sito.
 *
 * Adesso il turno perso vale solo per il passo che ha trovato il freno: alla
 * chiamata dopo si riparte dal ripasso, che e' la parte che ha qualcosa da
 * guadagnare.
 */
export function rimandaImportazione(cursore: Cursore, chiave: string): Cursore {
  if (cursore.importazioneRimandata.includes(chiave)) return cursore;
  return { ...cursore, importazioneRimandata: [...cursore.importazioneRimandata, chiave] };
}

export function importazioneDaSaltare(cursore: Cursore, chiave: string): boolean {
  return cursore.importazioneRimandata.includes(chiave);
}

export function aggiungiSaltate(cursore: Cursore, chiave: string, ids: readonly string[]): Cursore {
  if (ids.length === 0) return cursore;
  const unite = [...new Set([...(cursore.saltate[chiave] ?? []), ...ids])].slice(-SALTATE_MASSIME_PER_SITO);
  return { ...cursore, saltate: { ...cursore.saltate, [chiave]: unite } };
}

/**
 * Lo stesso elenco, ma a partire dall'elemento **dopo** `dopo`.
 *
 * Il primo turno e' il piu' ricco: ha davanti tutto il tempo che il primo
 * passo ha lasciato. Se fosse sempre dello stesso sito, gli altri vivrebbero
 * di avanzi. Se `dopo` non c'e' piu' -- un sito scollegato -- si riparte
 * dall'inizio.
 */
export function ordinaARotazione<T>(elenco: readonly T[], chiaveDi: (elemento: T) => string, dopo: string | null): T[] {
  if (!dopo || elenco.length < 2) return [...elenco];
  const indice = elenco.findIndex((elemento) => chiaveDi(elemento) === dopo);
  if (indice < 0) return [...elenco];
  return [...elenco.slice(indice + 1), ...elenco.slice(0, indice + 1)];
}

export type EsitoLetturaFila = { ok: true; html: string } | { ok: false; motivo: "frenato" | "non-letta" };

/**
 * Cosa fare con una pagina letta. `fermati` e' per il tetto del piano: se
 * non c'e' posto per una, non c'e' per nessuna. `saltata` e' una scheda che
 * non si importa (senza prezzo, un noleggio): non e' un guasto del sito.
 */
export type EsitoElaborazione = "fatta" | "saltata" | "fermati";

export type EsitoFila = {
  /** Schede lette e scritte. */
  fatte: number;
  /** Schede prese in mano, riuscite o no. */
  esaminate: number;
  /** Identificativi delle schede la cui pagina non si e' letta. */
  fallite: string[];
  /**
   * Perche' ci si e' fermati prima della fine, se ci si e' fermati:
   * - `freno`: il sito ha risposto 429. Si smette subito: continuare e'
   *   quello che ci chiede di non fare, e il tempo va agli altri siti.
   * - `letture-fallite`: tre pagine di fila non lette. Il sito e' giu', o ci
   *   rifiuta: stessa conclusione.
   * - `tetto`: il piano non ha piu' posto.
   */
  fermataPer: null | "freno" | "letture-fallite" | "tetto";
  /** Il tempo e' finito prima della fine della fila. */
  interrotta: boolean;
  /** Quante ne restano per un'altra chiamata. Con il tetto del piano, nessuna. */
  restanti: number;
};

/**
 * Percorre una fila di schede finche' c'e' tempo, il sito risponde e c'e'
 * posto. Non sa niente di rete o database: chi la chiama passa `leggi` ed
 * `elabora`, e nei test sono finti.
 */
export async function percorriFila<T extends { sourceId: string }>(input: {
  voci: readonly T[];
  scaduto: () => boolean;
  leggi: (voce: T) => Promise<EsitoLetturaFila>;
  elabora: (voce: T, html: string) => Promise<EsitoElaborazione>;
  pausa?: () => Promise<void>;
}): Promise<EsitoFila> {
  const esito: EsitoFila = { fatte: 0, esaminate: 0, fallite: [], fermataPer: null, interrotta: false, restanti: 0 };
  const pausa = input.pausa ?? (async () => {});
  let falliteDiFila = 0;

  for (const voce of input.voci) {
    if (input.scaduto()) {
      esito.interrotta = true;
      break;
    }

    esito.esaminate += 1;
    const letto = await input.leggi(voce);

    if (!letto.ok) {
      esito.fallite.push(voce.sourceId);
      if (letto.motivo === "frenato") {
        esito.fermataPer = "freno";
        break;
      }
      falliteDiFila += 1;
      if (falliteDiFila >= FALLIMENTI_CONSECUTIVI_MAX) {
        esito.fermataPer = "letture-fallite";
        break;
      }
      await pausa();
      continue;
    }

    falliteDiFila = 0;
    const elaborata = await input.elabora(voce, letto.html);
    if (elaborata === "fermati") {
      esito.fermataPer = "tetto";
      break;
    }
    if (elaborata === "fatta") esito.fatte += 1;
    await pausa();
  }

  // Le fallite restano da fare: la prossima chiamata le salta grazie al
  // cursore, ma il run dopo le ritenta.
  esito.restanti = esito.fermataPer === "tetto" ? 0 : Math.max(0, input.voci.length - esito.esaminate + esito.fallite.length);
  return esito;
}

/**
 * Se vale la pena richiamare per questo sito.
 *
 * Non basta che resti qualcosa da fare: deve esserci **progresso**. Un sito
 * che in questa chiamata non ha portato a casa niente -- perche' frena,
 * perche' e' giu' -- alla prossima fara' lo stesso, e tenere acceso il flag
 * per lui vuol dire venti chiamate a vuoto e un riepilogo che dice "fermata
 * al tetto" per sempre. L'eccezione e' il sito che non ha nemmeno iniziato,
 * perche' il tempo era finito prima: alla prossima chiamata la rotazione lo
 * mette per primo.
 */
export function serveAncora(esito: Pick<EsitoFila, "restanti" | "fatte" | "esaminate">): boolean {
  if (esito.restanti <= 0) return false;
  return esito.fatte > 0 || esito.esaminate === 0;
}

export type StatoDelSito = {
  sito: string;
  dealerId: string;
  /** L'ultima scheda riletta, per il riepilogo. */
  ultimaSincronizzazione: string | null;
  /** Quante schede il sito dichiara ancora, e che quindi vanno tenute fresche. */
  schede: number;
  /** Di quelle, quante sono state rilette nelle ultime 24 ore. */
  schedeFresche: number;
};

export type SitoInRitardo = StatoDelSito & {
  /** Da quante ore risale la scheda piu' recente. `null` se non risulta. */
  oreDiRitardo: number | null;
};

/**
 * Quanta parte dello stock va ricontrollata perche' il sito si consideri vivo.
 * Un terzo e' largo: il lavoro rilegge ogni scheda ogni sei ore, quindi in
 * ventiquattro ore un sito che risponde le passa tutte piu' volte.
 */
const QUOTA_MINIMA = 3;

/**
 * I siti fermi da troppo.
 *
 * **Non si guarda la scheda piu' recente.** Era la prima versione di questo
 * controllo, ed era cieca proprio sul caso per cui era nata: il sito di
 * Autogepy, dal 07/09/2026, lasciava passare la prima lettura e rispondeva
 * "troppe richieste" a tutte le altre. Una sola scheda riletta rimetteva a
 * zero l'orologio, e un sito che non aggiornava nulla da tre giorni risultava
 * sincronizzato un minuto fa. Misurato il 10/09/2026.
 *
 * Si guarda invece **quanta parte dello stock e' stata ricontrollata nelle
 * ultime ventiquattro ore**: otto schede su centocinquantatre' sono un sito
 * fermo, comunque le si guardi. Cosi' una sola scheda che non si lascia
 * leggere non fa gridare al lupo, e un sito che non si lascia leggere non
 * riesce a nascondersi dietro una scheda fortunata.
 */
export function sitiInRitardo(stati: ReadonlyArray<StatoDelSito>, adesso: Date): SitoInRitardo[] {
  const inRitardo: SitoInRitardo[] = [];
  for (const stato of stati) {
    if (stato.schede <= 0) continue;
    if (stato.schedeFresche * QUOTA_MINIMA >= stato.schede) continue;

    const istante = stato.ultimaSincronizzazione ? Date.parse(stato.ultimaSincronizzazione) : Number.NaN;
    const ore = Number.isNaN(istante) ? null : Math.floor((adesso.getTime() - istante) / 3_600_000);
    inRitardo.push({ ...stato, oreDiRitardo: ore });
  }
  return inRitardo;
}

/**
 * Di quali siti si grida **oggi**.
 *
 * Il lavoro gira ogni tre ore: senza un freno, un sito bloccato manderebbe
 * otto avvisi al giorno, e un avviso che suona sempre e' un avviso che si
 * smette di leggere. Se ne manda uno solo, al giro di mezzanotte UTC -- cosi'
 * arriva sempre alla stessa ora e lo si aspetta, invece di trovarselo addosso
 * a caso.
 *
 * `< 3` e non `=== 0` perche' GitHub fa partire i lavori programmati in
 * ritardo, anche di parecchi minuti: cosi' il giro di mezzanotte resta quello
 * di mezzanotte anche se parte all'una, e non puo' confondersi con quello
 * delle tre.
 *
 * **Un giro lanciato a mano segnala tutto.** Chi preme "Run workflow" lo fa
 * per sapere come stanno le cose adesso: un verde che nasconde un sito fermo
 * da tre giorni e' il difetto che questo progetto ha gia' pagato due volte.
 *
 * Quello che resta scoperto, e non si chiude senza tenere memoria da qualche
 * parte: se il giro di mezzanotte salta, quel giorno l'avviso non parte e
 * torna il giorno dopo.
 */
export function daSegnalareOggi(
  inRitardo: ReadonlyArray<SitoInRitardo>,
  adesso: Date,
  opzioni?: { aMano?: boolean },
): SitoInRitardo[] {
  if (opzioni?.aMano) return [...inRitardo];
  return adesso.getUTCHours() < 3 ? [...inRitardo] : [];
}
