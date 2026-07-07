import type { SupabaseClient } from "@supabase/supabase-js";

type DealerMembershipRow = {
  dealer_id: string | null;
  status: string | null;
};

type DealerStatusRow = {
  status: string | null;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function isDealerAccountApproved(supabase: SupabaseClient, userId: string) {
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
  const dealerId = normalizeDealerId(membership.data?.dealer_id);

  if (membershipStatus !== "active" || !dealerId) {
    return false;
  }

  const dealer = await supabase.from("dealers").select("status").eq("id", dealerId).maybeSingle<DealerStatusRow>();

  if (dealer.error) {
    throw new Error(dealer.error.message || "Errore controllo stato dealer.");
  }

  return normalizeText(dealer.data?.status) === "approved";
}