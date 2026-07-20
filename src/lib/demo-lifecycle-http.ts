import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function resolveDemoLifecycleVersion(
  supabaseAdmin: SupabaseClient,
  dealerId: string
): Promise<{ ok: true; lifecycleVersion: number } | { ok: false; response: NextResponse }> {
  const subscriptionResult = await supabaseAdmin
    .from("dealer_demo_subscriptions")
    .select("dealer_id, lifecycle_version")
    .eq("dealer_id", dealerId)
    .maybeSingle<{ dealer_id: string; lifecycle_version: number | string }>();

  if (subscriptionResult.error) {
    return { ok: false, response: NextResponse.json({ error: "Errore lettura stato demo." }, { status: 500 }) };
  }

  if (!subscriptionResult.data) {
    return { ok: false, response: NextResponse.json({ error: "Errore lettura stato demo." }, { status: 404 }) };
  }

  const lifecycleVersion = Number(subscriptionResult.data.lifecycle_version);
  if (!Number.isFinite(lifecycleVersion)) {
    return { ok: false, response: NextResponse.json({ error: "Errore stato demo non valido." }, { status: 500 }) };
  }

  return { ok: true, lifecycleVersion };
}

export function toHttpStatusFromOutcome(outcome: string) {
  if (
    outcome === "DEMO_LIFECYCLE_CONFLICT" ||
    outcome === "DEMO_ACTIVATION_ATTEMPT_CONFLICT" ||
    outcome === "DEMO_ACTIVATION_ATTEMPT_MISMATCH" ||
    outcome === "DEMO_ACTIVATION_SEQUENCE_INVALID" ||
    outcome === "DEMO_ACTIVATION_INVALID_STATE" ||
    outcome === "DEMO_TRANSITION_NOT_ALLOWED" ||
    outcome === "DEMO_TERMINAL_STATE"
  ) {
    return 409;
  }

  if (
    outcome === "DEMO_NOT_FOUND" ||
    outcome === "DEMO_DEALER_NOT_FOUND" ||
    outcome === "DEMO_REQUEST_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    outcome === "DEMO_INVALID_INPUT" ||
    outcome === "DEMO_INVALID_ACTION" ||
    outcome === "DEMO_INVALID_REASON" ||
    outcome === "DEMO_INVALID_PLAN" ||
    outcome === "DEMO_PROFILE_INVALID"
  ) {
    return 400;
  }

  return 422;
}
