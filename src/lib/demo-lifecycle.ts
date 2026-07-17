export const DEMO_LIFECYCLE_STATUSES = [
  "not_configured", "configured", "ready_for_activation", "active",
  "expired", "suspended", "revoked", "converted",
] as const;

export type DemoLifecycleStatus = (typeof DEMO_LIFECYCLE_STATUSES)[number];
export type DemoLifecycleAction = "suspend_demo" | "reactivate_demo" | "revoke_demo" | "convert_demo";
export type DemoLifecycleErrorCode =
  | "DEMO_TRANSITION_NOT_ALLOWED"
  | "DEMO_REACTIVATION_INVALID"
  | "DEMO_CONVERSION_INVALID"
  | "DEMO_LIFECYCLE_CONFLICT";

const TRANSITIONS: Readonly<Record<DemoLifecycleStatus, readonly DemoLifecycleStatus[]>> = {
  not_configured: [],
  configured: ["active"],
  ready_for_activation: ["active"],
  active: ["expired", "suspended", "revoked", "converted"],
  suspended: ["active", "revoked", "converted"],
  expired: ["active", "revoked", "converted"],
  revoked: [],
  converted: [],
};

export class DemoLifecycleError extends Error {
  constructor(public readonly code: DemoLifecycleErrorCode, public readonly status: number) {
    super(code);
    this.name = "DemoLifecycleError";
  }
}

export function normalizeDemoLifecycleStatus(value: unknown): DemoLifecycleStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (DEMO_LIFECYCLE_STATUSES as readonly string[]).includes(normalized)
    ? normalized as DemoLifecycleStatus
    : null;
}

export function canTransitionDemoStatus(from: unknown, to: unknown): boolean {
  const source = normalizeDemoLifecycleStatus(from);
  const target = normalizeDemoLifecycleStatus(to);
  return Boolean(source && target && TRANSITIONS[source].includes(target));
}

export function assertDemoStatusTransition(from: unknown, to: unknown): void {
  if (!canTransitionDemoStatus(from, to)) {
    throw new DemoLifecycleError("DEMO_TRANSITION_NOT_ALLOWED", 409);
  }
}

export function normalizeDemoLifecycleReason(value: unknown): string | null {
  const reason = String(value ?? "").trim().replace(/\s+/g, " ");
  return reason.length >= 3 && reason.length <= 500 ? reason : null;
}

export function normalizeDemoReactivationDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30 ? value : null;
}

export function calculateDemoExpiration(startedAt: Date, durationDays: number): Date {
  const duration = normalizeDemoReactivationDuration(durationDays);
  if (!duration || !Number.isFinite(startedAt.getTime())) {
    throw new DemoLifecycleError("DEMO_REACTIVATION_INVALID", 422);
  }
  return new Date(startedAt.getTime() + duration * 86_400_000);
}

export function getDemoLifecycleActions(status: unknown): readonly DemoLifecycleAction[] {
  const normalized = normalizeDemoLifecycleStatus(status);
  if (normalized === "active") return ["suspend_demo", "revoke_demo", "convert_demo"];
  if (normalized === "suspended" || normalized === "expired") return ["reactivate_demo", "revoke_demo", "convert_demo"];
  return [];
}

export function safeEqualSecret(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(provided);
  const right = encoder.encode(expected);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function lifecycleHttpStatus(code: string): number {
  if (code === "DEMO_REACTIVATION_INVALID" || code === "DEMO_CONVERSION_INVALID") return 422;
  return 409;
}
