import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getDealerAccessResult, type DealerAccessResult } from "@/lib/account-approval";

type ServerDealerAccessResult = DealerAccessResult & {
  userId: string | null;
};

function resolveAccessTokenFromCookieValue(rawValue: string | undefined) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return null;

  const candidates = new Set<string>();
  candidates.add(raw);

  try {
    candidates.add(decodeURIComponent(raw));
  } catch {
    // ignore decode errors
  }

  for (const candidate of [...candidates]) {
    if (!candidate.startsWith("base64-")) continue;

    const encoded = candidate.slice("base64-".length);
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");

    try {
      candidates.add(Buffer.from(base64, "base64").toString("utf8"));
    } catch {
      // ignore decode errors
    }
  }

  const extractJwtToken = (value: string) => {
    const jwtMatch = value.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    return jwtMatch ? jwtMatch[0] : null;
  };

  for (const value of candidates) {
    const directJwt = extractJwtToken(value);
    if (directJwt) return directJwt;

    try {
      const parsed = JSON.parse(value) as unknown;

      if (Array.isArray(parsed)) {
        const first = String(parsed[0] ?? "").trim();
        const token = extractJwtToken(first) ?? (first.length > 0 ? first : null);
        if (token) return token;
      }

      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const tokenText = String(record.access_token ?? record.accessToken ?? "").trim();
        const token = extractJwtToken(tokenText) ?? (tokenText.length > 0 ? tokenText : null);
        if (token) return token;
      }
    } catch {
      // ignore parse errors and continue
    }
  }

  return null;
}

async function resolveAccessTokenFromCookies() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  const preferredNames = ["sb-access-token", "supabase-auth-token"];
  for (const name of preferredNames) {
    const hit = allCookies.find((cookie) => cookie.name === name);
    const token = resolveAccessTokenFromCookieValue(hit?.value);
    if (token) return token;
  }

  for (const cookie of allCookies) {
    if (!cookie.name.includes("auth-token")) continue;

    const token = resolveAccessTokenFromCookieValue(cookie.value);
    if (token) return token;
  }

  return null;
}

export async function resolveServerDealerAccess(): Promise<ServerDealerAccessResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[server-dealer-access] Missing Supabase server env vars");
    return {
      state: "unknown",
      userId: null,
      dealerId: null,
      membershipStatus: null,
      dealerStatus: null,
    };
  }

  const accessToken = await resolveAccessTokenFromCookies();
  if (!accessToken) {
    console.error("[server-dealer-access] Missing/invalid access token from cookies");
    return {
      state: "unknown",
      userId: null,
      dealerId: null,
      membershipStatus: null,
      dealerStatus: null,
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) {
    console.error("[server-dealer-access] auth.getUser failed", {
      error: error?.message ?? null,
    });
    return {
      state: "unknown",
      userId: null,
      dealerId: null,
      membershipStatus: null,
      dealerStatus: null,
    };
  }

  const dealerAccess = await getDealerAccessResult(supabaseAdmin, user.id);

  console.info("[server-dealer-access] resolved", {
    profile_id: user.id,
    dealer_id: dealerAccess.dealerId,
    dealer_status: dealerAccess.dealerStatus,
    membership_status: dealerAccess.membershipStatus,
    state: dealerAccess.state,
  });

  return {
    ...dealerAccess,
    userId: user.id,
  };
}
