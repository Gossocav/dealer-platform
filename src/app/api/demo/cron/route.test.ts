import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const createDemoAccessAuditEntryMock = vi.fn().mockResolvedValue(undefined);
  return { createClientMock, createDemoAccessAuditEntryMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("@/lib/demo-audit", () => ({
  createDemoAccessAuditEntry: mocks.createDemoAccessAuditEntryMock,
}));

import { GET, POST } from "./route";

const SECRET = "test-cron-secret";

function makeRequest(method: "GET" | "POST", headers?: Record<string, string>) {
  return new Request("http://localhost/api/demo/cron", { method, headers: headers ?? {} });
}

// Supabase client stub whose update chain resolves to `result`.
function stubSupabase(result: { data: Array<{ id: string }> | null; error: unknown }) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    select: vi.fn(() => Promise.resolve(result)),
  };
  return { from: vi.fn(() => chain) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.CRON_SECRET;
});

describe("demo/cron", () => {
  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("GET", { authorization: "Bearer whatever" }));
    expect(res.status).toBe(403);
    expect(mocks.createClientMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await GET(makeRequest("GET", { authorization: "Bearer wrong" }));
    expect(res.status).toBe(403);
  });

  it("accepts Vercel-style GET with Authorization: Bearer and expires due demos", async () => {
    mocks.createClientMock.mockReturnValue(stubSupabase({ data: [{ id: "d1" }, { id: "d2" }], error: null }));

    const res = await GET(makeRequest("GET", { authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 2 });
    expect(mocks.createDemoAccessAuditEntryMock).toHaveBeenCalledTimes(2);
  });

  it("accepts manual POST with x-cron-secret", async () => {
    mocks.createClientMock.mockReturnValue(stubSupabase({ data: [], error: null }));

    const res = await POST(makeRequest("POST", { "x-cron-secret": SECRET }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0 });
  });

  it("returns 500 when the update fails", async () => {
    mocks.createClientMock.mockReturnValue(stubSupabase({ data: null, error: { message: "db down" } }));

    const res = await GET(makeRequest("GET", { authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(500);
  });
});
