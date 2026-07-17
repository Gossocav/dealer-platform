import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildVehicleTimelineEvents,
  listVehicleTimelineAuditEvents,
  writeVehicleTimelineEvent,
  type VehicleTimelineEvent,
} from "./vehicle-timeline";

type MockResult = {
  data: unknown;
  error: { message?: string } | null;
};

function createSupabaseMockForInsert(onInsert: (payload: unknown) => void, result: MockResult) {
  const chain = {
    insert(payload: unknown) {
      onInsert(payload);
      return Promise.resolve(result);
    },
  };

  return {
    from() {
      return chain;
    },
  } as unknown as SupabaseClient;
}

function createSupabaseMockForSelect(result: MockResult) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    returns() {
      return Promise.resolve(result);
    },
  };

  return {
    from() {
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("vehicle-timeline", () => {
  it("creates a timeline event payload", async () => {
    let captured: unknown = null;
    const supabase = createSupabaseMockForInsert(
      (payload) => {
        captured = payload;
      },
      { data: null, error: null }
    );

    const ok = await writeVehicleTimelineEvent(supabase, {
      dealerId: "dealer-1",
      vehicleId: "vehicle-1",
      action: "vehicle.created",
      actorProfileId: "user-1",
      metadata: { source: "test" },
    });

    expect(ok).toBe(true);
    expect(captured).toMatchObject({
      dealer_id: "dealer-1",
      entity_type: "vehicle",
      entity_id: "vehicle-1",
      action: "vehicle.created",
      created_by: "user-1",
    });
  });

  it("sorts events by descending timestamp and keeps audit events", () => {
    const events: VehicleTimelineEvent[] = [
      {
        id: "1",
        action: "vehicle.updated",
        title: "Veicolo modificato",
        description: "A",
        createdAt: "2026-07-01T10:00:00.000Z",
        actorType: "user",
        metadata: {},
      },
      {
        id: "2",
        action: "vehicle.created",
        title: "Veicolo creato",
        description: "B",
        createdAt: "2026-07-01T09:00:00.000Z",
        actorType: "user",
        metadata: {},
      },
    ];

    const built = buildVehicleTimelineEvents({
      auditEvents: events,
      vehicleCreatedAt: "2026-07-01T09:00:00.000Z",
      vehicleUpdatedAt: "2026-07-01T10:00:00.000Z",
    });

    expect(built[0].id).toBe("1");
    expect(built[1].id).toBe("2");
  });

  it("returns fallback event when no timeline events are available", () => {
    const built = buildVehicleTimelineEvents({
      auditEvents: [],
      vehicleCreatedAt: null,
      vehicleUpdatedAt: null,
    });

    expect(built).toHaveLength(1);
    expect(built[0].title).toBe("Timeline non disponibile");
  });

  it("maps persisted audit rows to timeline events", async () => {
    const supabase = createSupabaseMockForSelect({
      data: [
        {
          id: "evt-1",
          action: "vehicle.published",
          actor_type: "user",
          created_at: "2026-07-01T10:00:00.000Z",
          metadata_json: { toStatus: "published" },
        },
      ],
      error: null,
    });

    const events = await listVehicleTimelineAuditEvents(supabase, "dealer-1", "vehicle-1");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "evt-1",
      action: "vehicle.published",
      title: "Veicolo pubblicato",
    });
  });
});
