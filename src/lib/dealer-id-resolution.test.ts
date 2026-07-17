import { describe, expect, it, vi } from "vitest";
import { resolveDealerIdFromTenantSources } from "./dealer-id-resolution";

type MembershipResponse = {
  data: Array<{ dealer_id: string | null }> | null;
  error: { message?: string | null } | null;
};

function createSupabaseMock(response: MembershipResponse) {
  const returnsMock = vi.fn().mockResolvedValue(response);
  const orderMock = vi.fn(() => ({
    returns: returnsMock,
  }));
  const eqStatusMock = vi.fn(() => ({
    order: orderMock,
  }));
  const eqProfileMock = vi.fn(() => ({
    eq: eqStatusMock,
  }));
  const selectMock = vi.fn(() => ({
    eq: eqProfileMock,
  }));
  const fromMock = vi.fn(() => ({
    select: selectMock,
  }));

  const supabase = {
    from: fromMock,
  };

  return {
    supabase,
    spies: {
      fromMock,
      selectMock,
      eqProfileMock,
      eqStatusMock,
      orderMock,
      returnsMock,
    },
  };
}

describe("resolveDealerIdFromTenantSources", () => {
  it("resolves the dealer when there is exactly one active membership", async () => {
    const mock = createSupabaseMock({
      data: [{ dealer_id: "dealer-1" }],
      error: null,
    });

    const resolved = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1");

    expect(resolved).toBe("dealer-1");
    expect(mock.spies.fromMock).toHaveBeenCalledWith("dealer_users");
    expect(mock.spies.eqProfileMock).toHaveBeenCalledWith("profile_id", "user-1");
    expect(mock.spies.eqStatusMock).toHaveBeenCalledWith("status", "active");
  });

  it("does not grant access when no active membership exists", async () => {
    const mock = createSupabaseMock({
      data: [],
      error: null,
    });

    const resolved = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1");

    expect(resolved).toBeNull();
  });

  it("queries only active memberships, so invited/suspended/disabled cannot grant access", async () => {
    const mock = createSupabaseMock({
      data: [],
      error: null,
    });

    const resolved = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1");

    expect(resolved).toBeNull();
    expect(mock.spies.eqStatusMock).toHaveBeenCalledWith("status", "active");
  });

  it("keeps dealers isolated when an explicit dealer is requested", async () => {
    const mock = createSupabaseMock({
      data: [{ dealer_id: "dealer-a" }, { dealer_id: "dealer-b" }],
      error: null,
    });

    const allowed = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1", {
      activeDealerId: "dealer-b",
    });
    const rejected = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1", {
      activeDealerId: "dealer-x",
    });

    expect(allowed).toBe("dealer-b");
    expect(rejected).toBeNull();
  });

  it("returns null when memberships are ambiguous and no active dealer is selected", async () => {
    const mock = createSupabaseMock({
      data: [{ dealer_id: "dealer-a" }, { dealer_id: "dealer-b" }],
      error: null,
    });

    const resolved = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1");

    expect(resolved).toBeNull();
  });

  it("handles ambiguous memberships safely even with duplicated rows", async () => {
    const mock = createSupabaseMock({
      data: [{ dealer_id: "dealer-a" }, { dealer_id: "dealer-a" }, { dealer_id: "dealer-b" }],
      error: null,
    });

    const resolved = await resolveDealerIdFromTenantSources(mock.supabase as never, "user-1");

    expect(resolved).toBeNull();
  });

  it("fails with a stable schema error when dealer_users foundation is missing", async () => {
    const mock = createSupabaseMock({
      data: null,
      error: { message: 'relation "dealer_users" does not exist' },
    });

    await expect(resolveDealerIdFromTenantSources(mock.supabase as never, "user-1")).rejects.toThrow(
      "Schema identity non allineato: dealer_users con status/created_at e obbligatoria."
    );
  });
});
