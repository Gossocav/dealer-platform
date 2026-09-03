/**
 * I tre piani: prezzo, e cosa comprende ciascuno.
 *
 * **Questo file e' la sorgente unica.** Fino al 01/09/2026 gli elenchi erano
 * scritti a mano in cinque posti -- qui, le tre pagine di registrazione, la
 * pagina abbonamento e "per le concessionarie" -- e avevano gia' divaricato:
 * Pro ed Elite promettevano "Esportazione dati", che non esiste; il Pro
 * prometteva "Maggiore visibilita' sulla piattaforma", che esiste solo come
 * vetrina Elite; tutti e due promettevano "CRM Lead avanzato" e una "Dashboard
 * avanzata" che nel codice non si distinguono da quelle del Base. Nessuno
 * aveva ancora comprato, quindi non e' stata una promessa tradita -- ma una
 * riga di elenco che non corrisponde a niente e' un debito che si paga al
 * primo cliente.
 *
 * Da qui in avanti le pagine leggono di qui. Una funzione che non c'e' non si
 * puo' promettere in una pagina sola: o e' in questo file, o non si vende.
 *
 * **Il criterio della divisione** non e' quante auto hai, ma cosa ci fai:
 *
 * - **Base, la vetrina** -- farsi trovare. Pubblicare, ricevere richieste,
 *   tenere i clienti. Niente soldi: il conto economico e' un'altra categoria
 *   di prodotto.
 * - **Pro, la gestione** -- sapere quanto guadagni. E' il salto che si vende
 *   da solo: se il conto economico fa scoprire una sola vettura comprata male
 *   in un anno, il piano si e' ripagato molte volte.
 * - **Elite, la crescita** -- vendere di piu'. Visibilita' e strumenti verso
 *   il cliente finale, non rendicontazione.
 *
 * **I prezzi sono quelli di lancio.** Il marketplace non porta ancora
 * contatti: finche' non li porta, questi piani valgono per quello che fanno
 * dentro la concessionaria, e sono prezzati contro i gestionali, non contro i
 * portali. Salgono quando la vetrina produce contatti misurabili, e chi entra
 * adesso tiene il prezzo di lancio.
 */

export type DemoPlanCode = "base" | "pro" | "elite";

export type DemoPlanService = {
  title: string;
  description: string;
  /**
   * Alcune voci **sostituiscono** quella del piano sotto invece di
   * aggiungersi: la capienza e il livello di supporto. Un piano ha una
   * capienza sola, e "Fino a 150 annunci" non convive con "Fino a 50".
   *
   * Il difetto che questo campo chiude, visto dal titolare il 01/09/2026 sulle
   * pagine vere: il Pro elencava sia 50 sia 150 annunci, l'Elite tutti e tre,
   * e "Supporto via e-mail" restava accanto a "Supporto prioritario". Chi
   * legge si ferma alla prima riga, e la prima riga diceva 50.
   */
  slot?: "capienza" | "supporto";
};

export type DemoPlan = {
  code: DemoPlanCode;
  name: string;
  priceMonthly: number;
  description: string;
  /** Cosa aggiunge questo piano rispetto a quello sotto. */
  servicesOwn: DemoPlanService[];
  /** Tutto quello che comprende, ereditato compreso: e' l'elenco da mostrare. */
  services: DemoPlanService[];
  /** Gli stessi titoli, per chi ha bisogno solo dei nomi. */
  includedServices: string[];
  /** Il piano da cui eredita, se c'e'. */
  inherits: DemoPlanCode | null;
  marketingNote?: string;
};

const BASE_SERVICES: DemoPlanService[] = [
  {
    slot: "capienza",
    title: "Fino a 50 annunci veicolo attivi",
    description:
      "Pubblica uno stock selezionato e sempre aggiornato, dando priorita ai veicoli con maggiore potenziale commerciale senza sovraccaricare la gestione quotidiana.",
  },
  {
    title: "Gestione completa delle schede veicolo",
    description:
      "Organizza foto, dati tecnici, optional e descrizioni in modo uniforme, migliorando la qualita degli annunci e la fiducia dei clienti interessati.",
  },
  {
    title: "Ricezione e gestione dei lead",
    description:
      "Raccogli le richieste dei clienti interessati e gestiscile con ordine, riducendo i tempi di risposta e aumentando le opportunita di appuntamento.",
  },
  {
    title: "Clienti e appuntamenti",
    description:
      "Tieni la rubrica dei clienti e l'agenda degli appuntamenti dentro la stessa piattaforma dove stanno le vetture, senza rincorrere fogli e messaggi sparsi.",
  },
  {
    title: "Email ai clienti dalla piattaforma",
    description:
      "Scrivi al cliente e mandagli la scheda di una vettura senza uscire dal gestionale, con la conversazione che resta agganciata alla sua richiesta.",
  },
  {
    title: "Importazione dello stock",
    description:
      "Carica il parco auto da un file Excel o CSV, oppure lascialo leggere dal sito della concessionaria: le vetture entrano gia' compilate.",
  },
  {
    title: "Archivio documenti delle vetture",
    description:
      "Libretto, contratti, preventivi e fatture archiviati sulla scheda di ogni vettura, con la ricerca per targa, tipo e periodo. Restano anche dopo che l'auto e' stata venduta.",
  },
  {
    title: "Dashboard concessionario",
    description:
      "Vedi da un unico pannello le attivita principali della concessionaria: quante vetture hai, quante richieste sono arrivate, cosa c'e' in agenda.",
  },
  {
    slot: "supporto",
    title: "Supporto via e-mail",
    description:
      "Ricevi assistenza operativa per dubbi e configurazioni, cosi da lavorare con continuita e risolvere rapidamente eventuali blocchi.",
  },
];

