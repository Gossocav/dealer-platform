import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type ProfileRow = {
  id: string;
  role: string | null;
  dealer_id: string | null;
};

type DealerUserRow = {
  dealer_id: string | null;
};

type DealerRow = {
  status: string | null;
  account_type: string | null;
  demo_status: string | null;
  demo_expires_at: string | null;
};

type ResolvedRoute = "/admin" | "/account/sospeso" | "/account/in-attesa" | "/account/demo-scaduta" | `/account/demo-scaduta?status=${string}` | "/dashboard";

type ResolvePayload = {
  status: string;
  route: ResolvedRoute;
};

function extractBearerToken(value: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = String(match[1] ?? "").trim();
  return token.length > 0 ? token : null;
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function normalizeRole(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  return text.length > 0 ? text : null;
}

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

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

function isPlatformAdminRole(role: string | null) {
  return role === "admin" || role === "platform_owner";
}

function mapDealerRoute(dealerStatus: string | null): ResolvePayload | null {
  if (dealerStatus === "suspended" || dealerStatus === "cancelled") {
    return { status: dealerStatus, route: "/account/sospeso" };
  }

  if (dealerStatus === "pending_review" || dealerStatus === "rejected") {
    return { status: dealerStatus, route: "/account/in-attesa" };
  }

  if (dealerStatus === "approved") {
    return { status: "approved", route: "/dashboard" };
  }

  return null;
}

function isDemoExpired(demoExpiresAt: string | null) {
  if (!demoExpiresAt) return false;
  const expiresAt = Date.parse(demoExpiresAt);
  return Number.isFinite(expiresAt) ? Date.now() > expiresAt : false;
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = extractBearerToken(authorizationHeader);
  const accessToken = bearerToken ?? (await resolveAccessTokenFromCookies());
  if (!accessToken) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
  }

  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("id, role, dealer_id")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileResult.error) {
    console.error("[account-resolve-route] profile lookup error", {
      user_id: user.id,
      email: user.email ?? null,
      error: profileResult.error.message,
    });
    return NextResponse.json({ error: "Errore risoluzione profilo." }, { status: 500 });
  }

  const profileRole = normalizeRole(profileResult.data?.role ?? null);
  const profileDealerId = normalizeDealerId(profileResult.data?.dealer_id);

  if (isPlatformAdminRole(profileRole)) {
    const payload: ResolvePayload = {
      status: "admin",
      route: "/admin",
    };

    console.info("[account-resolve-route] resolved", {
      user_id: user.id,
      email: user.email ?? null,
      profile_role: profileRole,
      profile_dealer_id: profileDealerId,
      dealer_users_dealer_id: null,
      dealers_status: null,
      route: payload.route,
    });

    return NextResponse.json(payload, { status: 200 });
  }

  let dealerUsersDealerId: string | null = null;

  if (!profileDealerId) {
    const dealerUserResult = await supabaseAdmin
      .from("dealer_users")
      .select("dealer_id")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DealerUserRow>();

    if (dealerUserResult.error) {
      console.error("[account-resolve-route] dealer_users lookup error", {
        user_id: user.id,
        email: user.email ?? null,
        profile_role: profileRole,
        profile_dealer_id: profileDealerId,
        error: dealerUserResult.error.message,
      });
      return NextResponse.json({ error: "Errore risoluzione dealer." }, { status: 500 });
    }

    dealerUsersDealerId = normalizeDealerId(dealerUserResult.data?.dealer_id);
  }

  const resolvedDealerId = profileDealerId ?? dealerUsersDealerId;

  if (!resolvedDealerId) {
    console.warn("[account-resolve-route] unresolved without dealer id", {
      user_id: user.id,
      email: user.email ?? null,
      profile_role: profileRole,
      profile_dealer_id: profileDealerId,
      dealer_users_dealer_id: dealerUsersDealerId,
      dealers_status: null,
      route: null,
    });
    return NextResponse.json({ error: "Stato account non risolvibile." }, { status: 409 });
  }

  const dealerResult = await supabaseAdmin
    .from("dealers")
    .select("status, account_type, demo_status, demo_expires_at")
    .eq("id", resolvedDealerId)
    .maybeSingle<DealerRow>();

  if (dealerResult.error) {
    console.error("[account-resolve-route] dealer status lookup error", {
      user_id: user.id,
      email: user.email ?? null,
      profile_role: profileRole,
      profile_dealer_id: profileDealerId,
      dealer_users_dealer_id: dealerUsersDealerId,
      error: dealerResult.error.message,
    });
    return NextResponse.json({ error: "Errore lettura stato dealer." }, { status: 500 });
  }

  const dealerStatus = normalizeText(dealerResult.data?.status);
  const accountType = normalizeText(dealerResult.data?.account_type);
  const demoStatus = normalizeText(dealerResult.data?.demo_status);
  const demoExpiresAt = dealerResult.data?.demo_expires_at ?? null;
  const isDemoAccount = accountType === "demo";
  const demoReadOnly = isDemoAccount && (["revoked", "expired", "suspended"].includes(demoStatus ?? "") || isDemoExpired(demoExpiresAt));

  if (dealerStatus === "approved" && demoReadOnly) {
    const payload: ResolvePayload = {
      status: demoStatus === "revoked" ? "demo_revoked" : demoStatus === "suspended" ? "demo_suspended" : "demo_expired",
      route: `/account/demo-scaduta?status=${demoStatus === "revoked" ? "revoked" : demoStatus === "suspended" ? "suspended" : "expired"}`,
    };

    console.info("[account-resolve-route] resolved", {
      user_id: user.id,
      email: user.email ?? null,
      profile_role: profileRole,
      profile_dealer_id: profileDealerId,
      dealer_users_dealer_id: dealerUsersDealerId,
      dealers_status: dealerStatus,
      account_type: accountType,
      demo_status: demoStatus,
      demo_expires_at: demoExpiresAt,
      route: payload.route,
    });

    return NextResponse.json(payload, { status: 200 });
  }

  const payload = mapDealerRoute(dealerStatus);

  if (!payload) {
    console.warn("[account-resolve-route] unresolved dealer status", {
      user_id: user.id,
      email: user.email ?? null,
      profile_role: profileRole,
      profile_dealer_id: profileDealerId,
      dealer_users_dealer_id: dealerUsersDealerId,
      dealers_status: dealerStatus,
      route: null,
    });
    return NextResponse.json({ error: "Stato dealer non supportato." }, { status: 409 });
  }

  console.info("[account-resolve-route] resolved", {
    user_id: user.id,
    email: user.email ?? null,
    profile_role: profileRole,
    profile_dealer_id: profileDealerId,
    dealer_users_dealer_id: dealerUsersDealerId,
    dealers_status: dealerStatus,
    account_type: accountType,
    demo_status: demoStatus,
    demo_expires_at: demoExpiresAt,
    route: payload.route,
  });

  return NextResponse.json(payload, { status: 200 });
}
