import { DemoAccessError, requireDemoOperational, type DemoAccessContext } from "@/lib/demo-access";

export type DemoLimitResource = "users" | "vehicles" | "leads" | "clients" | "appointments" | "storage";
const LIMIT_KEYS = {
  users: "max_users", vehicles: "max_vehicles", leads: "max_leads",
  clients: "max_clients", appointments: "max_appointments", storage: "max_storage_mb",
} as const;

export type DemoLimitResult = { allowed: true; remaining: number | null } | { allowed: false; error: DemoAccessError };

export function countActiveDealerMemberships(rows: Array<{ dealerId: string; status: string | null }>, dealerId: string) {
  return rows.filter((row) => row.dealerId === dealerId && row.status === "active").length;
}

export function checkDemoLimit(input: { context: DemoAccessContext; resource: DemoLimitResource; currentUsage: number; increment: number }): DemoLimitResult {
  if (!input.context.isDemo) return { allowed: true, remaining: null };
  try { requireDemoOperational(input.context); }
  catch (error) { return { allowed: false, error: error instanceof DemoAccessError ? error : new DemoAccessError("DEMO_CONTEXT_INVALID", 422) }; }
  if (!Number.isFinite(input.currentUsage) || input.currentUsage < 0 || !Number.isInteger(input.currentUsage) || !Number.isFinite(input.increment) || !Number.isInteger(input.increment) || input.increment < 0) {
    return { allowed: false, error: new DemoAccessError("DEMO_CONTEXT_INVALID", 422) };
  }
  const limit = input.context.limits[LIMIT_KEYS[input.resource]];
  if (typeof limit !== "number" || !Number.isFinite(limit) || !Number.isInteger(limit) || limit < 0) return { allowed: false, error: new DemoAccessError("DEMO_CONTEXT_INVALID", 422) };
  if (input.currentUsage + input.increment > limit) return { allowed: false, error: new DemoAccessError(input.resource === "storage" ? "DEMO_STORAGE_LIMIT_REACHED" : "DEMO_LIMIT_REACHED", 409) };
  return { allowed: true, remaining: Math.max(0, limit - input.currentUsage - input.increment) };
}

export function checkDemoStorageLimit(input: { context: DemoAccessContext; currentBytes: number; newBytes: number }) {
  if (!Number.isFinite(input.currentBytes) || !Number.isFinite(input.newBytes) || input.currentBytes < 0 || input.newBytes < 0) return { allowed: false as const, error: new DemoAccessError("DEMO_CONTEXT_INVALID", 422) };
  if (!input.context.isDemo) return { allowed: true as const, remaining: null };
  try { requireDemoOperational(input.context); } catch (error) { return { allowed: false as const, error: error instanceof DemoAccessError ? error : new DemoAccessError("DEMO_CONTEXT_INVALID", 422) }; }
  const limitMb = input.context.limits.max_storage_mb;
  if (!Number.isFinite(limitMb) || !Number.isInteger(limitMb) || limitMb < 0) return { allowed: false as const, error: new DemoAccessError("DEMO_CONTEXT_INVALID", 422) };
  const remaining = limitMb * 1024 * 1024 - input.currentBytes - input.newBytes;
  return remaining < 0 ? { allowed: false as const, error: new DemoAccessError("DEMO_STORAGE_LIMIT_REACHED", 409) } : { allowed: true as const, remaining };
}

export async function reserveDemoCapacity(input: {
  context: DemoAccessContext; resource: Exclude<DemoLimitResource, "storage">; increment: number;
  runExclusive: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
  getCurrentUsage: () => Promise<number>;
  onReserved?: (increment: number) => Promise<void> | void;
}) {
  const dealerId = input.context.dealerId;
  if (!dealerId) return { allowed: false as const, error: new DemoAccessError("DEMO_CONTEXT_INVALID", 422) };
  return input.runExclusive(`${dealerId}:${input.resource}`, async () => {
    const result = checkDemoLimit({ context: input.context, resource: input.resource, currentUsage: await input.getCurrentUsage(), increment: input.increment });
    if (result.allowed) await input.onReserved?.(input.increment);
    return result;
  });
}
