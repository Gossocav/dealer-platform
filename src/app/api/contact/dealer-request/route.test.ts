import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAdminNotificationEmailMock: vi.fn(),
  hitRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/admin-notification-email", () => ({
  sendAdminNotificationEmail: mocks.sendAdminNotificationEmailMock,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimitMock,
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
  mocks.hitRateLimitMock.mockReturnValue({ limited: false, remaining: 4, resetAt: Date.now() + 1000 });
  mocks.sendAdminNotificationEmailMock.mockResolvedValue({ ok: true, id: "email-1" });
});

describe("dealer info request route", () => {
  it("sends the admin notification and confirms", async () => {
    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(mocks.sendAdminNotificationEmailMock).toHaveBeenCalledTimes(1);

    const payload = mocks.sendAdminNotificationEmailMock.mock.calls[0][0];
    expect(payload.subject).toContain("Auto Rossi");
    expect(payload.html).toContain("Mario Rossi");
    // Email is normalized to lowercase before being reported.
    expect(payload.html).toContain("mario@autorossi.it");
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
    ["message", { ...validBody, message: "   " }],
  ])("rejects a missing %s with 400", async (_field, body) => {
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with 400", async () => {
    const response = await POST(makeRequest({ ...validBody, email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("accepts a missing phone (optional field)", async () => {
    const response = await POST(makeRequest({ ...validBody, phone: "" }));

    expect(response.status).toBe(200);
    expect(mocks.sendAdminNotificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an over-long message with 400", async () => {
    const response = await POST(makeRequest({ ...validBody, message: "x".repeat(4001) }));

    expect(response.status).toBe(400);
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("silently drops a honeypot submission without emailing", async () => {
    const response = await POST(makeRequest({ ...validBody, websiteTrap: "http://spam.example" }));

    expect(response.status).toBe(200);
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mocks.hitRateLimitMock.mockReturnValue({ limited: true, remaining: 0, resetAt: Date.now() + 1000 });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(429);
    expect(mocks.sendAdminNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("surfaces a provider failure as 502 instead of a false success", async () => {
    mocks.sendAdminNotificationEmailMock.mockResolvedValue({ ok: false, reason: "provider_error" });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("info@keyauto.it");
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
