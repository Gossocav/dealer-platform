import type { SupabaseClient } from "@supabase/supabase-js";

type DealerMembershipRow = {
  dealer_id: string | null;
  status: string | null;
};

type ProfileDealerRow = {
  dealer_id: string | null;
};

type DealerStatusRow = {
  status: string | null;
};

export type DealerAccessState = "approved" | "pending_review" | "rejected" | "suspended" | "cancelled" | "unknown";

export type DealerAccessResult = {
  state: DealerAccessState;
  dealerId: string | null;
  membershipStatus: string | null;
  dealerStatus: string | null;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeRole(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  return text.length > 0 ? text : null;
}

function readRoleFromRecord(record: unknown) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const raw = record as Record<string, unknown>;

  return normalizeRole(raw.role ?? raw.profile ?? null);
}

export function resolveUserRoleFromMetadata(user: {
  app_metadata?: unknown;
  user_metadata?: unknown;
} | null | undefined) {
  return readRoleFromRecord(user?.app_metadata) ?? readRoleFromRecord(user?.user_metadata);
}

export function isPlatformAdminRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);

  return normalized === "admin" || normalized === "platform_owner";
}

export async function isDealerAccountApproved(supabase: SupabaseClient, userId: string) {
  const access = await getDealerAccessResult(supabase, userId);

  return access.state === "approved";
}

export async function getDealerAccessResult(supabase: SupabaseClient, userId: string): Promise<DealerAccessResult> {
  const membership = await supabase
    .from("dealer_users")
    .select("dealer_id, status")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DealerMembershipRow>();

  if (membership.error) {
    throw new Error(membership.error.message || "Errore controllo stato membership.");
  }

  const membershipStatus = normalizeText(membership.data?.status);
  let dealerId = normalizeDealerId(membership.data?.dealer_id);

  if (!dealerId) {
    const profile = await supabase.from("profiles").select("dealer_id").eq("id", userId).maybeSingle<ProfileDealerRow>();

    if (profile.error) {
      throw new Error(profile.error.message || "Errore controllo associazione dealer profilo.");
    }

    dealerId = normalizeDealerId(profile.data?.dealer_id);
  }

  if (!dealerId) {
    return {
      state: "unknown",
      dealerId: null,
      membershipStatus,
      dealerStatus: null,
    };
  }

  const dealer = await supabase.from("dealers").select("status").eq("id", dealerId).maybeSingle<DealerStatusRow>();

  if (dealer.error) {
    throw new Error(dealer.error.message || "Errore controllo stato dealer.");
  }

  const dealerStatus = normalizeText(dealer.data?.status);

  if (dealerStatus === "suspended") {
    return {
      state: "suspended",
      dealerId,
      membershipStatus,
      dealerStatus,
    };
  }

  if (dealerStatus === "cancelled") {
    return {
      state: "cancelled",
      dealerId,
      membershipStatus,
      dealerStatus,
    };
  }

  if (dealerStatus === "rejected") {
    return {
      state: "rejected",
      dealerId,
      membershipStatus,
      dealerStatus,
    };
  }

  if (dealerStatus === "pending_review") {
    return {
      state: "pending_review",
      dealerId,
      membershipStatus,
      dealerStatus,
    };
  }

  if (dealerStatus === "approved" && membershipStatus === "active") {
    return {
      state: "approved",
      dealerId,
      membershipStatus,
      dealerStatus,
    };
  }

  return {
    state: "unknown",
    dealerId,
    membershipStatus,
    dealerStatus,
  };
}