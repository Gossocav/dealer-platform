/**
 * La perizia di una vettura: cosa si guarda, e come si annota.
 *
 * Chiesta dal titolare il 02/09/2026. Serve **prima** di comprare: l'auto che
 * il cliente porta in permuta, o quella che il concessionario va a vedere.
 * Non e' ancora sua, quindi la perizia non nasce da una scheda del parco --
 * nasce vuota, e semmai e' l'auto che poi le si aggancia.
 *
 * **Perche' un elenco fisso e non un foglio libero.** Chi peritia di fretta,
 * su un piazzale, guarda quello che gli viene in mente: il graffio sulla
 * portiera lo vede sempre, il battistrada posteriore quasi mai. Le voci
 * scritte una per una sono la differenza fra un rilievo e un ricordo -- e sono
 * anche quello che permette di dire al venditore "questo l'abbiamo guardato
 * insieme" tre mesi dopo, quando contesta.
 *
 * L'elenco vive qui e in nessun altro posto: le schermate lo disegnano, la
 * stampa lo ripete, e il database conserva le risposte con queste chiavi. Se
 * un domani si aggiunge una voce, si aggiunge qui e compare ovunque.
 */

/** Uno stato possibile per una voce: il valore salvato e come si legge. */
export type StatoPerizia = {
  valore: string;
  etichetta: string;
  /** Vero per gli stati che segnalano un problema: servono al riepilogo. */
  daSistemare?: boolean;
};

export type VocePerizia = {
  chiave: string;
  etichetta: string;
};

export type SezionePerizia = {
  chiave: string;
  titolo: string;
  /** Una riga che dice al perito cosa sta guardando, dove non e' ovvio. */
  spiegazione?: string;
  stati: readonly StatoPerizia[];
  voci: readonly VocePerizia[];
};

const STATI_CARROZZERIA: readonly StatoPerizia[] = [
  { valore: "integro", etichetta: "Integro" },
  { valore: "graffi", etichetta: "Graffi", daSistemare: true },
  { valore: "ammaccatura", etichetta: "Ammaccatura", daSistemare: true },
  { valore: "riverniciare", etichetta: "Da riverniciare", daSistemare: true },
  { valore: "sostituire", etichetta: "Da sostituire", daSistemare: true },
];

const STATI_CRISTALLI: readonly StatoPerizia[] = [
  { valore: "integro", etichetta: "Integro" },
  { valore: "scheggiato", etichetta: "Scheggiato", daSistemare: true },
  { valore: "rigato", etichetta: "Rigato o opaco", daSistemare: true },
  { valore: "sostituire", etichetta: "Da sostituire", daSistemare: true },
];

const STATI_USURA: readonly StatoPerizia[] = [
  { valore: "come_nuovo", etichetta: "Come nuovo" },
  { valore: "usura_normale", etichetta: "Usura normale" },
  { valore: "usura_marcata", etichetta: "Usura marcata", daSistemare: true },
  { valore: "danneggiato", etichetta: "Danneggiato", daSistemare: true },
];

const STATI_FUNZIONAMENTO: readonly StatoPerizia[] = [
  { valore: "ok", etichetta: "Funziona" },
  { valore: "da_controllare", etichetta: "Da controllare", daSistemare: true },
  { valore: "da_riparare", etichetta: "Da riparare", daSistemare: true },
];

const STATI_PRESENZA: readonly StatoPerizia[] = [
  { valore: "si", etichetta: "C'e'" },
  { valore: "no", etichetta: "Manca", daSistemare: true },
];

