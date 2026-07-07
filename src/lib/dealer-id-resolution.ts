import type { SupabaseClient } from "@supabase/supabase-js";

type DealerMembershipRow = {
  dealer_id: string | null;
};

type ResolveDealerIdOptions = {
  activeDealerId?: string | null;
};

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "undefined") {
    return null;
  }

  return text;
}

function isMissingColumnError(message: string | undefined, columnName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}

function isMissingRelationError(message: string | undefined, relationName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(relationName.toLowerCase()) && (text.includes("relation") || text.includes("does not exist"));
}

export async function resolveDealerIdFromTenantSources(
  supabase: SupabaseClient,
  userId: string,
  options?: ResolveDealerIdOptions
) {
  const membership = await supabase
    .from("dealer_users")
    .select("dealer_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .returns<DealerMembershipRow[]>();

  if (membership.error) {
    const dealerUsersMissing = isMissingRelationError(membership.error.message, "dealer_users");
    const statusMissing = isMissingColumnError(membership.error.message, "status");
    const createdAtMissing = isMissingColumnError(membership.error.message, "created_at");

    if (dealerUsersMissing || statusMissing || createdAtMissing) {
      throw new Error("Schema identity non allineato: dealer_users con status/created_at e obbligatoria.");
    }

    throw new Error(membership.error.message || "Errore lookup dealer nella membership utente.");
  }

  const activeMembershipDealerIds = Array.from(
    new Set((membership.data ?? []).map((row) => normalizeDealerId(row.dealer_id)).filter((value): value is string => Boolean(value)))
  );

  if (activeMembershipDealerIds.length === 0) {
    return null;
  }

  const requestedActiveDealerId = normalizeDealerId(options?.activeDealerId);

  if (requestedActiveDealerId) {
    return activeMembershipDealerIds.includes(requestedActiveDealerId) ? requestedActiveDealerId : null;
  }

  if (activeMembershipDealerIds.length === 1) {
    return activeMembershipDealerIds[0];
  }

  return null;
}
