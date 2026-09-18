/**
 * Da dove viene ogni dato di una scheda, e chi puo' sovrascriverlo.
 *
 * **La regola, decisa dal titolare il 14/09/2026:**
 *
 * > Un dato scritto dal concessionario **non viene mai sovrascritto** dalla
 * > sincronizzazione, nemmeno se il sito cambia idea.
 *
 * **Come si applica, ed e' il punto di tutto questo file.** Non chiedendo a
 * chi scrive di ricordarsene: **non consegnandogli il dato protetto**. Chi
 * sincronizza passa a `scriviDalSito` quello che il sito dice e riceve
 * indietro **solo cio' che puo' scrivere** -- i campi che il concessionario ha
 * scritto a mano non compaiono nel risultato, quindi non c'e' niente da
 * saltare e niente da dimenticare.
 *
 * La differenza non e' di stile. Un controllo **dentro** la sincronizzazione
 * si aggira scrivendo una tredicesima porta che non lo fa: e' esattamente
 * quello che e' successo al tetto del piano, sparso su dodici punti di
 * scrittura. Una funzione che **non restituisce** il campo protetto non si
 * aggira, perche' chi la usa non ha in mano niente da scrivere.
 *
 * **Quando il sito cambia un dato che il concessionario aveva scritto**, il
 * valore non si tocca e il disaccordo **non si butta via**: si registra
 * accanto, in `il_sito_dice`. Un dato che il sito dichiara e noi scartiamo
 * senza lasciare traccia e' indistinguibile da un dato che il sito non ha mai
 * detto -- ed e' la famiglia di difetti piu' ripetuta di questo progetto.
 *
 * Tre regole perche' non diventi rumore: si **sovrascrive** a ogni giro (conta
 * l'ultima cosa che il sito dice, non lo storico); **sparisce da solo** quando
 * il sito torna d'accordo; e **non e' un errore** -- diventera' la riga "il tuo
 * sito ora dice 03/2022, tu avevi scritto 01/2022", con un pulsante per
 * adottarlo se il concessionario vuole.
 */

/** Chi ha messo li' quel valore. */
export type Fonte =
  /** Il sito della concessionaria lo dichiara. */
  | "sito"
  /** Il sistema del concessionario l'ha riempito da solo: vale meno. */
  | "dedotto"
  /**
   * Il feed (o il file) che il concessionario ci manda lo dichiara. Non e'
   * "il sito": la dicitura lo dice, perche' una provenienza sbagliata e'
   * peggio di nessuna provenienza.
   */
  | "feed"
  /** L'ha scritto il concessionario. **Non si sovrascrive mai.** */
  | "dealer";

/** Le fonti che scrivono da sole, e che quindi si fermano davanti a `dealer`. */
export type FonteAutomatica = Exclude<Fonte, "dealer">;

/** Un valore come sta in una colonna di `vehicles`: anche gli elenchi (`equipment`). */
export type Valore = string | number | boolean | string[] | null;

export type SegnoDiProvenienza = {
  fonte: Fonte;
  /** Quando il concessionario l'ha confermato. Assente = e' una proposta. */
  confermato_il?: string | null;
  /**
   * Quando questo segno e' stato **ricostruito** invece che osservato.
   *
   * Un segno normale nasce mentre si legge il sito: si e' visto quel valore
   * arrivare, quel giorno. Le schede sparite dal sito non si possono piu'
   * leggere, e il segno che portano e' stato **dedotto da quello che
   * l'importazione aveva scritto** (migration `20260918010000`): il valore
   * viene dal sito, questo si sa, ma nessuno l'ha visto arrivare in quel
   * momento.
   *
   * Non e' un marcatore tecnico, e' la stessa distinzione fra "misurato" e
   * "dedotto" che vale per la data d'ingresso. Serve anche a una cosa
   * pratica: e' l'unico modo che il ritorno di quella migration ha di
   * riconoscere **le sue** schede, senza appoggiarsi a indizi che una
   * correzione futura potrebbe far sparire.
   *
   * Sparisce da solo: se quella scheda tornasse sul sito e venisse riletta
   * davvero, `scriviDalSito` sostituisce il segno intero e la ricostruzione
   * lascia il posto a un'osservazione.
   */
  ricostruito_il?: string | null;
  /**
   * Cosa dice il sito adesso, quando non e' d'accordo con il concessionario.
   *
   * `fonte` dice **chi** non e' d'accordo: il sito della concessionaria o il
   * feed che ci manda. Senza, la scheda avrebbe dovuto scegliere una frase a
   * caso, e "il tuo sito ora dice" a chi manda un feed e' una provenienza
   * sbagliata -- peggio di nessuna. Manca sui disaccordi registrati prima del
   * 18/09/2026 (in produzione: nessuno).
   */
  il_sito_dice?: { valore: string; visto_il: string; fonte?: FonteAutomatica } | null;
};