export const SEZIONI_PERIZIA: readonly SezionePerizia[] = [
  {
    chiave: "documenti",
    titolo: "Documenti e dotazioni",
    // Quello che manca qui costa poco da annotare e molto da recuperare dopo:
    // una seconda chiave si paga centinaia di euro, e il libretto mancante
    // blocca il passaggio di proprieta'.
    spiegazione: "Quello che manca adesso lo si scopre al momento di rivendere, quando costa di piu'.",
    stati: STATI_PRESENZA,
    voci: [
      { chiave: "libretto", etichetta: "Libretto di circolazione" },
      { chiave: "certificato_proprieta", etichetta: "Certificato di proprieta'" },
      { chiave: "tagliandi", etichetta: "Libretto tagliandi e ricevute" },
      { chiave: "seconda_chiave", etichetta: "Seconda chiave" },
      { chiave: "ruotino", etichetta: "Ruotino o kit riparazione" },
      { chiave: "attrezzi", etichetta: "Cric e chiave ruote" },
      { chiave: "gomme_supplementari", etichetta: "Treno gomme supplementare" },
      { chiave: "manuale", etichetta: "Manuale d'uso" },
      { chiave: "cavo_ricarica", etichetta: "Cavo di ricarica (elettriche e ibride)" },
    ],
  },
  {
    chiave: "carrozzeria",
    titolo: "Carrozzeria",
    spiegazione: "Pannello per pannello, girando intorno all'auto. Le note servono a dire dove.",
    stati: STATI_CARROZZERIA,
    voci: [
      { chiave: "cofano", etichetta: "Cofano" },
      { chiave: "tetto", etichetta: "Tetto" },
      { chiave: "portellone", etichetta: "Portellone o baule" },
      { chiave: "paraurti_ant", etichetta: "Paraurti anteriore" },
      { chiave: "paraurti_post", etichetta: "Paraurti posteriore" },
      { chiave: "parafango_ant_sx", etichetta: "Parafango anteriore sinistro" },
      { chiave: "parafango_ant_dx", etichetta: "Parafango anteriore destro" },
      { chiave: "fiancata_post_sx", etichetta: "Fiancata posteriore sinistra" },
      { chiave: "fiancata_post_dx", etichetta: "Fiancata posteriore destra" },
      { chiave: "portiera_ant_sx", etichetta: "Portiera anteriore sinistra" },
      { chiave: "portiera_ant_dx", etichetta: "Portiera anteriore destra" },
      { chiave: "portiera_post_sx", etichetta: "Portiera posteriore sinistra" },
      { chiave: "portiera_post_dx", etichetta: "Portiera posteriore destra" },
      { chiave: "sottoporta", etichetta: "Sottoporta e montanti" },
    ],
  },
  {
    chiave: "cristalli",
    titolo: "Cristalli, fari e specchi",
    stati: STATI_CRISTALLI,
    voci: [
      { chiave: "parabrezza", etichetta: "Parabrezza" },
      { chiave: "lunotto", etichetta: "Lunotto" },
      { chiave: "vetri_laterali", etichetta: "Vetri laterali" },
      { chiave: "fari_ant", etichetta: "Fari anteriori" },
      { chiave: "fanali_post", etichetta: "Fanali posteriori" },
      { chiave: "specchietti", etichetta: "Specchietti retrovisori" },
    ],
  },
  {
    chiave: "interni",
    titolo: "Interni",
    spiegazione: "L'odore di fumo e' la voce che i periti dimenticano piu' spesso, e la piu' cara da togliere.",
    stati: STATI_USURA,
    voci: [
      { chiave: "sedili_ant", etichetta: "Sedili anteriori" },
      { chiave: "sedili_post", etichetta: "Sedili posteriori" },
      { chiave: "plancia", etichetta: "Plancia e comandi" },
      { chiave: "cielo", etichetta: "Cielo" },
      { chiave: "pannelli_porte", etichetta: "Pannelli porte" },
      { chiave: "tappetini", etichetta: "Tappetini e bagagliaio" },
      { chiave: "odori", etichetta: "Odori (fumo, animali, umidita')" },
    ],
  },
  {
    chiave: "meccanica",
    titolo: "Meccanica e prova su strada",
    spiegazione: "Da compilare dopo aver acceso a freddo e aver fatto almeno qualche chilometro.",
    stati: STATI_FUNZIONAMENTO,
    voci: [
      { chiave: "avviamento", etichetta: "Avviamento a freddo" },
      { chiave: "motore", etichetta: "Motore (rumori, fumi, perdite)" },
      { chiave: "cambio", etichetta: "Cambio" },
      { chiave: "frizione", etichetta: "Frizione" },
      { chiave: "freni", etichetta: "Freni" },
      { chiave: "sospensioni", etichetta: "Sospensioni e ammortizzatori" },
      { chiave: "sterzo", etichetta: "Sterzo e allineamento" },
      { chiave: "clima", etichetta: "Climatizzatore" },
      { chiave: "trazione", etichetta: "Trazione integrale o ridotte" },
    ],
  },
  {
    chiave: "elettronica",
    titolo: "Elettronica",
    stati: STATI_FUNZIONAMENTO,
    voci: [
      { chiave: "spie", etichetta: "Spie sul cruscotto" },
      { chiave: "infotainment", etichetta: "Radio e navigatore" },
      { chiave: "sensori", etichetta: "Sensori di parcheggio" },
      { chiave: "telecamera", etichetta: "Telecamera" },
      { chiave: "alzacristalli", etichetta: "Alzacristalli" },
      { chiave: "chiusura", etichetta: "Chiusura centralizzata" },
      { chiave: "batteria", etichetta: "Batteria e ricarica" },
    ],
  },
];

