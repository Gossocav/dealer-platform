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
    description: "Tutte le funzionalità del piano Pro, con in più il doppio degli annunci pubblicabili, la promozione sui canali social ufficiali e la scheda consegna da dare al cliente.",
    includedServices: [
      "Fino a 300 annunci veicolo attivi",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario avanzata",
      "CRM Lead avanzato",
      "Scheda consegna veicolo",
      "Statistiche e KPI dettagliati",
      "Esportazione dati",
      "Supporto prioritario",
      "Maggiore visibilità sulla piattaforma",
      "Visibilità sui social ufficiali KeyAuto",
    ],
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
