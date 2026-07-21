import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const hitRateLimitMock = vi.fn();
  const sendAdminNotificationEmailMock = vi.fn().mockResolvedValue({ ok: true });
  const resolveDealerIdFromTenantSourcesMock = vi.fn();

  return {
    createClientMock,
    hitRateLimitMock,
    sendAdminNotificationEmailMock,
    resolveDealerIdFromTenantSourcesMock,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("../../../../lib/api-rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimitMock,
}));

vi.mock("../../../../lib/admin-notification-email", () => ({
  sendAdminNotificationEmail: mocks.sendAdminNotificationEmailMock,
}));

vi.mock("../../../../lib/dealer-id-resolution", () => ({
  resolveDealerIdFromTenantSources: mocks.resolveDealerIdFromTenantSourcesMock,
}));

import { GET, POST } from "./route";

type UserStub = {
  id: string;
};

function makePostRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new Request("http://localhost/api/demo/plan-request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(headers?: Record<string, string>) {
  return new Request("http://localhost/api/demo/plan-request", {
    method: "GET",
    headers: {
      authorization: "Bearer test-token",
      ...(headers ?? {}),
    },
  });
}

function makeSupabaseAdmin(user: UserStub | null, dealerRow: { account_type?: string | null } | null) {
  const dealersMaybeSingle = vi.fn().mockResolvedValue({ data: dealerRow, error: null });
  const dealersEq = vi.fn(() => ({ maybeSingle: dealersMaybeSingle }));
  const dealersSelect = vi.fn(() => ({ eq: dealersEq }));

  const subscriptionsUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const subscriptionsUpdate = vi.fn(() => ({ eq: subscriptionsUpdateEq }));

  const subscriptionsMaybeSingle = vi.fn().mockResolvedValue({
    data: { requested_plan_code: null, requested_plan_at: null, converted_plan_code: null },
    error: null,
  });
  const subscriptionsEq = vi.fn(() => ({ maybeSingle: subscriptionsMaybeSingle }));
  const subscriptionsSelect = vi.fn(() => ({ eq: subscriptionsEq }));

  const from = vi.fn((table: string) => {
    if (table === "dealers") return { select: dealersSelect };
    if (table === "dealer_demo_subscriptions") {
      return { select: subscriptionsSelect, update: subscriptionsUpdate };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const supabaseAdmin = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : new Error("no user") }),
    },
    from,
  };

  return { supabaseAdmin, dealersMaybeSingle, subscriptionsUpdateEq, subscriptionsMaybeSingle };
}

describe("demo plan-request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mocks.hitRateLimitMock.mockReturnValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 });
  });

  it("rejects requests with no bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/demo/plan-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode: "elite" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects an invalid plan code", async () => {
    const { supabaseAdmin } = makeSupabaseAdmin({ id: "user-1" }, { account_type: "demo" });
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await POST(makePostRequest({ planCode: "enterprise" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Piano non valido.");
  });

  it("rejects a dealer that is not currently in demo", async () => {
    const { supabaseAdmin } = makeSupabaseAdmin({ id: "user-1" }, { account_type: "paid" });
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await POST(makePostRequest({ planCode: "elite" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Questa funzione e disponibile solo per account in demo.");
  });

  it("records the requested plan and notifies the admin on the happy path", async () => {
    const { supabaseAdmin, subscriptionsUpdateEq } = makeSupabaseAdmin({ id: "user-1" }, { account_type: "demo", name: "Dealer Demo" } as never);
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await POST(makePostRequest({ planCode: "elite" }));
    const payload = (await response.json()) as { requestedPlanCode?: string };

    expect(response.status).toBe(200);
    expect(payload.requestedPlanCode).toBe("elite");
    expect(subscriptionsUpdateEq).toHaveBeenCalledWith("dealer_id", "dealer-1");
    expect(mocks.sendAdminNotificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("returns the currently requested plan on GET for a demo dealer", async () => {
    const { supabaseAdmin, subscriptionsMaybeSingle } = makeSupabaseAdmin({ id: "user-1" }, { account_type: "demo" });
    subscriptionsMaybeSingle.mockResolvedValue({
      data: { requested_plan_code: "pro", requested_plan_at: "2026-07-21T00:00:00.000Z" },
      error: null,
    });
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await GET(makeGetRequest());
    const payload = (await response.json()) as { requestedPlanCode?: string };

    expect(response.status).toBe(200);
    expect(payload.requestedPlanCode).toBe("pro");
  });

  it("returns the active (converted) plan for a dealer no longer in demo", async () => {
    const { supabaseAdmin, subscriptionsMaybeSingle } = makeSupabaseAdmin({ id: "user-1" }, { account_type: "paid" });
    subscriptionsMaybeSingle.mockResolvedValue({
      data: { requested_plan_code: "elite", requested_plan_at: "2026-07-20T00:00:00.000Z", converted_plan_code: "elite" },
      error: null,
    });
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await GET(makeGetRequest());
    const payload = (await response.json()) as { requestedPlanCode?: string | null; activePlanCode?: string | null };

    expect(response.status).toBe(200);
    expect(payload.activePlanCode).toBe("elite");
    // no longer in demo, so the (now stale) requested-plan flag shouldn't be surfaced anymore
    expect(payload.requestedPlanCode).toBeNull();
  });
});
