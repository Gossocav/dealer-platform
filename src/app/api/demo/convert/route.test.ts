import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const hitRateLimitMock = vi.fn();
  const createDemoAccessAuditEntryMock = vi.fn().mockResolvedValue(undefined);

  return {
    createClientMock,
    hitRateLimitMock,
    createDemoAccessAuditEntryMock,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimitMock,
}));

vi.mock("@/lib/demo-audit", () => ({
  createDemoAccessAuditEntry: mocks.createDemoAccessAuditEntryMock,
}));

vi.mock("@/lib/account-approval", () => ({
  resolveUserRoleFromMetadata: (user: { app_metadata?: { role?: string } } | null | undefined) =>
    String(user?.app_metadata?.role ?? "").trim().toLowerCase() || null,
  isPlatformAdminRole: (role: string | null | undefined) => {
    const normalized = String(role ?? "").trim().toLowerCase();
    return normalized === "admin" || normalized === "platform_owner";
  },
}));

import { POST } from "./route";

type UserStub = {
  id: string;
  app_metadata?: {
    role?: string;
  };
};

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new Request("http://localhost/api/demo/convert", {
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

  const dealersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const dealersUpdate = vi.fn(() => ({
    eq: dealersUpdateEq,
  }));

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: profileSelect,
      };
    }

    if (table === "dealers") {
      return {
        update: dealersUpdate,
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
    dealersUpdateEq,
  };
}

describe("demo convert route rate limiting", () => {
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
    const { supabaseAdmin, dealersUpdateEq } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(
      makeRequest(
        { dealerId: "dealer-1" },
        { "x-forwarded-for": " 203.0.113.7 , 198.51.100.10" }
      )
    );

    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(mocks.hitRateLimitMock).toHaveBeenCalledWith(
      "admin-demo-action:convert:admin-1:203.0.113.7",
      { windowMs: 60_000, maxRequests: 10 }
    );
    expect(dealersUpdateEq).toHaveBeenCalledOnce();
    expect(mocks.createDemoAccessAuditEntryMock).toHaveBeenCalledOnce();
  });

  it("returns 429 with Retry-After and performs no mutation when threshold is exceeded", async () => {
    const user: UserStub = {
      id: "admin-2",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, dealersUpdateEq } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: true,
      remaining: 0,
      resetAt: Date.now() + 2_200,
    });

    const response = await POST(makeRequest({ dealerId: "dealer-2" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(429);
    expect(payload).toEqual({ error: "Troppi tentativi. Riprova tra poco." });

    const retryAfter = response.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);

    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(mocks.createDemoAccessAuditEntryMock).not.toHaveBeenCalled();
  });

  it("keeps authz behavior and does not use rate limit as authz substitute", async () => {
    const user: UserStub = {
      id: "user-1",
      app_metadata: { role: "dealer_member" },
    };
    const { supabaseAdmin, dealersUpdateEq } = makeSupabaseAdmin(user, "dealer_member");

    mocks.createClientMock.mockReturnValue(supabaseAdmin);

    const response = await POST(makeRequest({ dealerId: "dealer-3" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "Accesso negato." });
    expect(mocks.hitRateLimitMock).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
  });
});
