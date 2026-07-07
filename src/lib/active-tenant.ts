const ACTIVE_DEALER_STORAGE_KEY = "dp.activeDealerId";

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "undefined") {
    return null;
  }

  return text;
}

function canUseWindow() {
  return typeof window !== "undefined";
}

export function getActiveDealerId() {
  if (!canUseWindow()) {
    return null;
  }

  return normalizeDealerId(window.localStorage.getItem(ACTIVE_DEALER_STORAGE_KEY));
}

export function setActiveDealerId(value: string | null) {
  if (!canUseWindow()) {
    return;
  }

  const normalized = normalizeDealerId(value);
  if (!normalized) {
    window.localStorage.removeItem(ACTIVE_DEALER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_DEALER_STORAGE_KEY, normalized);
}

export function buildActiveDealerHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  const activeDealerId = getActiveDealerId();

  if (activeDealerId) {
    headers.set("x-active-dealer-id", activeDealerId);
  }

  return headers;
}
