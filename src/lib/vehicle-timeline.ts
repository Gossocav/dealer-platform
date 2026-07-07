import type { SupabaseClient } from "@supabase/supabase-js";

export type VehicleTimelineAction =
  | "vehicle.created"
  | "vehicle.updated"
  | "vehicle.status_changed"
  | "vehicle.published"
  | "vehicle.unpublished"
  | "vehicle.sold"
  | "vehicle.archived"
  | "vehicle.images_updated"
  | "vehicle.sent_to_client"
  | "vehicle.lead_received";

export type VehicleTimelineEvent = {
  id: string;
  action: VehicleTimelineAction;
  title: string;
  description: string;
  createdAt: string;
  actorType: "user" | "system" | "api";
  metadata: Record<string, unknown>;
};

type AuditLogInsert = {
  dealer_id: string;
  actor_profile_id: string | null;
  actor_type: "user" | "system" | "api";
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
};

type AuditLogRow = {
  id: string | null;
  action: string | null;
  actor_type: "user" | "system" | "api" | null;
  created_at: string | null;
  metadata_json: Record<string, unknown> | null;
};

export type WriteVehicleTimelineEventParams = {
  dealerId: string;
  vehicleId: string;
  action: VehicleTimelineAction;
  actorType?: "user" | "system" | "api";
  actorProfileId?: string | null;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export type BuildVehicleTimelineEventsParams = {
  auditEvents: VehicleTimelineEvent[];
  vehicleCreatedAt?: string | null;
  vehicleUpdatedAt?: string | null;
};

function normalizeAction(value: string | null | undefined): VehicleTimelineAction | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "vehicle.created") return "vehicle.created";
  if (normalized === "vehicle.updated") return "vehicle.updated";
  if (normalized === "vehicle.status_changed") return "vehicle.status_changed";
  if (normalized === "vehicle.published") return "vehicle.published";
  if (normalized === "vehicle.unpublished") return "vehicle.unpublished";
  if (normalized === "vehicle.sold") return "vehicle.sold";
  if (normalized === "vehicle.archived") return "vehicle.archived";
  if (normalized === "vehicle.images_updated") return "vehicle.images_updated";
  if (normalized === "vehicle.sent_to_client") return "vehicle.sent_to_client";
  if (normalized === "vehicle.lead_received") return "vehicle.lead_received";

  return null;
}

function normalizeIsoDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function getActionTitle(action: VehicleTimelineAction) {
  if (action === "vehicle.created") return "Veicolo creato";
  if (action === "vehicle.updated") return "Veicolo modificato";
  if (action === "vehicle.status_changed") return "Stato modificato";
  if (action === "vehicle.published") return "Veicolo pubblicato";
  if (action === "vehicle.unpublished") return "Veicolo non pubblicato";
  if (action === "vehicle.sold") return "Veicolo venduto";
  if (action === "vehicle.archived") return "Veicolo archiviato";
  if (action === "vehicle.images_updated") return "Immagini aggiornate";
  if (action === "vehicle.sent_to_client") return "Inviato a cliente";
  return "Lead ricevuto";
}

function getActionDescription(action: VehicleTimelineAction, metadata: Record<string, unknown>) {
  if (action === "vehicle.status_changed") {
    const fromState = String(metadata.fromStatus ?? "").trim();
    const toState = String(metadata.toStatus ?? "").trim();
    if (fromState && toState) {
      return `Transizione stato: ${fromState} -> ${toState}.`;
    }

    return "Lo stato del veicolo è stato aggiornato.";
  }

  if (action === "vehicle.images_updated") {
    const count = Number(metadata.imagesCount ?? 0);
    if (Number.isFinite(count) && count > 0) {
      return `Aggiornate ${count} immagini del veicolo.`;
    }

    return "La galleria immagini del veicolo è stata aggiornata.";
  }

  if (action === "vehicle.sent_to_client") {
    const recipient = String(metadata.recipientEmail ?? "").trim();
    if (recipient) {
      return `Veicolo inviato via email a ${recipient}.`;
    }

    return "Veicolo inviato a cliente.";
  }

  if (action === "vehicle.lead_received") {
    const source = String(metadata.source ?? "marketplace").trim();
    return `Nuovo lead ricevuto (${source}).`;
  }

  if (action === "vehicle.updated") {
    return "Dati veicolo aggiornati.";
  }

  if (action === "vehicle.created") {
    return "Nuovo veicolo inserito in inventory.";
  }

  if (action === "vehicle.published") {
    return "Il veicolo è ora visibile ai canali di pubblicazione.";
  }

  if (action === "vehicle.unpublished") {
    return "Il veicolo è stato rimosso dai canali di pubblicazione.";
  }

  if (action === "vehicle.sold") {
    return "Il veicolo è stato marcato come venduto.";
  }

  return "Il veicolo è stato spostato in archivio.";
}

