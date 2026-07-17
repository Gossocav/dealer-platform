import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const hitRateLimitMock = vi.fn();
  const sendDealerLifecycleEmailMock = vi.fn().mockResolvedValue({ ok: true });

  return {
    createClientMock,
    hitRateLimitMock,
    sendDealerLifecycleEmailMock,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("@/lib/account-approval", () => ({
  resolveUserRoleFromMetadata: (user: { app_metadata?: { role?: string } } | null | undefined) =>
    String(user?.app_metadata?.role ?? "").trim().toLowerCase() || null,
  isPlatformAdminRole: (role: string | null | undefined) => {
    const normalized = String(role ?? "").trim().toLowerCase();
    return normalized === "admin" || normalized === "platform_owner";
  },
}));

vi.mock("@/lib/api-rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimitMock,
}));

vi.mock("@/lib/dealer-account-emails", () => ({
  sendDealerLifecycleEmail: mocks.sendDealerLifecycleEmailMock,
}));

import { POST } from "./route";

type UserStub = {
  id: string;
  app_metadata?: {
    role?: string;
  };
};

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new Request("http://localhost/api/admin/dealer-approval", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

function makeSupabaseAdmin(user: UserStub, profileRole: string | null = null) {
  const profileMaybeSingle = vi.fn().mockResolvedValue({
    data: profileRole ? { role: profileRole } : null,
    error: null,
  });

  const profileEq = vi.fn(() => ({
    maybeSingle: profileMaybeSingle,
  }));

  const profileSelect = vi.fn(() => ({
    eq: profileEq,
  }));

  const dealersSelectMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      legal_name: "Dealer Test",
      name: null,
      email: null,
    },
    error: null,
  });

  const dealersSelectEq = vi.fn(() => ({
    maybeSingle: dealersSelectMaybeSingle,
  }));

  const dealersSelect = vi.fn(() => ({
    eq: dealersSelectEq,
  }));

  const dealersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const dealersUpdate = vi.fn(() => ({
    eq: dealersUpdateEq,
  }));

  const dealerUsersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const dealerUsersUpdate = vi.fn(() => ({
    eq: dealerUsersUpdateEq,
  }));

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return { select: profileSelect };
    }

    if (table === "dealers") {
      return {
        select: dealersSelect,
        update: dealersUpdate,
      };
    }

    if (table === "dealer_users") {
      return {
        update: dealerUsersUpdate,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const supabaseAdmin = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from,
  };

  return {
    supabaseAdmin,
    dealersSelectMaybeSingle,
    dealersUpdateEq,
    dealerUsersUpdateEq,
  };
}

describe("admin dealer-approval route rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("continues to mutation for authorized admin under threshold", async () => {
    const user: UserStub = {
      id: "admin-1",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, dealersSelectMaybeSingle, dealersUpdateEq, dealerUsersUpdateEq } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(
      makeRequest(
        { dealerId: "dealer-1", action: "approve" },
        { "x-forwarded-for": " 203.0.113.7 , 198.51.100.10" }
      )
    );

    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      dealerId: "dealer-1",
      dealerStatus: "approved",
      membershipStatus: "active",
    });
    expect(mocks.hitRateLimitMock).toHaveBeenCalledWith(
      "admin-mutate:dealer-approval:approve:admin-1:203.0.113.7",
      { windowMs: 60_000, maxRequests: 10 }
    );
    expect(dealersSelectMaybeSingle).toHaveBeenCalledOnce();
    expect(dealersUpdateEq).toHaveBeenCalledOnce();
    expect(dealerUsersUpdateEq).toHaveBeenCalledOnce();
  });

  it("returns 429 with Retry-After and performs no mutation when threshold is exceeded", async () => {
    const user: UserStub = {
      id: "admin-2",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, dealersSelectMaybeSingle, dealersUpdateEq, dealerUsersUpdateEq } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: true,
      remaining: 0,
      resetAt: Date.now() + 2_100,
    });

    const response = await POST(makeRequest({ dealerId: "dealer-2", action: "reject" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(429);
    expect(payload).toEqual({ error: "Troppi tentativi. Riprova tra poco." });

    const retryAfter = response.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);

    expect(dealersSelectMaybeSingle).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(dealerUsersUpdateEq).not.toHaveBeenCalled();
    expect(mocks.sendDealerLifecycleEmailMock).not.toHaveBeenCalled();
  });

  it("keeps authz behavior and does not use rate limit as authz substitute", async () => {
    const user: UserStub = {
      id: "user-1",
      app_metadata: { role: "dealer_member" },
    };
    const { supabaseAdmin, dealersUpdateEq, dealerUsersUpdateEq } = makeSupabaseAdmin(user, "dealer_member");

    mocks.createClientMock.mockReturnValue(supabaseAdmin);

    const response = await POST(makeRequest({ dealerId: "dealer-3", action: "approve" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "Accesso negato." });
    expect(mocks.hitRateLimitMock).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(dealerUsersUpdateEq).not.toHaveBeenCalled();
  });
});
