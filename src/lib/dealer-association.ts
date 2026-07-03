import { supabase } from "@/lib/supabaseClient";

type DealerIdRow = {
  id: string;
};

type ProfileDealerRow = {
  dealer_id: string | null;
};

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    return null;
  }

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

export async function resolveDealerIdForUser(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("dealer_id")
    .eq("id", userId)
    .maybeSingle<ProfileDealerRow>();

  if (profileError) {
    throw new Error(profileError.message || "Errore lookup dealer nel profilo.");
  }

  const dealerIdFromProfile = normalizeDealerId(profile?.dealer_id);
  if (dealerIdFromProfile) {
    return dealerIdFromProfile;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message || "Errore lookup dealer nei metadata utente.");
  }

  if (user?.id === userId) {
    const dealerIdFromAppMetadata = normalizeDealerId((user.app_metadata as Record<string, unknown> | undefined)?.dealer_id);
    if (dealerIdFromAppMetadata) {
      return dealerIdFromAppMetadata;
    }

    const dealerIdFromUserMetadata = normalizeDealerId((user.user_metadata as Record<string, unknown> | undefined)?.dealer_id);
    if (dealerIdFromUserMetadata) {
      return dealerIdFromUserMetadata;
    }
  }

  const { data: byUser, error: byUserError } = await supabase
    .from("dealers")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<DealerIdRow>();

  if (!byUserError && byUser?.id) {
    return byUser.id;
  }

  if (byUserError && !isMissingColumnError(byUserError.message, "user_id")) {
    throw new Error(byUserError.message || "Errore lookup dealer per user_id.");
  }

  return null;
}
