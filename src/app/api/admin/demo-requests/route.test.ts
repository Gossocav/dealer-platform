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

  const demoRequestPostMutationMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      status: "rejected",
      demo_status: null,
      demo_expires_at: null,
      linked_dealer_id: null,
    },
    error: null,
  });

  const demoRequestPostMutationEq = vi.fn(() => ({
    maybeSingle: demoRequestPostMutationMaybeSingle,
  }));

  const demoRequestsSelect = vi
    .fn()
    .mockImplementationOnce(() => ({
      eq: demoRequestTargetEq,
    }))
    .mockImplementation(() => ({
      eq: demoRequestPostMutationEq,
    }));

  const demoRequestsUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const demoRequestsUpdate = vi.fn(() => ({
    eq: demoRequestsUpdateEq,
  }));

  const dealersMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: "dealer-1" },
    error: null,
  });
  const dealersLimit = vi.fn(() => ({
    maybeSingle: dealersMaybeSingle,
  }));
  const dealersEq = vi.fn(() => ({
    limit: dealersLimit,
  }));
  const dealersSelect = vi.fn(() => ({
    eq: dealersEq,
  }));
  const dealersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const dealersUpdate = vi.fn(() => ({
    eq: dealersUpdateEq,
  }));

  const subscriptionMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      dealer_id: "dealer-1",
      lifecycle_version: 3,
      demo_status: "active",
      expires_at: new Date().toISOString(),
    },
    error: null,
  });
  const subscriptionEq = vi.fn(() => ({ maybeSingle: subscriptionMaybeSingle }));
  const subscriptionSelect = vi.fn(() => ({ eq: subscriptionEq }));
  const subscriptionUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const subscriptionUpdate = vi.fn(() => ({ eq: subscriptionUpdateEq }));

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

    if (table === "dealers") {
      return {
        select: dealersSelect,
        update: dealersUpdate,
      };
    }

    if (table === "dealer_demo_subscriptions") {
      return {
        select: subscriptionSelect,
        update: subscriptionUpdate,
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
    rpc: vi.fn(),
  };

  return {
    supabaseAdmin,
    demoRequestTargetMaybeSingle,
    demoRequestsUpdateEq,
    dealersMaybeSingle,
    dealersUpdateEq,
    subscriptionMaybeSingle,
    rpc: supabaseAdmin.rpc,
    authAdminCreateUser,
    createSignedUrl,
  };
}

