import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
  profileMaybeSingleMock: vi.fn(),
  requestsReturnsMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

import { GET } from "./route";

function makeRequest(headers?: Record<string, string>) {
  return new Request("http://localhost/api/admin/info-requests", {
    method: "GET",
    headers: headers ?? {},
  });
}

const adminUser = { id: "user-1", app_metadata: { role: "admin" }, user_metadata: {} };

function buildSupabaseAdminStub() {
  return {
    auth: {
      getUser: mocks.getUserMock,
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mocks.profileMaybeSingleMock,
            })),
          })),
        };
      }

      // dealer_info_requests
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              returns: mocks.requestsReturnsMock,
            })),
          })),
        })),
      };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

  mocks.getUserMock.mockResolvedValue({ data: { user: adminUser }, error: null });
  mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
  mocks.requestsReturnsMock.mockResolvedValue({
    data: [
      {
        id: "req-1",
        company_name: "Auto Rossi",
        contact_name: "Mario Rossi",
        email: "mario@autorossi.it",
        phone: "0521 123456",
        message: "Info sui piani",
        created_at: "2026-07-26T10:00:00.000Z",
      },
    ],
    error: null,
  });

  mocks.createClientMock.mockReturnValue(buildSupabaseAdminStub());
});

describe("admin info-requests route", () => {
  it("returns 401 with no bearer token", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.getUserMock).not.toHaveBeenCalled();
  });

  it("returns the request list for an authorized admin", async () => {
    const response = await GET(makeRequest({ authorization: "Bearer test-token" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { requests?: unknown[] };
    expect(payload.requests).toHaveLength(1);
  });

  it("returns 403 for a non-admin user", async () => {
    mocks.getUserMock.mockResolvedValue({
      data: { user: { id: "user-2", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mocks.profileMaybeSingleMock.mockResolvedValue({ data: { role: "dealer" }, error: null });

    const response = await GET(makeRequest({ authorization: "Bearer test-token" }));

    expect(response.status).toBe(403);
  });

  it("returns 401 when the token does not resolve a user", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });

    const response = await GET(makeRequest({ authorization: "Bearer bad-token" }));

    expect(response.status).toBe(401);
  });

  it("returns 500 when the query fails", async () => {
    mocks.requestsReturnsMock.mockResolvedValue({ data: null, error: { code: "500", message: "boom" } });

    const response = await GET(makeRequest({ authorization: "Bearer test-token" }));

    expect(response.status).toBe(500);
  });
});
