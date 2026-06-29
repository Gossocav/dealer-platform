import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStage = "nuovo" | "contattato" | "preventivo" | "trattativa" | "venduto" | "perso";

export type LeadPriority = "alta" | "media" | "bassa";

export type LeadRecord = {
  id: string;
  dealer_id: string | null;
  vehicle_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  source?: string | null;
  priority?: string | null;
  vehicle: LeadVehicleRelation | LeadVehicleRelation[] | null;
};

export type LeadVehicleRelation = {
  id: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | number | null;
  dealer_id?: string | null;
};

export type VehicleOptionRow = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | number | null;
};

export type LeadItem = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  vehicle: string;
  message: string;
  stage: LeadStage;
  priority: LeadPriority;
  source: string;
  requestDate: string;
};

export type LeadFilters = {
  query: string;
  stage: "all" | LeadStage;
  vehicle: string;
  source: "all" | string;
  priority: "all" | LeadPriority;
};

export type LeadKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
};

export type LeadColumnSupport = {
  source: boolean;
  priority: boolean;
};

export const leadStages: LeadStage[] = ["nuovo", "contattato", "preventivo", "trattativa", "venduto", "perso"];

export const leadStageLabels: Record<LeadStage, string> = {
  nuovo: "Nuovo",
  contattato: "Contattato",
  preventivo: "Preventivo",
  trattativa: "Trattativa",
  venduto: "Venduto",
  perso: "Perso",
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

const LEAD_FALLBACK_SOURCE = "marketplace";

export function isMissingColumnError(message: string | undefined, columnName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}

export function normalizeLeadStage(status: string | null | undefined): LeadStage {
  const value = String(status ?? "").trim().toLowerCase();

  if (value === "nuovo" || value === "created") return "nuovo";
  if (value === "contattato" || value === "contacted") return "contattato";
  if (value === "preventivo" || value === "quote") return "preventivo";
  if (value === "trattativa" || value === "appointment" || value === "negotiation") return "trattativa";
  if (value === "venduto" || value === "won") return "venduto";
  if (value === "perso" || value === "lost") return "perso";
  return "nuovo";
}

export function normalizeLeadPriority(priority: string | null | undefined): LeadPriority {
  const value = String(priority ?? "").trim().toLowerCase();
  if (value === "alta") return "alta";
  if (value === "bassa") return "bassa";
  return "media";
}

export function formatLeadDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function safeText(value: string | number | null | undefined, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeVehicleRelation(vehicle: LeadRecord["vehicle"]): LeadVehicleRelation | null {
  if (!vehicle) return null;
  if (Array.isArray(vehicle)) {
    return vehicle[0] ?? null;
  }
  return vehicle;
}

function buildVehicleLabel(vehicle: LeadVehicleRelation | null, fallbackMap: Map<string, string>, vehicleId: string | null): string {
  if (vehicle) {
    const label = [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).map((item) => String(item).trim()).join(" ");
    if (label) return label;
  }

  if (vehicleId) {
    const fromMap = fallbackMap.get(vehicleId);
    if (fromMap) return fromMap;
  }

  return "Veicolo non disponibile";
}

function buildCustomerName(firstName: string | null, lastName: string | null, email: string | null): string {
  const fullName = [firstName, lastName].filter(Boolean).map((part) => String(part).trim()).join(" ").trim();
  if (fullName) return fullName;
  if (email) return email;
  return "Lead senza nome";
}

export function leadOptionSets(list: LeadItem[]) {
  return {
    vehicles: Array.from(new Set(list.map((item) => item.vehicle))).sort((a, b) => a.localeCompare(b, "it-IT")),
    sources: Array.from(new Set(list.map((item) => item.source))).sort((a, b) => a.localeCompare(b, "it-IT")),
  };
}

export function filterLeads(list: LeadItem[], filters: LeadFilters): LeadItem[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return list.filter((lead) => {
    const searchable = `${lead.customerName} ${lead.email} ${lead.phone} ${lead.vehicle} ${lead.message}`.toLowerCase();
    const matchesQuery = terms.length === 0 || terms.every((term) => searchable.includes(term));
    const matchesStage = filters.stage === "all" || lead.stage === filters.stage;
    const matchesVehicle = filters.vehicle === "all" || lead.vehicle === filters.vehicle;
    const matchesSource = filters.source === "all" || lead.source === filters.source;
    const matchesPriority = filters.priority === "all" || lead.priority === filters.priority;

    return matchesQuery && matchesStage && matchesVehicle && matchesSource && matchesPriority;
  });
}

export function leadKpis(list: LeadItem[]): LeadKpi[] {
  const newLeads = list.filter((lead) => lead.stage === "nuovo").length;
  const toContact = list.filter((lead) => lead.stage === "nuovo" || lead.stage === "contattato").length;
  const openNegotiations = list.filter((lead) => lead.stage === "preventivo" || lead.stage === "trattativa").length;
  const sold = list.filter((lead) => lead.stage === "venduto").length;

  return [
    { id: "new", label: "Lead nuovi", value: String(newLeads), delta: "Ultime 24h" },
    { id: "to-contact", label: "Da contattare", value: String(toContact), delta: "Priorita operative" },
    { id: "open", label: "Trattative aperte", value: String(openNegotiations), delta: "Funnel attivo" },
    { id: "won", label: "Vendite concluse", value: String(sold), delta: "Questo mese" },
  ];
}

export function toLeadItems(rows: LeadRecord[], vehiclesById: Map<string, string>): LeadItem[] {
  return rows.map((row) => {
    const vehicleRelation = normalizeVehicleRelation(row.vehicle);
    const vehicleLabel = buildVehicleLabel(vehicleRelation, vehiclesById, row.vehicle_id);

    return {
      id: row.id,
      customerName: buildCustomerName(row.first_name, row.last_name, row.email),
      email: safeText(row.email),
      phone: safeText(row.phone),
      vehicle: vehicleLabel,
      message: safeText(row.message, "Nessun messaggio"),
      stage: normalizeLeadStage(row.status),
      priority: normalizeLeadPriority(row.priority),
      source: safeText(row.source, LEAD_FALLBACK_SOURCE),
      requestDate: String(row.created_at ?? new Date().toISOString()),
    };
  });
}

export function mapStageToDbStatus(stage: LeadStage): string {
  if (stage === "nuovo") return "nuovo";
  if (stage === "contattato") return "contattato";
  if (stage === "preventivo") return "preventivo";
  if (stage === "trattativa") return "trattativa";
  if (stage === "venduto") return "venduto";
  return "perso";
}

export async function detectLeadOptionalColumns(supabase: SupabaseClient<any, any, any>): Promise<LeadColumnSupport> {
  let support: LeadColumnSupport = { source: true, priority: true };

  for (let attempts = 0; attempts < 3; attempts += 1) {
    const columns = ["id", support.source ? "source" : null, support.priority ? "priority" : null]
      .filter(Boolean)
      .join(", ");

    const { error } = await supabase.from("leads").select(columns).limit(1);
    if (!error) return support;

    let changed = false;

    if (support.source && isMissingColumnError(error.message, "source")) {
      support = { ...support, source: false };
      changed = true;
    }

    if (support.priority && isMissingColumnError(error.message, "priority")) {
      support = { ...support, priority: false };
      changed = true;
    }

    if (!changed) {
      throw new Error(error.message || "Errore rilevamento colonne lead.");
    }
  }

  return support;
}

export function buildLeadSelectClause(support: LeadColumnSupport): string {
  const baseColumns = [
    "id",
    "dealer_id",
    "vehicle_id",
    "first_name",
    "last_name",
    "email",
    "phone",
    "message",
    "status",
    "created_at",
    "updated_at",
    support.source ? "source" : null,
    support.priority ? "priority" : null,
    "vehicle:vehicles(id, brand, model, version, year, dealer_id)",
  ].filter(Boolean);

  return baseColumns.join(", ");
}

export function vehicleLabelMap(rows: VehicleOptionRow[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const row of rows) {
    const label = [row.brand, row.model, row.version, row.year].filter(Boolean).map((item) => String(item).trim()).join(" ");
    map.set(row.id, label || "Veicolo non disponibile");
  }

  return map;
}
