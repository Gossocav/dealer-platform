import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const hitRateLimitMock = vi.fn();
  const createDemoAccessAuditEntryMock = vi.fn().mockResolvedValue(undefined);
  const sendPlatformEmailMock = vi.fn().mockResolvedValue({ ok: true });
  const sendDemoLifecycleEmailMock = vi.fn().mockResolvedValue({ ok: true });

  return {
    createClientMock,
    hitRateLimitMock,
    createDemoAccessAuditEntryMock,
    sendPlatformEmailMock,
    sendDemoLifecycleEmailMock,
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

vi.mock("@/lib/demo-audit", () => ({
  createDemoAccessAuditEntry: mocks.createDemoAccessAuditEntryMock,
}));

vi.mock("@/lib/admin-notification-email", () => ({
  sendPlatformEmail: mocks.sendPlatformEmailMock,
  sendDemoLifecycleEmail: mocks.sendDemoLifecycleEmailMock,
}));

import { POST } from "./route";

type UserStub = {
  id: string;
  app_metadata?: {
    role?: string;
  };
};

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new Request("http://localhost/api/admin/demo-requests", {
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

  const demoRequestTargetMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "request-1",
      dealership_name: "Dealer Demo",
      contact_name: "Mario Rossi",
      email: "dealer@example.com",
      phone: "123",
      city: "Roma",
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      chamber_document_path: null,
      chamber_document_name: null,
      chamber_document_mime_type: null,
      chamber_document_size: null,
    },
    error: null,
  });

  const demoRequestTargetEq = vi.fn(() => ({
    maybeSingle: demoRequestTargetMaybeSingle,
  }));

  const demoRequestsSelect = vi.fn(() => ({
    eq: demoRequestTargetEq,
  }));

  const demoRequestsUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const demoRequestsUpdate = vi.fn(() => ({
    eq: demoRequestsUpdateEq,
  }));

  const authAdminCreateUser = vi.fn();
  const createSignedUrl = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return { select: profileSelect };
    }

    if (table === "demo_requests") {
      return {
        select: demoRequestsSelect,
        update: demoRequestsUpdate,
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
      admin: {
        createUser: authAdminCreateUser,
      },
    },
    from,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl,
      })),
    },
  };

  return {
    supabaseAdmin,
    demoRequestTargetMaybeSingle,
    demoRequestsUpdateEq,
    authAdminCreateUser,
    createSignedUrl,
  };
}

describe("admin demo-requests route rate limiting", () => {
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
    const { supabaseAdmin, demoRequestTargetMaybeSingle, demoRequestsUpdateEq } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(
      makeRequest(
        { requestId: "request-1", action: "reject" },
        { "x-forwarded-for": " 203.0.113.9 , 198.51.100.10" }
      )
    );

    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ requestId: "request-1", status: "rejected" });
    expect(mocks.hitRateLimitMock).toHaveBeenCalledWith(
      "admin-mutate:demo-requests:reject:admin-1:203.0.113.9",
      { windowMs: 60_000, maxRequests: 10 }
    );
    expect(demoRequestTargetMaybeSingle).toHaveBeenCalledOnce();
    expect(demoRequestsUpdateEq).toHaveBeenCalledOnce();
  });

  it("returns 429 with Retry-After and performs no side effects when threshold is exceeded", async () => {
    const user: UserStub = {
      id: "admin-2",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, demoRequestsUpdateEq, authAdminCreateUser, createSignedUrl } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: true,
      remaining: 0,
      resetAt: Date.now() + 2_200,
    });

    const response = await POST(makeRequest({ requestId: "request-2", action: "reject" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(429);
    expect(payload).toEqual({ error: "Troppi tentativi. Riprova tra poco." });

    const retryAfter = response.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);

    expect(demoRequestTargetMaybeSingle).not.toHaveBeenCalled();
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
    expect(authAdminCreateUser).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.createDemoAccessAuditEntryMock).not.toHaveBeenCalled();
    expect(mocks.sendPlatformEmailMock).not.toHaveBeenCalled();
    expect(mocks.sendDemoLifecycleEmailMock).not.toHaveBeenCalled();
  });

  it("keeps authz behavior and does not use rate limit as authz substitute", async () => {
    const user: UserStub = {
      id: "user-1",
      app_metadata: { role: "dealer_member" },
    };
    const { supabaseAdmin, demoRequestsUpdateEq } = makeSupabaseAdmin(user, "dealer_member");

    mocks.createClientMock.mockReturnValue(supabaseAdmin);

    const response = await POST(makeRequest({ requestId: "request-3", action: "reject" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "Accesso negato." });
    expect(mocks.hitRateLimitMock).not.toHaveBeenCalled();
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
  });
});
