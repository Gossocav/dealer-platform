import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getDealerAccessResult, type DealerAccessResult } from "@/lib/account-approval";

type ServerDealerAccessResult = DealerAccessResult & {
  userId: string | null;
};

function resolveAccessTokenFromCookieValue(rawValue: string | undefined) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      const first = String(parsed[0] ?? "").trim();
      return first.length > 0 ? first : null;
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const token = String(record.access_token ?? record.accessToken ?? "").trim();
      return token.length > 0 ? token : null;
    }
  } catch {
    // fallback below
  }

  return value.length > 0 ? value : null;
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
    return {
      state: "unknown",
      userId: null,
      dealerId: null,
      membershipStatus: null,
      dealerStatus: null,
    };
  }

  const dealerAccess = await getDealerAccessResult(supabaseAdmin, user.id);

  return {
    ...dealerAccess,
    userId: user.id,
  };
}
