export type LeadStage = "new" | "contacted" | "quote" | "negotiation" | "won" | "lost";

export type LeadPriority = "alta" | "media" | "bassa";

export type LeadSource = "Marketplace" | "Sito Web" | "Telefonata" | "Referral" | "Campagna Meta";

export type LeadItem = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  vehicle: string;
  message: string;
  stage: LeadStage;
  priority: LeadPriority;
  source: LeadSource;
  requestDate: string;
};

export type LeadFilters = {
  query: string;
  stage: "all" | LeadStage;
  vehicle: string;
  source: "all" | LeadSource;
  priority: "all" | LeadPriority;
};

export type LeadKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
};

export const leadStages = ["new", "contacted", "quote", "negotiation", "won", "lost"] as const;

export const leadStageLabels: Record<LeadStage, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  quote: "Preventivo",
  negotiation: "Trattativa",
  won: "Venduto",
  lost: "Perso",
};

export const leadPriorityLabels: Record<LeadPriority, string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};

export const defaultLeadFilters: LeadFilters = {
  query: "",
  stage: "all",
  vehicle: "all",
  source: "all",
  priority: "all",
};

export const leadsMock: LeadItem[] = [
  {
    id: "ld-001",
    customerName: "Marco Rinaldi",
    email: "marco.rinaldi@email.it",
    phone: "+39 347 1122334",
    vehicle: "Audi A4 Avant 40 TDI",
    message: "Interessato a finanziamento con anticipo ridotto.",
    stage: "new",
    priority: "alta",
    source: "Marketplace",
    requestDate: "2026-06-28T10:20:00.000Z",
  },
  {
    id: "ld-002",
    customerName: "Giulia Serra",
    email: "g.serra@email.it",
    phone: "+39 348 5531220",
    vehicle: "BMW X1 sDrive18i",
    message: "Vorrei prenotare test drive in settimana.",
    stage: "contacted",
    priority: "alta",
    source: "Sito Web",
    requestDate: "2026-06-27T15:40:00.000Z",
  },
  {
    id: "ld-003",
    customerName: "Luca Fabbri",
    email: "luca.fabbri@email.it",
    phone: "+39 331 8899001",
    vehicle: "Tesla Model 3 Long Range",
    message: "Chiedo valutazione usato in permuta.",
    stage: "quote",
    priority: "media",
    source: "Marketplace",
    requestDate: "2026-06-26T11:05:00.000Z",
  },
  {
    id: "ld-004",
    customerName: "Francesca Doria",
    email: "francesca.doria@email.it",
    phone: "+39 349 2003300",
    vehicle: "Volvo XC40 B4",
    message: "Cerco consegna entro 30 giorni.",
    stage: "negotiation",
    priority: "alta",
    source: "Referral",
    requestDate: "2026-06-25T09:10:00.000Z",
  },
  {
    id: "ld-005",
    customerName: "Andrea Neri",
    email: "andrea.neri@email.it",
    phone: "+39 333 4522119",
    vehicle: "Toyota C-HR Hybrid",
    message: "Preferisco pagamento in soluzione unica.",
    stage: "won",
    priority: "media",
    source: "Telefonata",
    requestDate: "2026-06-23T13:15:00.000Z",
  },
  {
    id: "ld-006",
    customerName: "Sara Bellini",
    email: "sara.bellini@email.it",
    phone: "+39 345 9988776",
    vehicle: "Volkswagen Golf eTSI",
    message: "Attendo foto aggiuntive interni e bagagliaio.",
    stage: "lost",
    priority: "bassa",
    source: "Campagna Meta",
    requestDate: "2026-06-21T08:45:00.000Z",
  },
  {
    id: "ld-007",
    customerName: "Paolo Messina",
    email: "paolo.messina@email.it",
    phone: "+39 340 7441122",
    vehicle: "Mercedes GLA 200 d",
    message: "Richiesta preventivo leasing aziendale.",
    stage: "new",
    priority: "media",
    source: "Marketplace",
    requestDate: "2026-06-28T16:55:00.000Z",
  },
  {
    id: "ld-008",
    customerName: "Elena Conti",
    email: "elena.conti@email.it",
    phone: "+39 392 1004433",
    vehicle: "Jeep Compass 1.3 Turbo",
    message: "Valuto acquisto entro due settimane.",
    stage: "contacted",
    priority: "media",
    source: "Sito Web",
    requestDate: "2026-06-24T17:20:00.000Z",
  },
  {
    id: "ld-009",
    customerName: "Davide Piras",
    email: "davide.piras@email.it",
    phone: "+39 338 7012456",
    vehicle: "Mini Countryman Cooper S",
    message: "Vorrei confronto con altre versioni disponibili.",
    stage: "quote",
    priority: "bassa",
    source: "Referral",
    requestDate: "2026-06-22T14:32:00.000Z",
  },
  {
    id: "ld-010",
    customerName: "Chiara Bianco",
    email: "chiara.bianco@email.it",
    phone: "+39 346 6219900",
    vehicle: "Peugeot 3008 BlueHDi",
    message: "Possibile appuntamento sabato mattina?",
    stage: "negotiation",
    priority: "alta",
    source: "Marketplace",
    requestDate: "2026-06-27T12:12:00.000Z",
  },
  {
    id: "ld-011",
    customerName: "Matteo Villa",
    email: "matteo.villa@email.it",
    phone: "+39 334 8733300",
    vehicle: "Renault Clio TCe 90",
    message: "Interessato per uso neopatentato, budget limitato.",
    stage: "won",
    priority: "bassa",
    source: "Telefonata",
    requestDate: "2026-06-20T10:02:00.000Z",
  },
  {
    id: "ld-012",
    customerName: "Valentina Grassi",
    email: "valentina.grassi@email.it",
    phone: "+39 320 5599887",
    vehicle: "Ford Kuga Plug-In Hybrid",
    message: "Interesse calato per tempi di consegna lunghi.",
    stage: "lost",
    priority: "media",
    source: "Campagna Meta",
    requestDate: "2026-06-19T18:05:00.000Z",
  },
];

