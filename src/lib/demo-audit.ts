import type { SupabaseClient } from "@supabase/supabase-js";

export type DemoAuditAction =
  | "demo.requested"
  | "demo.approved"
  | "demo.created"
  | "demo.user_linked"
  | "demo.invitation_sent"
  | "demo.limit_reached"
  | "demo.write_blocked"
  | "demo.expired"
  | "demo.converted"
  | "demo.revoked";

export async function createDemoAccessAuditEntry(
  supabase: SupabaseClient,
  input: {
    dealerId: string | null;
    actorProfileId?: string | null;
    action: DemoAuditAction;
    entityType?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  if (!supabase) {
    return false;
  }

  const { error } = await supabase.from("audit_logs").insert({
    dealer_id: input.dealerId,
    actor_profile_id: input.actorProfileId ?? null,
    actor_type: "user",
    action: input.action,
    entity_type: input.entityType ?? "dealer",
    entity_id: input.entityId ?? null,
    metadata_json: input.metadata ?? {},
    created_by: input.actorProfileId ?? null,
  });

  return !error;
}