function isMissingRelationError(message: string | undefined, relationName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(relationName.toLowerCase()) && (text.includes("relation") || text.includes("does not exist"));
}

function mapAuditRowToTimelineEvent(row: AuditLogRow): VehicleTimelineEvent | null {
  const action = normalizeAction(row.action);
  if (!action) {
    return null;
  }

  const createdAt = normalizeIsoDate(row.created_at) ?? new Date().toISOString();
  const metadata = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};

  return {
    id: String(row.id ?? `${action}-${createdAt}`),
    action,
    title: getActionTitle(action),
    description: getActionDescription(action, metadata),
    createdAt,
    actorType: row.actor_type ?? "user",
    metadata,
  };
}

export function buildVehicleTimelineEvents(params: BuildVehicleTimelineEventsParams): VehicleTimelineEvent[] {
  const events = [...params.auditEvents];
  const createdAt = normalizeIsoDate(params.vehicleCreatedAt);
  const updatedAt = normalizeIsoDate(params.vehicleUpdatedAt);

  const hasCreatedEvent = events.some((event) => event.action === "vehicle.created");
  if (!hasCreatedEvent && createdAt) {
    events.push({
      id: `synthetic-created-${createdAt}`,
      action: "vehicle.created",
      title: getActionTitle("vehicle.created"),
      description: getActionDescription("vehicle.created", {}),
      createdAt,
      actorType: "system",
      metadata: { synthetic: true },
    });
  }

  const hasUpdatedEvent = events.some((event) => event.action === "vehicle.updated");
  if (!hasUpdatedEvent && updatedAt && updatedAt !== createdAt) {
    events.push({
      id: `synthetic-updated-${updatedAt}`,
      action: "vehicle.updated",
      title: getActionTitle("vehicle.updated"),
      description: getActionDescription("vehicle.updated", {}),
      createdAt: updatedAt,
      actorType: "system",
      metadata: { synthetic: true },
    });
  }

  if (events.length === 0) {
    return [
      {
        id: "timeline-empty",
        action: "vehicle.updated",
        title: "Timeline non disponibile",
        description: "Nessun evento timeline disponibile per questo veicolo.",
        createdAt: new Date().toISOString(),
        actorType: "system",
        metadata: { empty: true },
      },
    ];
  }

  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listVehicleTimelineAuditEvents(
  supabase: SupabaseClient,
  dealerId: string,
  vehicleId: string,
  limit = 80
): Promise<VehicleTimelineEvent[]> {
  const result = await supabase
    .from("audit_logs")
    .select("id, action, actor_type, created_at, metadata_json")
    .eq("dealer_id", dealerId)
    .eq("entity_type", "vehicle")
    .eq("entity_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<AuditLogRow[]>();

  if (result.error) {
    if (isMissingRelationError(result.error.message, "audit_logs")) {
      return [];
    }

    return [];
  }

  return (result.data ?? []).map(mapAuditRowToTimelineEvent).filter((item): item is VehicleTimelineEvent => Boolean(item));
}

export async function writeVehicleTimelineEvent(supabase: SupabaseClient, params: WriteVehicleTimelineEventParams) {
  const event: AuditLogInsert = {
    dealer_id: params.dealerId,
    actor_profile_id: params.actorProfileId ?? null,
    actor_type: params.actorType ?? "user",
    action: params.action,
    entity_type: "vehicle",
    entity_id: params.vehicleId,
    before_json: params.before ?? null,
    after_json: params.after ?? null,
    metadata_json: {
      vehicleId: params.vehicleId,
      ...(params.metadata ?? {}),
    },
    created_by: params.actorProfileId ?? null,
  };

  const { error } = await supabase.from("audit_logs").insert(event);
  if (error) {
    if (isMissingRelationError(error.message, "audit_logs")) {
      return false;
    }

    return false;
  }

  return true;
}
