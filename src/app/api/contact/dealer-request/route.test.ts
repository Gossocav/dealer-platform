import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAdminNotificationEmailMock: vi.fn(),
  hitRateLimitMock: vi.fn(),
  createClientMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/lib/admin-notification-email", () => ({
  sendAdminNotificationEmail: mocks.sendAdminNotificationEmailMock,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimitMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

import { POST } from "./route";

const validBody = {
  companyName: "Auto Rossi",
  contactName: "Mario Rossi",
  email: "Mario@AutoRossi.IT",
  phone: "0521 123456",
  message: "Vorrei sapere le differenze fra Pro ed Elite.",
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/contact/dealer-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

  mocks.hitRateLimitMock.mockReturnValue({ limited: false, remaining: 4, resetAt: Date.now() + 1000 });
  mocks.sendAdminNotificationEmailMock.mockResolvedValue({ ok: true, id: "email-1" });

  mocks.insertMock.mockResolvedValue({ error: null });
  mocks.createClientMock.mockReturnValue({
    from: vi.fn(() => ({ insert: mocks.insertMock })),
  });
});

describe("dealer info request route", () => {
  it("persists the request and sends the admin notification", async () => {
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
    expect(mocks.insertMock.mock.calls[0][0]).toMatchObject({
      company_name: "Auto Rossi",
      contact_name: "Mario Rossi",
      email: "mario@autorossi.it",
      phone: "0521 123456",
    });

    expect(mocks.sendAdminNotificationEmailMock).toHaveBeenCalledTimes(1);
    const payload = mocks.sendAdminNotificationEmailMock.mock.calls[0][0];
    expect(payload.subject).toContain("Auto Rossi");
    expect(payload.html).toContain("Mario Rossi");
  });

  it("escapes HTML so a message cannot inject markup into the email", async () => {
    await POST(makeRequest({ ...validBody, message: "<script>alert(1)</script>" }));

    const payload = mocks.sendAdminNotificationEmailMock.mock.calls[0][0];
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });

  it.each([
    ["companyName", { ...validBody, companyName: "  " }],
    ["contactName", { ...validBody, contactName: "" }],
    ["phone", { ...validBody, phone: "" }],
    ["message", { ...validBody, message: "   " }],
  ])("rejects a missing %s with 400", async (_field, body) => {
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.insertMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with 400", async () => {
    const response = await POST(makeRequest({ ...validBody, email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("rejects an over-long message with 400", async () => {
    const response = await POST(makeRequest({ ...validBody, message: "x".repeat(4001) }));

    expect(response.status).toBe(400);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("silently drops a honeypot submission without saving or emailing", async () => {
    const response = await POST(makeRequest({ ...validBody, websiteTrap: "http://spam.example" }));

    expect(response.status).toBe(200);
    expect(mocks.insertMock).not.toHaveBeenCalled();
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mocks.hitRateLimitMock.mockReturnValue({ limited: true, remaining: 0, resetAt: Date.now() + 1000 });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(429);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("fails the request when the database insert fails (the row is the record of the enquiry)", async () => {
    mocks.insertMock.mockResolvedValue({ error: { code: "23505", message: "boom" } });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("info@keyauto.it");
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("still succeeds when the request is saved but the notification email fails (best effort)", async () => {
    mocks.sendAdminNotificationEmailMock.mockResolvedValue({ ok: false, reason: "provider_error" });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 on a malformed JSON body", async () => {
    const response = await POST(
      new Request("http://localhost/api/contact/dealer-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      })
    );

    expect(response.status).toBe(400);
  });
});