export type OrigineDati = Record<string, SegnoDiProvenienza>;

/** Un valore letto dal sito, con quanto ci si puo' credere. */
export type LettoDalSito = { valore: Valore; fonte: FonteAutomatica };

export type EsitoScrittura = {
  /** Cosa si puo' scrivere davvero. I campi del concessionario non ci sono. */
  daScrivere: Record<string, Valore>;
  /** Il nuovo `origine_dati` della scheda, gia' pronto da salvare. */
  origineDati: OrigineDati;
  /**
   * I campi che il sito dichiarava e che **non** si sono scritti perche' li ha
   * scritti il concessionario. Serve a raccontarlo nei log, non a decidere.
   */
  protetti: string[];
};

/** Legge il segno di un campo. Un oggetto malformato vale come "mai visto". */
export function provenienza(origineDati: unknown, campo: string): SegnoDiProvenienza | null {
  if (!origineDati || typeof origineDati !== "object" || Array.isArray(origineDati)) return null;
  const segno = (origineDati as Record<string, unknown>)[campo];
  if (!segno || typeof segno !== "object" || Array.isArray(segno)) return null;
  const fonte = (segno as { fonte?: unknown }).fonte;
  if (fonte !== "sito" && fonte !== "dedotto" && fonte !== "feed" && fonte !== "dealer") return null;
  return segno as SegnoDiProvenienza;
}

/** Vero solo se quel campo l'ha scritto il concessionario. */
export function scrittoDalDealer(origineDati: unknown, campo: string): boolean {
  return provenienza(origineDati, campo)?.fonte === "dealer";
}

/**
 * Vero quando il concessionario ha confermato quel campo.
 *
 * **Un dato proposto si mostra ma non si usa**: finche' non e' confermato non
 * entra nella giacenza, non entra nel margine, non entra nella priorita' del
 * tetto del piano e non conta nella completezza. Quello che ha scritto lui e'
 * confermato per definizione: non c'e' niente da approvare.
 */
export function confermato(origineDati: unknown, campo: string): boolean {
  const segno = provenienza(origineDati, campo);
  if (!segno) return false;
  if (segno.fonte === "dealer") return true;
  return Boolean(segno.confermato_il);
}

/**
 * Se due valori sono lo **stesso** valore.
 *
 * Il confronto e' per testo, con una eccezione che conta: quando tutti e due
 * si leggono come numeri si confrontano **come numeri**. Il database
 * restituisce un prezzo come `"9500.00"` e il modulo lo rimanda come `9500`:
 * sono la stessa cifra, e chiamarle diverse fa credere che il concessionario
 * abbia cambiato il prezzo quando non l'ha toccato -- e, nella
 * sincronizzazione, fa registrare un disaccordo che non esiste.
 */
const uguali = (a: unknown, b: unknown) => {
  const testoA = String(a ?? "").trim();
  const testoB = String(b ?? "").trim();
  if (testoA === testoB) return true;
  const numeroA = Number(testoA);
  const numeroB = Number(testoB);
  if (testoA === "" || testoB === "") return false;
  return Number.isFinite(numeroA) && Number.isFinite(numeroB) && numeroA === numeroB;
};

/**
 * Cosa si puo' scrivere, avendo letto il sito.
 *
 * `valoriInArchivio` sono quelli che la scheda ha adesso: servono a capire se
 * il sito sta dicendo una cosa **diversa** da quella scritta dal
 * concessionario, che e' l'unico caso in cui si registra il disaccordo.
 *
 * `oggi` si passa da fuori invece di chiederlo all'orologio, cosi' la stessa
 * chiamata da' sempre lo stesso risultato e il test non dipende dal giorno.
 */