/** Le quattro ruote, che si annotano con misura e millimetri invece che con uno stato. */
export const RUOTE: readonly VocePerizia[] = [
  { chiave: "ant_sx", etichetta: "Anteriore sinistra" },
  { chiave: "ant_dx", etichetta: "Anteriore destra" },
  { chiave: "post_sx", etichetta: "Posteriore sinistra" },
  { chiave: "post_dx", etichetta: "Posteriore destra" },
];

/**
 * Sotto questa soglia il pneumatico e' da cambiare.
 *
 * Il limite di legge e' 1,6 mm, ma un'auto che va in vendita con 2 mm li
 * consuma nelle mani del cliente: la perizia segnala prima, perche' e' un
 * costo da mettere nel conto dell'acquisto, non una contravvenzione.
 */
export const MILLIMETRI_MINIMI_BATTISTRADA = 3;

export type RilievoVoce = { stato?: string; nota?: string };
export type RilievoRuota = { marca?: string; misura?: string; mm?: number | null };

export type RilievoPerizia = {
  sezioni?: Record<string, Record<string, RilievoVoce>>;
  note?: Record<string, string>;
  ruote?: Record<string, RilievoRuota>;
};

/**
 * Legge il rilievo salvato senza fidarsi della sua forma.
 *
 * Quello che torna dal database e' un documento libero: una perizia salvata
 * mesi fa puo' avere voci che non esistono piu', o non averne di nuove. Si
 * legge quello che c'e' e si ignora il resto, invece di rompersi.
 */
export function leggiRilievo(grezzo: unknown): RilievoPerizia {
  if (!grezzo || typeof grezzo !== "object") return {};
  const documento = grezzo as Record<string, unknown>;

  const sezioni: Record<string, Record<string, RilievoVoce>> = {};
  const daDocumento = documento.sezioni;

  if (daDocumento && typeof daDocumento === "object") {
    for (const [sezione, voci] of Object.entries(daDocumento as Record<string, unknown>)) {
      if (!voci || typeof voci !== "object") continue;
      const dentro: Record<string, RilievoVoce> = {};

      for (const [voce, valore] of Object.entries(voci as Record<string, unknown>)) {
        if (!valore || typeof valore !== "object") continue;
        const v = valore as Record<string, unknown>;
        dentro[voce] = {
          stato: typeof v.stato === "string" ? v.stato : undefined,
          nota: typeof v.nota === "string" ? v.nota : undefined,
        };
      }

      sezioni[sezione] = dentro;
    }
  }

  const note: Record<string, string> = {};
  if (documento.note && typeof documento.note === "object") {
    for (const [sezione, testo] of Object.entries(documento.note as Record<string, unknown>)) {
      if (typeof testo === "string" && testo.trim()) note[sezione] = testo;
    }
  }

  const ruote: Record<string, RilievoRuota> = {};
  if (documento.ruote && typeof documento.ruote === "object") {
    for (const [ruota, valore] of Object.entries(documento.ruote as Record<string, unknown>)) {
      if (!valore || typeof valore !== "object") continue;
      const r = valore as Record<string, unknown>;
      const mm = typeof r.mm === "number" && Number.isFinite(r.mm) ? r.mm : null;
      ruote[ruota] = {
        marca: typeof r.marca === "string" ? r.marca : undefined,
        misura: typeof r.misura === "string" ? r.misura : undefined,
        mm,
      };
    }
  }

  return { sezioni, note, ruote };
}

/** L'etichetta di uno stato, per la stampa e per il riepilogo. */
export function etichettaStato(sezione: SezionePerizia, valore: string | undefined) {
  return sezione.stati.find((stato) => stato.valore === valore)?.etichetta ?? null;
}

/**
 * Quante voci ha guardato il perito, e quante ne ha trovate da sistemare.
 *
 * Serve a due cose: dire in cima alla perizia "43 voci su 51" -- cosi' si sa
 * se e' finita o lasciata a meta' -- e a mettere in fila i difetti da cui
 * nasce il preventivo di rimessa a nuovo. **Non si inventa niente:** una voce
 * non compilata non e' "a posto", e conta come non guardata.
 */
