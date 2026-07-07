import { createHmac, timingSafeEqual } from "node:crypto";

const PUBLIC_NOTE_PREFIXES = ["[PUBBLICA]", "[PUBBLICO]", "[PUBLIC]"] as const;

export function normalizePortalEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function extractPublicNotes(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];

  const notes: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const normalized = trimmed.toUpperCase();
    const matchedPrefix = PUBLIC_NOTE_PREFIXES.find((prefix) => normalized.startsWith(prefix));
    if (!matchedPrefix) continue;

    const content = trimmed.slice(matchedPrefix.length).trim();
    if (content) {
      notes.push(content);
    }
  }

  return notes;
}

function toBuffer(value: string) {
  return Buffer.from(value, "utf8");
}

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function getSignaturePayload(leadId: string, email: string) {
  return `${leadId.trim()}:${normalizePortalEmail(email)}`;
}

export function createClientPortalToken(params: { leadId: string; email: string; secret: string }) {
  const payload = getSignaturePayload(params.leadId, params.email);
  const signature = createHmac("sha256", params.secret).update(payload).digest();
  return toBase64Url(signature);
}

export function verifyClientPortalToken(params: { leadId: string; email: string; token: string; secret: string }) {
  const normalizedToken = String(params.token ?? "").trim();
  if (!normalizedToken) return false;

  const expected = createClientPortalToken({
    leadId: params.leadId,
    email: params.email,
    secret: params.secret,
  });

  try {
    const left = toBuffer(expected);
    const right = toBuffer(normalizedToken);

    if (left.length !== right.length) {
      return false;
    }

    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