export function scriviDalSito(
  origineDatiAttuale: unknown,
  valoriInArchivio: Record<string, Valore | undefined>,
  lettiDalSito: Record<string, LettoDalSito>,
  oggi: string,
): EsitoScrittura {
  const partenza = (origineDatiAttuale && typeof origineDatiAttuale === "object" && !Array.isArray(origineDatiAttuale)
    ? (origineDatiAttuale as OrigineDati)
    : {}) as OrigineDati;

  const origineDati: OrigineDati = { ...partenza };
  const daScrivere: Record<string, Valore> = {};
  const protetti: string[] = [];

  for (const [campo, letto] of Object.entries(lettiDalSito)) {
    // Il sito non dice niente su questo campo: non e' un motivo per cancellare
    // quello che c'e'.
    if (letto.valore === null || letto.valore === undefined || letto.valore === "") continue;

    const segno = provenienza(origineDati, campo);

    if (segno?.fonte === "dealer") {
      protetti.push(campo);

      // **Chi non sa cosa c'e' in archivio non puo' dire che c'e' un
      // disaccordo.** Se il campo non e' fra i valori riletti, il confronto
      // sarebbe fra il valore del sito e il vuoto: esce sempre "diverso", e
      // la scheda direbbe "il tuo sito ora dice 01/01/2022, tu avevi scritto
      // 01/01/2022". E' successo con i tre campi del blocco ricco, che il
      // ripasso proponeva senza rileggerli (18/09/2026). Il segno resta
      // com'era: ne' un disaccordo inventato, ne' uno cancellato per sbaglio.
      if (!(campo in valoriInArchivio)) continue;

      // Il disaccordo si registra; il valore no. Quando il sito torna a dire
      // la stessa cosa, il segno sparisce da solo.
      const nuovo: SegnoDiProvenienza = { ...segno };
      if (uguali(valoriInArchivio[campo], letto.valore)) {
        delete nuovo.il_sito_dice;
      } else {
        nuovo.il_sito_dice = { valore: String(letto.valore), visto_il: oggi, fonte: letto.fonte };
      }
      origineDati[campo] = nuovo;
      continue;
    }

    daScrivere[campo] = letto.valore;
    origineDati[campo] = {
      fonte: letto.fonte,
      // Una conferma gia' data non si perde: il concessionario ha detto di si'
      // a quel campo, e il sito che lo riconferma non gli chiede di rifarlo.
      confermato_il: segno && uguali(valoriInArchivio[campo], letto.valore) ? segno.confermato_il ?? null : null,
    };
  }

  return { daScrivere, origineDati, protetti };
}

/**
 * Comodita' per chi ha gia' un oggetto di valori letti dal sito e vuole
 * passarlo a `scriviDalSito` senza ripetere la fonte per ogni campo.
 *
 * I campi vuoti non si tolgono qui: ci pensa `scriviDalSito`, e la ragione e'
 * la stessa -- "il sito non lo dice" non vuol dire "il sito dice che non c'e'".
 */
export function dalSito(
  valori: Record<string, Valore | undefined>,
  fonte: FonteAutomatica = "sito",
): Record<string, LettoDalSito> {
  const letti: Record<string, LettoDalSito> = {};
  for (const [campo, valore] of Object.entries(valori)) {
    letti[campo] = { valore: valore === undefined ? null : valore, fonte };
  }
  return letti;
}

/** Come si segna un campo scritto dal concessionario. Da qui in poi e' suo. */
export function segnaComeScrittoDalDealer(origineDatiAttuale: unknown, campi: string[]): OrigineDati {
  const partenza = (origineDatiAttuale && typeof origineDatiAttuale === "object" && !Array.isArray(origineDatiAttuale)
    ? (origineDatiAttuale as OrigineDati)
    : {}) as OrigineDati;

  const origineDati: OrigineDati = { ...partenza };
  for (const campo of campi) origineDati[campo] = { fonte: "dealer" };
  return origineDati;
}

/**
 * I campi che stanno **davvero cambiando** rispetto a quello che c'e' in
 * archivio.
 *
 * **Perche' esiste.** Salvando una scheda, il modulo rimanda tutti i suoi
 * campi, toccati o no. Segnarli tutti come "scritti dal concessionario"
 * voleva dire, aprendo un'auto importata e premendo Salva senza cambiare
 * niente: venticinque campi che dicono "scritto da te" su numeri che ha
 * scritto il sito, tutti i disaccordi cancellati e tutte le conferme perse.
 * Finche' nessuna schermata mostrava la provenienza non si vedeva; il giorno
 * che la mostra, diventa una bugia su ogni riga della scheda (18/09/2026).
 *
 * Un campo non toccato **non si tocca**: il suo segno resta com'era, con la
 * sua fonte, la sua conferma e il suo eventuale disaccordo.
 */
export function campiDavveroCambiati(
  valoriInArchivio: Record<string, unknown> | null | undefined,
  valoriDaSalvare: Record<string, unknown>,
  daIgnorare: readonly string[] = [],
): string[] {
  const archivio = valoriInArchivio ?? {};
  const fuori = new Set(daIgnorare);
  return Object.keys(valoriDaSalvare).filter(
    (campo) => !fuori.has(campo) && !uguali(archivio[campo], valoriDaSalvare[campo]),
  );
}

/**
 * La dicitura per un campo che non ha nessun segno.
 *
 * Non e' un dettaglio: le schede nate prima del 15/09/2026, quelle importate
 * da un file e quelle toccate dal foglio di consegna hanno `origine_dati`
 * vuoto, e sono tante. Tacere lascerebbe un numero nudo -- la regola
 * applicata a meta' -- e dedurre "scritto da te" dall'assenza sarebbe
 * inventare. Quello che sappiamo e' che non lo sappiamo, e si dice.
 */