export function riepilogoPerizia(rilievo: RilievoPerizia) {
  let vociTotali = 0;
  let vociCompilate = 0;
  const daSistemare: { sezione: string; voce: string; stato: string; nota?: string }[] = [];

  for (const sezione of SEZIONI_PERIZIA) {
    for (const voce of sezione.voci) {
      vociTotali += 1;
      const scelto = rilievo.sezioni?.[sezione.chiave]?.[voce.chiave];
      if (!scelto?.stato) continue;

      vociCompilate += 1;
      const stato = sezione.stati.find((s) => s.valore === scelto.stato);
      if (stato?.daSistemare) {
        daSistemare.push({
          sezione: sezione.titolo,
          voce: voce.etichetta,
          stato: stato.etichetta,
          nota: scelto.nota,
        });
      }
    }
  }

  // Un pneumatico sotto la soglia e' un difetto come gli altri, e va nello
  // stesso elenco: altrimenti resterebbe un numero in fondo alla pagina.
  for (const ruota of RUOTE) {
    const misurato = rilievo.ruote?.[ruota.chiave];
    if (typeof misurato?.mm === "number" && misurato.mm < MILLIMETRI_MINIMI_BATTISTRADA) {
      daSistemare.push({
        sezione: "Pneumatici",
        voce: ruota.etichetta,
        stato: `${misurato.mm} mm di battistrada`,
      });
    }
  }

  return { vociTotali, vociCompilate, daSistemare };
}

/** Il titolo di una perizia quando la vettura non ha ancora un nome completo. */
export function titoloPerizia(perizia: { brand?: string | null; model?: string | null; plate?: string | null }) {
  const nome = [perizia.brand, perizia.model].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ");
  const targa = String(perizia.plate ?? "").trim().toUpperCase();

  if (nome && targa) return `${nome} — ${targa}`;
  if (nome) return nome;
  if (targa) return targa;
  return "Perizia senza vettura";
}

/**
 * I filtri della ricerca, ripuliti prima di diventare un'interrogazione.
 *
 * Chiesta dal titolare il 03/09/2026: cerca per periodo, nome di chi vende,
 * marca e modello. Vive qui e non dentro la schermata perche' la ripulitura
 * ha due regole che vale la pena provare senza aprire una pagina.
 */
export type FiltriPerizia = {
  dal?: string;
  al?: string;
  cliente?: string;
  marca?: string;
  modello?: string;
};

function testoPulito(valore: string | null | undefined) {
  const pulito = String(valore ?? "").trim();
  return pulito.length > 0 ? pulito : undefined;
}

/**
 * Ripulisce quello che e' stato scritto nei campi di ricerca.
 *
 * Due regole, tutte e due nate da come si compila davvero un modulo:
 *
 * 1. **Un campo vuoto non e' un filtro.** Uno spazio battuto per sbaglio
 *    restringerebbe la ricerca a niente, e chi cerca vedrebbe un elenco vuoto
 *    senza capire perche'.
 * 2. **Le date al contrario si raddrizzano.** Scrivere il "dal" piu' avanti
 *    dell'"al" e' un errore di battitura frequente, e la risposta onesta a un
 *    intervallo impossibile sarebbe zero risultati: qui invece si scambiano,
 *    perche' quello che l'utente intendeva e' evidente.
 */
export function normalizzaFiltriPerizia(grezzi: {
  dal?: string | null;
  al?: string | null;
  cliente?: string | null;
  marca?: string | null;
  modello?: string | null;
}): FiltriPerizia {
  let dal = testoPulito(grezzi.dal);
  let al = testoPulito(grezzi.al);

  if (dal && al && dal > al) {
    [dal, al] = [al, dal];
  }

  return {
    dal,
    al,
    cliente: testoPulito(grezzi.cliente),
    marca: testoPulito(grezzi.marca),
    modello: testoPulito(grezzi.modello),
  };
}

/** Vero se e' stato scritto almeno un filtro: serve a distinguere "non hai ancora fatto perizie" da "nessun risultato". */
export function ricercaInCorso(filtri: FiltriPerizia) {
  return Object.values(filtri).some((valore) => valore !== undefined);
}

/**
 * Riesportata perche' la ricerca delle perizie la usa: la funzione vive in
 * `src/lib/ricerca-testo.ts`, dove la trova anche l'archivio documenti.
 */
export { perRicercaParziale } from "@/lib/ricerca-testo";
