export type DemoPlanCode = "base" | "pro" | "elite";

export type DemoPlan = {
  code: DemoPlanCode;
  name: string;
  priceMonthly: number | null;
  description: string;
  includedServices: string[];
  marketingNote?: string;
};

export const DEMO_PLAN_CATALOG: DemoPlan[] = [
  {
    code: "base",
    name: "KeyAuto Base",
    priceMonthly: null,
    description: "Soluzione essenziale per il flusso operativo base della concessionaria.",
    includedServices: ["Accesso alla piattaforma", "Supporto operativo", "Pubblicazione veicoli"],
  },
  {
    code: "pro",
    name: "KeyAuto Pro",
    priceMonthly: null,
    description: "Soluzione evoluta per concessionarie con volumi maggiori.",
    includedServices: ["Accesso alla piattaforma", "Funzioni avanzate", "Supporto prioritario"],
  },
  {
    code: "elite",
    name: "KeyAuto Elite",
    priceMonthly: 699,
    description: "Tutte le funzionalità del piano Pro, con in più i servizi di visibilità social e la gestione della pubblicità online.",
    includedServices: [
      "Annunci veicolo attivi illimitati",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario avanzata",
      "CRM Lead avanzato",
      "Statistiche e KPI dettagliati",
      "Esportazione dati",
      "Supporto prioritario",
      "Maggiore visibilità sulla piattaforma",
      "Visibilità sui social ufficiali KeyAuto",
      "Gestione campagna Google Ads",
      "Report mensile delle performance marketing",
    ],
    marketingNote:
      "La gestione della campagna Google Ads è inclusa. Il budget pubblicitario non è incluso nel canone di € 699/mese, viene concordato con il cliente ed è sostenuto direttamente dal cliente.",
  },
];

const DEMO_PLAN_BY_CODE = new Map(DEMO_PLAN_CATALOG.map((plan) => [plan.code, plan]));

export function normalizeDemoPlanCode(value: unknown): DemoPlanCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "base" || normalized === "pro" || normalized === "elite" ? normalized : null;
}

export function getDemoPlan(code: unknown): DemoPlan | null {
  const normalized = normalizeDemoPlanCode(code);
  return normalized ? (DEMO_PLAN_BY_CODE.get(normalized) ?? null) : null;
}
