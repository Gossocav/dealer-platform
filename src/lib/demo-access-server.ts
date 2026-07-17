import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDemoAccessContext, DemoAccessError, type DemoAccessContext } from "@/lib/demo-access";
import { normalizeDemoProfileCode } from "@/lib/demo-profiles";

type MembershipRow = { dealer_id: string; profile_id: string; role: string | null; status: string | null };
type DealerRow = { id: string; account_type: string | null; demo_status: string | null; demo_started_at: string | null; demo_expires_at: string | null; demo_request_id: string | null };
type RequestRow = {
  id: string; linked_dealer_id: string | null; demo_auth_user_id: string | null;
  demo_profile_code: string | null; demo_modules: unknown; demo_limits: unknown;
  demo_marketing_services: unknown; activation_state: string | null;
};

export async function resolveServerDemoAccessContext(input: {
  supabase: SupabaseClient;
  userId: string;
  requestedDealerId?: string | null;
}): Promise<DemoAccessContext> {
  const memberships = await input.supabase.from("dealer_users")
    .select("dealer_id, profile_id, role, status")
    .eq("profile_id", input.userId)
    .eq("status", "active")
    .returns<MembershipRow[]>();
  if (memberships.error) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);

  const requested = String(input.requestedDealerId ?? "").trim() || null;
  const membership = requested
    ? (memberships.data ?? []).find((item) => item.dealer_id === requested)
    : (memberships.data ?? []).length === 1 ? memberships.data?.[0] : null;
  if (!membership || membership.profile_id !== input.userId) throw new DemoAccessError("DEMO_MEMBERSHIP_INVALID", 403);

  const dealerResult = await input.supabase.from("dealers")
    .select("id, account_type, demo_status, demo_started_at, demo_expires_at, demo_request_id")
    .eq("id", membership.dealer_id).maybeSingle<DealerRow>();
  if (dealerResult.error || !dealerResult.data?.id) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  const dealer = dealerResult.data;

  if (String(dealer.account_type ?? "").toLowerCase() !== "demo") {
    return buildDemoAccessContext({
      accountType: dealer.account_type, demoStatus: dealer.demo_status,
      profileCode: null, dealerId: dealer.id, profileId: membership.profile_id, userId: input.userId,
      membershipRole: membership.role, membershipActive: true, startedAt: dealer.demo_started_at,
      expiresAt: dealer.demo_expires_at, modules: {}, limits: {}, marketingServices: {}, provisioningComplete: true,
      tenantMatches: true,
    });
  }

  if (!dealer.demo_request_id) throw new DemoAccessError("DEMO_PROVISIONING_INCOMPLETE", 422);
  const requestResult = await input.supabase.from("demo_requests")
    .select("id, linked_dealer_id, demo_auth_user_id, demo_profile_code, demo_modules, demo_limits, demo_marketing_services, activation_state")
    .eq("id", dealer.demo_request_id).maybeSingle<RequestRow>();
  if (requestResult.error || !requestResult.data) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  const snapshot = requestResult.data;

  return buildDemoAccessContext({
    accountType: dealer.account_type, demoStatus: dealer.demo_status,
    profileCode: normalizeDemoProfileCode(snapshot.demo_profile_code), dealerId: dealer.id,
    profileId: membership.profile_id, userId: input.userId, membershipRole: membership.role,
    membershipActive: membership.status === "active", startedAt: dealer.demo_started_at,
    expiresAt: dealer.demo_expires_at, modules: snapshot.demo_modules, limits: snapshot.demo_limits,
    marketingServices: snapshot.demo_marketing_services,
    provisioningComplete: snapshot.activation_state === "completed" && snapshot.linked_dealer_id === dealer.id && snapshot.demo_auth_user_id === input.userId,
    tenantMatches: snapshot.linked_dealer_id === dealer.id,
  });
}

export async function resolveDealerDemoAccessContext(supabase: SupabaseClient, dealerId: string): Promise<DemoAccessContext> {
  const dealerResult = await supabase.from("dealers")
    .select("id, account_type, demo_status, demo_started_at, demo_expires_at, demo_request_id")
    .eq("id", dealerId).maybeSingle<DealerRow>();
  if (dealerResult.error || !dealerResult.data) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  const dealer = dealerResult.data;
  if (String(dealer.account_type ?? "").toLowerCase() !== "demo") {
    return buildDemoAccessContext({ accountType: dealer.account_type, demoStatus: dealer.demo_status, profileCode: null, dealerId,
      profileId: null, userId: null, membershipRole: null, membershipActive: true, startedAt: dealer.demo_started_at,
      expiresAt: dealer.demo_expires_at, modules: {}, limits: {}, marketingServices: {}, provisioningComplete: true, tenantMatches: true });
  }
  if (!dealer.demo_request_id) throw new DemoAccessError("DEMO_PROVISIONING_INCOMPLETE", 422);
  const requestResult = await supabase.from("demo_requests")
    .select("id, linked_dealer_id, demo_auth_user_id, demo_profile_code, demo_modules, demo_limits, demo_marketing_services, activation_state")
    .eq("id", dealer.demo_request_id).maybeSingle<RequestRow>();
  const snapshot = requestResult.data;
  if (requestResult.error || !snapshot?.demo_auth_user_id) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  const membership = await supabase.from("dealer_users").select("dealer_id, profile_id, role, status")
    .eq("dealer_id", dealerId).eq("profile_id", snapshot.demo_auth_user_id).eq("status", "active").maybeSingle<MembershipRow>();
  return buildDemoAccessContext({ accountType: dealer.account_type, demoStatus: dealer.demo_status,
    profileCode: normalizeDemoProfileCode(snapshot.demo_profile_code), dealerId, profileId: snapshot.demo_auth_user_id,
    userId: snapshot.demo_auth_user_id, membershipRole: membership.data?.role ?? null,
    membershipActive: !membership.error && membership.data?.status === "active", startedAt: dealer.demo_started_at,
    expiresAt: dealer.demo_expires_at, modules: snapshot.demo_modules, limits: snapshot.demo_limits,
    marketingServices: snapshot.demo_marketing_services,
    provisioningComplete: snapshot.activation_state === "completed" && snapshot.linked_dealer_id === dealerId,
    tenantMatches: snapshot.linked_dealer_id === dealerId });
}