function makeSupabaseAdminForActivation(user: UserStub, failureMode: "progress" | "finalize" | null = null) {
  const { supabaseAdmin } = makeSupabaseAdmin(user);

  const profileMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));
  const profileSelect = vi.fn(() => ({ eq: profileEq }));
  const profileUpsert = vi.fn().mockResolvedValue({ error: null });

  const demoRequestTargetMaybeSingle = vi
    .fn()
    .mockResolvedValueOnce({
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
    })
    .mockResolvedValue({
      data: {
        status: "activated",
        demo_status: "active",
        demo_expires_at: "2026-07-24T00:00:00.000Z",
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

  const demoRequestTargetEq = vi.fn(() => ({ maybeSingle: demoRequestTargetMaybeSingle }));
  const demoRequestsSelect = vi.fn(() => ({ eq: demoRequestTargetEq }));
  const demoRequestsUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const demoRequestsUpdate = vi.fn(() => ({ eq: demoRequestsUpdateEq }));

  const dealersMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "dealer-1", status: "approved" }, error: null });
  const dealersLimit = vi.fn(() => ({ maybeSingle: dealersMaybeSingle }));
  const dealersEq = vi.fn(() => ({ limit: dealersLimit }));
  const dealersSelect = vi.fn(() => ({ eq: dealersEq }));
  const dealersUpsert = vi.fn().mockResolvedValue({ error: null });
  const dealersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const dealersUpdate = vi.fn(() => ({ eq: dealersUpdateEq }));

  const dealerUsersUpsert = vi.fn().mockResolvedValue({ error: null });
  const subscriptionMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      dealer_id: "dealer-1",
      demo_status: "active",
      expires_at: "2026-07-24T00:00:00.000Z",
    },
    error: null,
  });
  const subscriptionEq = vi.fn(() => ({ maybeSingle: subscriptionMaybeSingle }));
  const subscriptionSelect = vi.fn(() => ({ eq: subscriptionEq }));

  const rpc = vi.fn(async (fn: string) => {
    if (fn === "configure_demo_profile") return { data: { outcome: "DEMO_CONFIGURED" }, error: null };
    if (fn === "reserve_demo_activation") return { data: { outcome: "DEMO_RESERVED" }, error: null };
    if (fn === "record_demo_activation_progress") {
      if (failureMode === "progress") {
        return { data: null, error: new Error("activation progress failed") };
      }

      return { data: { outcome: "DEMO_PROGRESS_RECORDED" }, error: null };
    }

    if (fn === "finalize_demo_activation") {
      if (failureMode === "finalize") {
        return { data: null, error: new Error("activation finalize failed") };
      }

      return { data: { outcome: "DEMO_ACTIVATED" }, error: null };
    }

    if (fn === "fail_demo_activation") return { data: { outcome: "DEMO_ACTIVATION_FAILED" }, error: null };
    return { data: { outcome: "DEMO_UNKNOWN" }, error: null };
  });

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: profileSelect,
        upsert: profileUpsert,
      };
    }

    if (table === "demo_requests") {
      return {
        select: demoRequestsSelect,
        update: demoRequestsUpdate,
      };
    }

    if (table === "dealers") {
      return {
        select: dealersSelect,
        upsert: dealersUpsert,
        update: dealersUpdate,
      };
    }

    if (table === "dealer_users") {
      return {
        upsert: dealerUsersUpsert,
      };
    }

    if (table === "dealer_demo_subscriptions") {
      return {
        select: subscriptionSelect,
      };
    }

    if (table === "audit_logs") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  supabaseAdmin.auth.admin.createUser = vi.fn().mockResolvedValue({
    data: { user: { id: "profile-1" } },
    error: null,
  });
  supabaseAdmin.from = from as unknown as typeof supabaseAdmin.from;
  supabaseAdmin.storage = {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(),
    })),
  };
  supabaseAdmin.rpc = rpc;

  return {
    supabaseAdmin,
    demoRequestsUpdateEq,
    dealersMaybeSingle,
    dealersUpsert,
    rpc,
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
    const { supabaseAdmin, demoRequestTargetMaybeSingle, demoRequestsUpdateEq, dealersUpdateEq, rpc } = makeSupabaseAdmin(user);

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    rpc.mockResolvedValue({
      data: {
        outcome: "DEMO_REJECTED",
        request: {
          id: "request-1",
          status: "revoked",
          demo_status: "revoked",
          demo_expires_at: null,
          linked_dealer_id: "dealer-1",
        },
        dealer: {
          id: "dealer-1",
          demo_status: "revoked",
        },
      },
      error: null,
    });

    const response = await POST(
      makeRequest(
        { requestId: "request-1", action: "reject" },
        { "x-forwarded-for": " 203.0.113.9 , 198.51.100.10" }
      )
    );

    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      requestId: "request-1",
      status: "revoked",
      demoStatus: "revoked",
      demoExpiresAt: null,
      linkedDealerId: "dealer-1",
    });
    expect(mocks.hitRateLimitMock).toHaveBeenCalledWith(
      "admin-mutate:demo-requests:reject:admin-1:203.0.113.9",
      { windowMs: 60_000, maxRequests: 10 }
    );
    expect(demoRequestTargetMaybeSingle).toHaveBeenCalledOnce();
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "reject_demo_request_atomic",
      expect.objectContaining({
        p_request_id: "request-1",
        p_dealer_id: "dealer-1",
        p_actor_id: "admin-1",
        p_reason: "Demo request rejected by admin",
        p_lifecycle_version: 3,
      })
    );
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

  it("uses demo RPC lifecycle flow for activate_demo", async () => {
    const user: UserStub = {
      id: "admin-3",
      app_metadata: { role: "admin" },
    };

    const { supabaseAdmin, rpc } = makeSupabaseAdminForActivation(user);
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "activate_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      requestId: "request-1",
      status: "activated",
      demoStatus: "active",
      demoExpiresAt: "2026-07-24T00:00:00.000Z",
      linkedDealerId: "dealer-1",
    });
    expect(rpc).toHaveBeenCalledWith(
      "configure_demo_profile",
      expect.objectContaining({
        p_dealer_id: "dealer-1",
        p_demo_request_id: "request-1",
        p_profile_code: "base",
        p_actor_id: "admin-3",
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      "reserve_demo_activation",
      expect.objectContaining({
        p_dealer_id: "dealer-1",
        p_actor_id: "admin-3",
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      "finalize_demo_activation",
      expect.objectContaining({
        p_dealer_id: "dealer-1",
        p_actor_id: "admin-3",
        p_profile_id: "profile-1",
        p_demo_request_id: "request-1",
      })
    );
  });
  it("keeps the request retryable when activation fails before finalization", async () => {
    const user: UserStub = {
      id: "admin-4",
      app_metadata: { role: "admin" },
    };

    const { supabaseAdmin, demoRequestsUpdateEq, rpc } = makeSupabaseAdminForActivation(user, "progress");
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "activate_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Errore attivazione demo. Riprova." });
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "fail_demo_activation",
      expect.objectContaining({
        p_dealer_id: "dealer-1",
        p_actor_id: "admin-4",
        p_attempt_id: expect.any(String),
        p_reason: "Activation flow failed",
      })
    );

    const rpcNames = rpc.mock.calls.map(([name]) => String(name));
    expect(rpcNames.indexOf("reserve_demo_activation")).toBeGreaterThan(-1);
    expect(rpcNames.indexOf("fail_demo_activation")).toBeGreaterThan(rpcNames.indexOf("reserve_demo_activation"));
  });

  it("rejects a never-activated request with a plain status update, without requiring a dealer or RPC", async () => {
    const user: UserStub = {
      id: "admin-5",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestsUpdateEq, dealersMaybeSingle, rpc } = makeSupabaseAdmin(user);

    dealersMaybeSingle.mockResolvedValue({ data: null, error: null });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "reject" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      requestId: "request-1",
      status: "rejected",
      demoStatus: null,
      demoExpiresAt: null,
      linkedDealerId: null,
    });
    expect(demoRequestsUpdateEq).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("revokes an activated demo via the atomic RPC", async () => {
    const user: UserStub = {
      id: "admin-6",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, demoRequestsUpdateEq, dealersUpdateEq, rpc } = makeSupabaseAdmin(user);

    demoRequestTargetMaybeSingle.mockResolvedValue({
      data: {
        id: "request-1",
        dealership_name: "Dealer Demo",
        contact_name: "Mario Rossi",
        email: "dealer@example.com",
        phone: "123",
        city: "Roma",
        status: "activated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chamber_document_path: null,
        chamber_document_name: null,
        chamber_document_mime_type: null,
        chamber_document_size: null,
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    rpc.mockResolvedValue({
      data: {
        outcome: "DEMO_REJECTED",
        request: {
          id: "request-1",
          status: "revoked",
          demo_status: "revoked",
          demo_expires_at: null,
          linked_dealer_id: "dealer-1",
        },
        dealer: {
          id: "dealer-1",
          demo_status: "revoked",
        },
      },
      error: null,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "revoke_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      requestId: "request-1",
      status: "revoked",
      demoStatus: "revoked",
      demoExpiresAt: null,
      linkedDealerId: "dealer-1",
    });
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "reject_demo_request_atomic",
      expect.objectContaining({
        p_request_id: "request-1",
        p_dealer_id: "dealer-1",
        p_actor_id: "admin-6",
        p_reason: "Demo revoked by admin",
        p_lifecycle_version: 3,
      })
    );
    expect(mocks.sendDemoLifecycleEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "dealer@example.com", kind: "revoked" })
    );
  });

  it("refuses to reject an already-activated demo request and does not fall back to revoke", async () => {
    const user: UserStub = {
      id: "admin-8",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, demoRequestsUpdateEq, dealersUpdateEq, rpc } = makeSupabaseAdmin(user);

    demoRequestTargetMaybeSingle.mockResolvedValue({
      data: {
        id: "request-1",
        dealership_name: "Dealer Demo",
        contact_name: "Mario Rossi",
        email: "dealer@example.com",
        phone: "123",
        city: "Roma",
        status: "activated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chamber_document_path: null,
        chamber_document_name: null,
        chamber_document_mime_type: null,
        chamber_document_size: null,
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "reject" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "Richiesta demo gia attivata. Usa Revoca Demo." });
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.sendDemoLifecycleEmailMock).not.toHaveBeenCalled();
  });

  it("treats a repeat activate_demo on an already-activated request as an idempotent success", async () => {
    const user: UserStub = {
      id: "admin-9",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, dealersUpdateEq, rpc } = makeSupabaseAdmin(user);

    demoRequestTargetMaybeSingle.mockResolvedValue({
      data: {
        id: "request-1",
        dealership_name: "Dealer Demo",
        contact_name: "Mario Rossi",
        email: "dealer@example.com",
        phone: "123",
        city: "Roma",
        status: "activated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chamber_document_path: null,
        chamber_document_name: null,
        chamber_document_mime_type: null,
        chamber_document_size: null,
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "activate_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ requestId: "request-1", status: "activated" });
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses to re-activate a revoked demo request instead of hitting createUser", async () => {
    const user: UserStub = {
      id: "admin-10",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, dealersUpdateEq, authAdminCreateUser, rpc } = makeSupabaseAdmin(user);

    demoRequestTargetMaybeSingle.mockResolvedValue({
      data: {
        id: "request-1",
        dealership_name: "Dealer Demo",
        contact_name: "Mario Rossi",
        email: "dealer@example.com",
        phone: "123",
        city: "Roma",
        status: "revoked",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chamber_document_path: null,
        chamber_document_name: null,
        chamber_document_mime_type: null,
        chamber_document_size: null,
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "activate_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "Richiesta demo non riattivabile nello stato corrente." });
    expect(authAdminCreateUser).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("converts an activated demo via the atomic RPC instead of raw table updates", async () => {
    const user: UserStub = {
      id: "admin-11",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, demoRequestsUpdateEq, dealersUpdateEq, rpc } = makeSupabaseAdmin(user);

    demoRequestTargetMaybeSingle.mockResolvedValue({
      data: {
        id: "request-1",
        dealership_name: "Dealer Demo",
        contact_name: "Mario Rossi",
        email: "dealer@example.com",
        phone: "123",
        city: "Roma",
        status: "activated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chamber_document_path: null,
        chamber_document_name: null,
        chamber_document_mime_type: null,
        chamber_document_size: null,
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    rpc.mockResolvedValue({
      data: {
        outcome: "DEMO_CONVERTED",
        request: {
          id: "request-1",
          status: "converted",
          demo_status: "converted",
          demo_expires_at: null,
          linked_dealer_id: "dealer-1",
        },
        dealer: {
          id: "dealer-1",
          demo_status: "converted",
        },
      },
      error: null,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "convert_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      requestId: "request-1",
      status: "converted",
      demoStatus: "converted",
      demoExpiresAt: null,
      linkedDealerId: "dealer-1",
      planCode: "base",
    });
    expect(demoRequestsUpdateEq).not.toHaveBeenCalled();
    expect(dealersUpdateEq).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "convert_demo_request_atomic",
      expect.objectContaining({
        p_request_id: "request-1",
        p_dealer_id: "dealer-1",
        p_actor_id: "admin-11",
        p_lifecycle_version: 3,
        p_plan_code: "base",
      })
    );
    expect(mocks.sendDemoLifecycleEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "dealer@example.com", kind: "converted" })
    );
  });

  it("forwards an explicitly chosen plan code to the atomic conversion RPC", async () => {
    const user: UserStub = {
      id: "admin-11",
      app_metadata: { role: "admin" },
    };
    const { supabaseAdmin, demoRequestTargetMaybeSingle, rpc } = makeSupabaseAdmin(user);

    demoRequestTargetMaybeSingle.mockResolvedValue({
      data: {
        id: "request-1",
        dealership_name: "Dealer Demo",
        contact_name: "Mario Rossi",
        email: "dealer@example.com",
        phone: "123",
        city: "Roma",
        status: "activated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chamber_document_path: null,
        chamber_document_name: null,
        chamber_document_mime_type: null,
        chamber_document_size: null,
        linked_dealer_id: "dealer-1",
      },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    rpc.mockResolvedValue({
      data: {
        outcome: "DEMO_CONVERTED",
        request: {
          id: "request-1",
          status: "converted",
          demo_status: "converted",
          demo_expires_at: null,
          linked_dealer_id: "dealer-1",
        },
        dealer: { id: "dealer-1", demo_status: "converted" },
      },
      error: null,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "convert_demo", planCode: "elite" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.planCode).toBe("elite");
    expect(rpc).toHaveBeenCalledWith(
      "convert_demo_request_atomic",
      expect.objectContaining({ p_plan_code: "elite" })
    );
  });

  it("refuses to activate_demo over an existing paid/converted dealer sharing the same email", async () => {
    const user: UserStub = {
      id: "admin-7",
      app_metadata: { role: "admin" },
    };

    const { supabaseAdmin, dealersMaybeSingle, dealersUpsert, rpc } = makeSupabaseAdminForActivation(user);
    dealersMaybeSingle.mockResolvedValue({
      data: { id: "dealer-1", status: "approved", account_type: "paid", demo_status: "converted" },
      error: null,
    });

    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.hitRateLimitMock.mockReturnValue({
      limited: false,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(makeRequest({ requestId: "request-1", action: "activate_demo" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "Esiste gia un account abbonato con questa email. Attivazione demo non consentita." });
    expect(dealersUpsert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
