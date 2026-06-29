import { supabase } from "@/lib/supabaseClient";

type DealerIdRow = {
  id: string;
};

type ProfileDealerRow = {
  dealer_id: string | null;
};

function isMissingColumnError(message: string | undefined, columnName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}

export async function resolveDealerIdForUser(userId: string) {
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("dealer_id")
    .eq("id", userId)
    .maybeSingle<ProfileDealerRow>();

  if (profileError) {
    throw new Error(profileError.message || "Errore lookup dealer nel profilo.");
  }

  return profile?.dealer_id ?? null;
}