export function formatLeadDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function leadOptionSets(list: LeadItem[]) {
  return {
    vehicles: Array.from(new Set(list.map((item) => item.vehicle))).sort(),
    sources: Array.from(new Set(list.map((item) => item.source))).sort(),
  };
}

export function filterLeads(list: LeadItem[], filters: LeadFilters): LeadItem[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return list.filter((lead) => {
    const searchable = `${lead.customerName} ${lead.email} ${lead.phone} ${lead.vehicle} ${lead.message}`.toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesStage = filters.stage === "all" || lead.stage === filters.stage;
    const matchesVehicle = filters.vehicle === "all" || lead.vehicle === filters.vehicle;
    const matchesSource = filters.source === "all" || lead.source === filters.source;
    const matchesPriority = filters.priority === "all" || lead.priority === filters.priority;

    return matchesQuery && matchesStage && matchesVehicle && matchesSource && matchesPriority;
  });
}

export function leadKpis(list: LeadItem[]): LeadKpi[] {
  const newLeads = list.filter((lead) => lead.stage === "new").length;
  const toContact = list.filter((lead) => lead.stage === "new" || lead.stage === "contacted").length;
  const openNegotiations = list.filter((lead) => lead.stage === "quote" || lead.stage === "negotiation").length;
  const sold = list.filter((lead) => lead.stage === "won").length;

  return [
    { id: "new", label: "Lead nuovi", value: String(newLeads), delta: "Ultime 24h" },
    { id: "to-contact", label: "Da contattare", value: String(toContact), delta: "Priorita operative" },
    { id: "open", label: "Trattative aperte", value: String(openNegotiations), delta: "Funnel attivo" },
    { id: "won", label: "Vendite concluse", value: String(sold), delta: "Questo mese" },
  ];
}