const PRO_SERVICES: DemoPlanService[] = [
  {
    slot: "capienza",
    title: "Fino a 150 annunci veicolo attivi",
    description:
      "Il triplo della capienza del Base, per tenere online tutto il piazzale senza dover scegliere quali vetture lasciare fuori.",
  },
  {
    title: "Conto economico di ogni vettura",
    description:
      "Scrivi quanto l'hai pagata e quanto ti e' costata voce per voce -- minivoltura, trasporto, carrozzeria, officina, gommista, preparazione, ricambi, provvigione -- e vedi il margine vero quando la vendi.",
  },
  {
    title: "Vendite mese per mese",
    description:
      "L'anno intero in una tabella: quanto hai venduto, quanto ti e' costato e quanto ci hai guadagnato, mese per mese, con l'elenco di ogni vettura venduta.",
  },
  {
    title: "Perizia della vettura prima di comprarla",
    description:
      "La scheda con cui controlli un'auto in permuta o dal privato: carrozzeria pannello per pannello, gomme misurate, meccanica, interni e documenti, con il conto di quanto costa rimetterla a posto. Resta salvata e si ristampa il giorno che il venditore contesta.",
  },
  {
    title: "Giorni di giacenza del parco",
    description:
      "Da quanto e' ferma ogni automobile, raccolte in fasce da 30 a oltre 150 giorni: si vede a colpo d'occhio su quali intervenire e quanto capitale e' fermo.",
  },
  {
    title: "Stampa dei conti economici",
    description:
      "Il conto di una vettura o quello dell'anno intero su un foglio A4, da tenere nel fascicolo o da portare al commercialista.",
  },
  {
    title: "Statistiche con i margini",
    description:
      "Il conto del mese dentro le statistiche: margine, marginalita e le vetture che hanno reso di piu e di meno.",
  },
  {
    slot: "supporto",
    title: "Supporto prioritario",
    description:
      "Le tue richieste passano davanti, con tempi di risposta piu brevi su configurazioni e problemi operativi.",
  },
];

const ELITE_SERVICES: DemoPlanService[] = [
  {
    slot: "capienza",
    title: "Fino a 300 annunci veicolo attivi",
    description:
      "La capienza massima della piattaforma, per le concessionarie che tengono online l'intero parco senza limiti pratici.",
  },
  {
    title: "Scheda consegna veicolo",
    description:
      "Il documento da stampare e far firmare al cliente al momento della consegna, con i dati della vettura e quelli dell'acquirente gia' compilati.",
  },
  {
    title: "Vetrina in evidenza sulla home di KeyAuto",
    description:
      "Una tua vettura in cima alla pagina principale, a rotazione fra le concessionarie Elite: il posto piu visto della piattaforma.",
  },
  {
    title: "Video dell'automobile sull'annuncio",
    description:
      "Incolla il collegamento a un video YouTube della vettura e il compratore lo guarda dentro la scheda, senza uscire dalla pagina: si vede l'automobile muoversi, non solo in fotografia.",
  },
  {
    title: "Visibilita sui social ufficiali KeyAuto",
    description:
      "Le tue vetture entrano nella programmazione dei canali social della piattaforma, davanti a un pubblico che non ti sta ancora cercando.",
  },
];

function componi(
  code: DemoPlanCode,
  name: string,
  priceMonthly: number,
  description: string,
  servicesOwn: DemoPlanService[],
  inherits: DemoPlanCode | null,
  ereditati: DemoPlanService[]
): DemoPlan {
  // Le voci con uno slot prendono il posto di quella ereditata con lo stesso
  // slot, invece di accodarsi: cosi' il Pro dice "fino a 150" e basta, dove
  // prima diceva "fino a 50" e poi, otto righe sotto, "fino a 150".
  const services = [...ereditati];
  for (const servizio of servicesOwn) {
    const posto = servizio.slot ? services.findIndex((v) => v.slot === servizio.slot) : -1;
    if (posto >= 0) services[posto] = servizio;
    else services.push(servizio);
  }
  return {
    code,
    name,
    priceMonthly,
    description,
    servicesOwn,
    services,
    includedServices: services.map((servizio) => servizio.title),
    inherits,
  };
}

const BASE = componi(
  "base",
  "KeyAuto Base",
  99,
  "La vetrina: pubblica il tuo parco auto, ricevi le richieste e tieni i clienti in ordine.",
  BASE_SERVICES,
  null,
  []
);

const PRO = componi(
  "pro",
  "KeyAuto Pro",
  199,
  "La gestione: tutto quello del Base, piu' il conto di quanto guadagni davvero su ogni automobile.",
  PRO_SERVICES,
  "base",
  BASE.services
);

const ELITE = componi(
  "elite",
  "KeyAuto Elite",
  399,
  "La crescita: tutto quello del Pro, piu' la visibilita' che porta clienti nuovi e la scheda consegna da dare a chi compra.",
  ELITE_SERVICES,
  "pro",
  PRO.services
);

export const DEMO_PLAN_CATALOG: DemoPlan[] = [BASE, PRO, ELITE];

const DEMO_PLAN_BY_CODE = new Map(DEMO_PLAN_CATALOG.map((plan) => [plan.code, plan]));

export function normalizeDemoPlanCode(value: unknown): DemoPlanCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "base" || normalized === "pro" || normalized === "elite" ? normalized : null;
}

export function getDemoPlan(code: unknown): DemoPlan | null {
  const normalized = normalizeDemoPlanCode(code);
  return normalized ? (DEMO_PLAN_BY_CODE.get(normalized) ?? null) : null;
}

/** "€199/mese", come si scrive su una pagina di vendita. */
export function formattaPrezzoPiano(plan: DemoPlan): string {
  return `€${plan.priceMonthly}/mese`;
}
