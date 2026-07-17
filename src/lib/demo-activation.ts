import {
  DEMO_LIMIT_KEYS,
  DEMO_MARKETING_SERVICE_KEYS,
  DEMO_MODULE_KEYS,
  validateDemoProfileConfiguration,
  type DemoLimits,
  type DemoMarketingServices,
  type DemoModules,
  type DemoProfileCode,
} from "@/lib/demo-profiles";

export type DemoActivationRequest = {
  id: string;
  dealershipName: string;
  contactName: string;
  email: string;
  phone: string | null;
  city: string | null;
  demoStatus: string | null;
  profileId: string | null;
  profileCode: string | null;
  priceMonthly: number | null;
  durationDays: number | null;
  modules: Record<string, unknown> | null;
  limits: Record<string, unknown> | null;
  marketingServices: Record<string, unknown> | null;
  linkedDealerId: string | null;
  authUserId: string | null;
};

export type DemoActivationRow = {
  id: string;
  status: string;
  demo_status: string;
  demo_started_at: string;
  demo_expires_at: string;
  activated_at: string;
  linked_dealer_id: string;
  demo_auth_user_id: string;
  demo_profile_code: DemoProfileCode;
};

export type DemoActivationReservation =
  | { outcome: "not_found" | "invalid_state" | "invalid_profile" | "busy" }
  | { outcome: "already_active"; request: DemoActivationRequest; activation: DemoActivationRow }
  | { outcome: "reserved"; request: DemoActivationRequest };

export type DemoActivationResult =
  | { ok: true; code: "activated" | "already_active"; activation: DemoActivationRow }
  | { ok: false; code: "not_found" | "invalid_state" | "invalid_profile" | "invalid_snapshot" | "busy" | "activation_failed"; status: number };

export type DemoActivationDependencies = {
  reserve(input: { requestId: string; actorId: string; attemptId: string }): Promise<DemoActivationReservation>;
  ensureAuthUser(input: { email: string; contactName: string; requestId: string }): Promise<{ userId: string }>;
  ensureDealer(input: { request: DemoActivationRequest; userId: string; attemptId: string }): Promise<{ dealerId: string }>;
  ensureMembership(input: { dealerId: string; userId: string; contactName: string }): Promise<void>;
  recordProgress(input: { requestId: string; attemptId: string; state: "auth_ready" | "tenant_ready" | "membership_ready"; userId?: string; dealerId?: string }): Promise<void>;
  finalize(input: { requestId: string; actorId: string; attemptId: string; userId: string; dealerId: string }): Promise<DemoActivationRow>;
  markFailed(input: { requestId: string; attemptId: string; errorCode: string }): Promise<void>;
};

function isCompleteRecord(value: Record<string, unknown> | null, keys: readonly string[]) {
  return Boolean(value) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function normalizeDemoActivationEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.includes("@") && email.length <= 320 ? email : null;
}

export function validateConfiguredDemoActivation(request: DemoActivationRequest) {
  const email = normalizeDemoActivationEmail(request.email);
  if (!email || !request.profileId || !request.profileCode || request.durationDays === null) return false;
  if (!isCompleteRecord(request.modules, DEMO_MODULE_KEYS) || !isCompleteRecord(request.limits, DEMO_LIMIT_KEYS) || !isCompleteRecord(request.marketingServices, DEMO_MARKETING_SERVICE_KEYS)) return false;

  const validation = validateDemoProfileConfiguration({
    profileCode: request.profileCode,
    priceMonthly: request.priceMonthly,
    durationDays: request.durationDays,
    moduleOverrides: request.modules,
    limitOverrides: request.limits,
    marketingServiceOverrides: request.marketingServices,
  });

  return validation.valid;
}

export async function activateConfiguredDemo(input: {
  requestId: string;
  actorId: string;
  attemptId: string;
  dependencies: DemoActivationDependencies;
}): Promise<DemoActivationResult> {
  const { dependencies } = input;
  const reservation = await dependencies.reserve(input);

  if (reservation.outcome === "not_found") return { ok: false, code: "not_found", status: 404 };
  if (reservation.outcome === "busy") return { ok: false, code: "busy", status: 409 };
  if (reservation.outcome === "invalid_state") return { ok: false, code: "invalid_state", status: 409 };
  if (reservation.outcome === "invalid_profile") return { ok: false, code: "invalid_profile", status: 409 };
  if (reservation.outcome === "already_active") return { ok: true, code: "already_active", activation: reservation.activation };
  if (reservation.outcome !== "reserved") return { ok: false, code: "activation_failed", status: 500 };

  if (!validateConfiguredDemoActivation(reservation.request)) {
    await dependencies.markFailed({ requestId: input.requestId, attemptId: input.attemptId, errorCode: "invalid_snapshot" });
    return { ok: false, code: "invalid_snapshot", status: 409 };
  }

  try {
    const email = normalizeDemoActivationEmail(reservation.request.email)!;
    const auth = reservation.request.authUserId
      ? { userId: reservation.request.authUserId }
      : await dependencies.ensureAuthUser({ email, contactName: reservation.request.contactName, requestId: input.requestId });

    await dependencies.recordProgress({ requestId: input.requestId, attemptId: input.attemptId, state: "auth_ready", userId: auth.userId });

    const dealer = reservation.request.linkedDealerId
      ? { dealerId: reservation.request.linkedDealerId }
      : await dependencies.ensureDealer({ request: reservation.request, userId: auth.userId, attemptId: input.attemptId });

    await dependencies.recordProgress({ requestId: input.requestId, attemptId: input.attemptId, state: "tenant_ready", userId: auth.userId, dealerId: dealer.dealerId });
    await dependencies.ensureMembership({ dealerId: dealer.dealerId, userId: auth.userId, contactName: reservation.request.contactName });
    await dependencies.recordProgress({ requestId: input.requestId, attemptId: input.attemptId, state: "membership_ready", userId: auth.userId, dealerId: dealer.dealerId });

    const activation = await dependencies.finalize({ requestId: input.requestId, actorId: input.actorId, attemptId: input.attemptId, userId: auth.userId, dealerId: dealer.dealerId });
    return { ok: true, code: "activated", activation };
  } catch (error) {
    const errorCode = error instanceof DemoActivationError ? error.code : "unexpected_error";
    await dependencies.markFailed({ requestId: input.requestId, attemptId: input.attemptId, errorCode }).catch(() => undefined);
    return { ok: false, code: "activation_failed", status: 500 };
  }
}

export class DemoActivationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DemoActivationError";
  }
}

export type { DemoLimits, DemoMarketingServices, DemoModules };
