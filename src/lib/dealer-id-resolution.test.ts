import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDealerIdFromTenantSources } from "./dealer-id-resolution";

type DealerMembershipRow = {
  dealer_id: string | null;
};

function createSupabaseMock(data: DealerMembershipRow[], error: { message?: string } | null = null) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    returns: async () => ({ data, error }),
  };

  return {
    from: () => query,
  } as unknown as SupabaseClient;
}

describe("resolveDealerIdFromTenantSources", () => {
  it("resolves the only active dealer membership", async () => {
    const supabase = createSupabaseMock([{ dealer_id: "dealer-1" }]);

    const resolved = await resolveDealerIdFromTenantSources(supabase, "user-1");

    expect(resolved).toBe("dealer-1");
  });

  it("does not auto-resolve when user has multiple active memberships and no activeDealerId", async () => {
    const supabase = createSupabaseMock([{ dealer_id: "dealer-1" }, { dealer_id: "dealer-2" }]);

    const resolved = await resolveDealerIdFromTenantSources(supabase, "user-1");

    expect(resolved).toBeNull();
  });

  it("resolves when activeDealerId is valid for the user", async () => {
    const supabase = createSupabaseMock([{ dealer_id: "dealer-1" }, { dealer_id: "dealer-2" }]);

    const resolved = await resolveDealerIdFromTenantSources(supabase, "user-1", {
      activeDealerId: "dealer-2",
    });

    expect(resolved).toBe("dealer-2");
  });

  it("rejects activeDealerId when not authorized", async () => {
    const supabase = createSupabaseMock([{ dealer_id: "dealer-1" }, { dealer_id: "dealer-2" }]);

    const resolved = await resolveDealerIdFromTenantSources(supabase, "user-1", {
      activeDealerId: "dealer-3",
    });

    expect(resolved).toBeNull();
  });

  it("rejects suspended or disabled memberships by resolving null", async () => {
    // Suspended/disabled memberships are excluded at query level via status=active.
    const supabase = createSupabaseMock([]);

    const resolved = await resolveDealerIdFromTenantSources(supabase, "user-1");

    expect(resolved).toBeNull();
  });
});