export const SENZA_SEGNO = "provenienza non registrata";

/**
 * La dicitura da mettere accanto al valore. **Risponde sempre**: un numero
 * non si mostra mai nudo, nemmeno quando la sua provenienza non e' scritta.
 */
export function etichettaProvenienza(origineDati: unknown, campo: string): string {
  const segno = provenienza(origineDati, campo);
  if (!segno) return SENZA_SEGNO;
  if (segno.fonte === "dealer") return "scritto da te";
  const daConfermare = segno.confermato_il ? "" : " · da confermare";
  if (segno.fonte === "feed") return `dal tuo feed${daConfermare}`;
  // "deciso dal tuo sito" era la dicitura di `dedotto`, e si leggeva come una
  // dichiarazione del sito: e' il contrario di quello che vuol dire. Un dato
  // dedotto il sito non lo dichiara, ce l'ha messo il suo sistema. Corretto il
  // 18/09/2026 dopo averlo visto a schermo accanto a "in vetrina da almeno",
  // dove le due meta' della stessa riga si contraddicevano.
  if (segno.fonte === "dedotto") return `non dichiarato dal tuo sito, riempito dal suo sistema${daConfermare}`;
  return `dal tuo sito${daConfermare}`;
}

/**
 * La dicitura da mettere sotto un valore: **la sua provenienza, oppure il
 * perche' manca**. Sono due cose diverse e la schermata non deve sceglierle a
 * mano, o fra tre schermate diventano tre regole.
 *
 * Un campo vuoto non ha provenienza: il sito non lo scrive, quindi non lascia
 * nessun segno. Dire "provenienza non registrata" accanto a un trattino
 * risponderebbe a una domanda che nessuno ha fatto; quello che chi guarda
 * vuole sapere e' **perche' non c'e'**.
 */
export function notaDelCampo(origineDati: unknown, campo: string, valore: unknown, daUnSito: boolean): string {
  const vuoto =
    valore === null ||
    valore === undefined ||
    (typeof valore === "string" && valore.trim() === "") ||
    (Array.isArray(valore) && valore.length === 0);
  if (vuoto) return daUnSito ? "il tuo sito non lo dichiara" : "non e' stato indicato";
  return etichettaProvenienza(origineDati, campo);
}

/**
 * La dicitura per un valore che **non e' stato letto da nessuna parte: l'ha
 * contato KeyAuto**. I giorni in piazzale, un totale, una percentuale.
 *
 * `da` dice **da cosa**, e non e' facoltativo per abitudine: due numeri
 * calcolati dalla stessa schermata su due date diverse -- l'ingresso dal sito
 * e l'acquisto scritto a mano -- si leggono come lo stesso numero se non si
 * dice da dove vengono.
 */
export function calcolatoDaKeyAuto(da?: string | null): string {
  const origine = String(da ?? "").trim();
  return origine ? `calcolato da KeyAuto ${origine}` : "calcolato da KeyAuto";
}

/** Il disaccordo registrato su un campo, se c'e' ed e' leggibile. */
export function disaccordo(
  origineDati: unknown,
  campo: string,
): { valore: string; vistoIl: string; fonte: FonteAutomatica | null } | null {
  const segno = provenienza(origineDati, campo);
  // Un disaccordo esiste solo contro qualcosa che ha scritto il
  // concessionario: su un campo che arriva dal sito, il sito non e' in
  // disaccordo con se stesso -- lo riscrive e basta.
  if (!segno || segno.fonte !== "dealer" || !segno.il_sito_dice) return null;
  const detto = segno.il_sito_dice;
  const fonte = detto.fonte === "sito" || detto.fonte === "dedotto" || detto.fonte === "feed" ? detto.fonte : null;
  return { valore: String(detto.valore ?? ""), vistoIl: String(detto.visto_il ?? ""), fonte };
}

/**
 * La frase del disaccordo, gia' scritta. `valoreFormattato` lo prepara chi
 * chiama, perche' solo lui sa se quel campo e' un prezzo, una data o dei
 * chilometri.
 *
 * Quando non si sa **chi** non e' d'accordo (disaccordi registrati prima del
 * 18/09/2026) si dice "dove l'abbiamo letto": non si sceglie "il tuo sito"
 * per default, che su una concessionaria a feed sarebbe falso.
 */
export function fraseDelDisaccordo(valoreFormattato: string, fonte: FonteAutomatica | null): string {
  const chi = fonte === "feed" ? "Il tuo feed" : fonte === null ? "Dove l'abbiamo letto" : "Il tuo sito";
  return `${chi} ora dice ${valoreFormattato}: sul marketplace vale il tuo.`;
}
