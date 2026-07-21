import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const resolveDealerIdFromTenantSourcesMock = vi.fn();
  const fetchMock = vi.fn();

  return { createClientMock, resolveDealerIdFromTenantSourcesMock, fetchMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("../../../../lib/dealer-id-resolution", () => ({
  resolveDealerIdFromTenantSources: mocks.resolveDealerIdFromTenantSourcesMock,
}));

vi.stubGlobal("fetch", mocks.fetchMock);

import { POST } from "./route";

type UserStub = {
  id: string;
};

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new Request("http://localhost/api/email/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

function makeSupabaseAdmin(user: UserStub | null, messageRow: Record<string, unknown> | null) {
  const messageMaybeSingle = vi.fn().mockResolvedValue({ data: messageRow, error: null });
  const messageEqDealer = vi.fn(() => ({ maybeSingle: messageMaybeSingle }));
  const messageEqId = vi.fn(() => ({ eq: messageEqDealer }));
  const messageSelect = vi.fn(() => ({ eq: messageEqId }));

  const messageUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const messageUpdate = vi.fn(() => ({ eq: messageUpdateEq }));

  const threadUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const threadUpdate = vi.fn(() => ({ eq: threadUpdateEq }));

  const deliveryInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "email_messages") return { select: messageSelect, update: messageUpdate };
    if (table === "email_threads") return { update: threadUpdate };
    if (table === "email_delivery_events") return { insert: deliveryInsert };
    throw new Error(`Unexpected table: ${table}`);
  });

  const supabaseAdmin = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : new Error("no user") }),
    },
    from,
  };

  return { supabaseAdmin, messageMaybeSingle, messageUpdateEq, threadUpdateEq, deliveryInsert };
}

const BASE_MESSAGE = {
  id: "message-1",
  dealer_id: "dealer-1",
  thread_id: "thread-1",
  status: "draft",
  subject: "Ciao",
  reply_to_email: "dealer@example.com",
  to_recipients: ["cliente@example.com"],
  body_text: "Testo semplice",
  body_html: null,
};

describe("email send route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.RESEND_API_KEY = "resend-key";
    process.env.RESEND_FROM_EMAIL = "no-reply@dealerplatform.it";
  });

  it("rejects requests with no bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: "message-1" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the message doesn't belong to the caller's dealer", async () => {
    const { supabaseAdmin } = makeSupabaseAdmin({ id: "user-1" }, null);
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await POST(makeRequest({ messageId: "message-1" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Messaggio non trovato.");
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a message that isn't in draft status", async () => {
    const { supabaseAdmin } = makeSupabaseAdmin({ id: "user-1" }, { ...BASE_MESSAGE, status: "sent" });
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

    const response = await POST(makeRequest({ messageId: "message-1" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Il messaggio non e in stato bozza.");
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("sends via Resend and flips the message to sent on the happy path", async () => {
    const { supabaseAdmin, messageUpdateEq, threadUpdateEq, deliveryInsert } = makeSupabaseAdmin(
      { id: "user-1" },
      BASE_MESSAGE
    );
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "resend-message-id" }),
    });

    const response = await POST(makeRequest({ messageId: "message-1" }));
    const payload = (await response.json()) as { status?: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("sent");
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
    expect(messageUpdateEq).toHaveBeenCalledWith("id", "message-1");
    expect(threadUpdateEq).toHaveBeenCalledWith("id", "thread-1");
    expect(deliveryInsert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "sent" }));
  });

  it("flips the message to failed when Resend rejects the send", async () => {
    const { supabaseAdmin, messageUpdateEq, deliveryInsert } = makeSupabaseAdmin({ id: "user-1" }, BASE_MESSAGE);
    mocks.createClientMock.mockReturnValue(supabaseAdmin);
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");
    mocks.fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: "Invalid recipient" } }),
    });

    const response = await POST(makeRequest({ messageId: "message-1" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(payload.error).toBe("Invalid recipient");
    expect(messageUpdateEq).toHaveBeenCalledWith("id", "message-1");
    expect(deliveryInsert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "failed" }));
  });
});
