import { describe, expect, it, vi } from "vitest";
import {
  createOwnedBusiness,
  listOwnedBusinesses,
  renameOwnedBusiness,
} from "../../src/features/businesses/server/business-service";

const fixture = vi.hoisted(() => ({ database: undefined as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fixture.database,
}));

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const businessId = "20000000-0000-4000-8000-000000000001";
const profile = {
  id: businessId,
  name: "Synthetic services",
  activity: "services",
  setupCompleted: true,
  profileRevision: 1,
};

function providerFixture(userId: string | null = userA) {
  const row = {
    id: businessId,
    name: profile.name,
    activity: "services" as string | null,
    setup_completed_at: "2026-10-23T00:00:00Z" as string | null,
    profile_revision: 1,
  };
  const rpc = vi.fn().mockResolvedValue({ data: profile, error: null });
  const seenFilters: [string, unknown][] = [];
  const from = vi.fn(() => {
    const filters = new Map<string, unknown>();
    const allowed = () =>
      filters.get("owner_id") === userA &&
      (!filters.has("id") || filters.get("id") === businessId);
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => {
        filters.set(key, value);
        seenFilters.push([key, value]);
        return query;
      }),
      order: vi.fn(async () => ({ data: allowed() ? [row] : [], error: null })),
      single: vi.fn(async () => ({
        data: allowed() ? row : null,
        error: null,
      })),
      maybeSingle: vi.fn(async () => ({
        data: allowed() ? { id: businessId, name: row.name } : null,
        error: null,
      })),
    };
    return query;
  });
  return {
    row,
    rpc,
    from,
    seenFilters,
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId ? { id: userId, email: "synthetic@example.test" } : null,
        },
        error: null,
      })),
    },
  };
}

describe("business services with a mocked provider", () => {
  it("creates a guided profile through its controlled RPC then reads it within the verified owner scope", async () => {
    const database = providerFixture();
    fixture.database = database;
    await expect(
      createOwnedBusiness({
        id: businessId,
        name: "  Synthetic services  ",
        activity: "services",
      }),
    ).resolves.toEqual({ business: profile });
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith(
      "create_guided_business",
      {
        p_business_id: businessId,
        p_name: "Synthetic services",
        p_activity: "services",
      },
    );
    expect(database.seenFilters).toContainEqual(["id", businessId]);
    expect(database.seenFilters).toContainEqual(["owner_id", userA]);
  });

  it("keeps legacy creation valid without inventing completed setup", async () => {
    const database = providerFixture();
    database.row.setup_completed_at = null;
    database.row.activity = null;
    fixture.database = database;
    const result = await createOwnedBusiness({
      id: businessId,
      name: profile.name,
    });
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith("create_business", {
      p_business_id: businessId,
      p_name: profile.name,
    });
    expect(result.business.setupCompleted).toBe(false);
    expect(result.business.activity).toBeNull();
  });

  it("filters business profiles by verified identity and omits private ownership fields", async () => {
    const database = providerFixture();
    fixture.database = database;
    expect(await listOwnedBusinesses()).toEqual({ businesses: [profile] });
    expect(database.seenFilters).toContainEqual(["owner_id", userA]);
  });

  it("denies unauthenticated setup before any provider mutation", async () => {
    const database = providerFixture(null);
    fixture.database = database;
    await expect(
      createOwnedBusiness({
        id: businessId,
        name: profile.name,
        activity: "services",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("validates activity and disallows caller-supplied ownership or setup state", async () => {
    const database = providerFixture();
    fixture.database = database;
    for (const input of [
      { id: businessId, name: profile.name, activity: "invalid" },
      { id: businessId, name: profile.name, ownerId: userB },
      { id: businessId, name: profile.name, setupCompleted: true },
    ])
      await expect(createOwnedBusiness(input)).rejects.toThrow();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("rejects a name correction to another account's business before reaching the write RPC", async () => {
    const database = providerFixture(userB);
    fixture.database = database;
    await expect(
      renameOwnedBusiness({
        id: businessId,
        name: "Changed",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("passes the expected profile revision and returns the validated authoritative result", async () => {
    const database = providerFixture();
    const renamed = { ...profile, name: "Changed", profileRevision: 2 };
    database.rpc.mockResolvedValue({ data: renamed, error: null });
    fixture.database = database;
    await expect(
      renameOwnedBusiness({
        id: businessId,
        name: " Changed ",
        expectedRevision: 1,
      }),
    ).resolves.toEqual({ business: renamed });
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith("rename_business", {
      p_business_id: businessId,
      p_name: "Changed",
      p_expected_revision: 1,
    });
  });

  it("returns a conflict for stale name edits without leaking SQL details", async () => {
    const database = providerFixture();
    database.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "PROFILE_CONFLICT" },
    });
    fixture.database = database;
    await expect(
      renameOwnedBusiness({
        id: businessId,
        name: "Changed",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("does not claim a successful rename when the database outcome is malformed", async () => {
    const database = providerFixture();
    database.rpc.mockResolvedValue({
      data: { id: businessId, name: "Changed" },
      error: null,
    });
    fixture.database = database;
    await expect(
      renameOwnedBusiness({
        id: businessId,
        name: "Changed",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "SERVER_ERROR", status: 503 });
  });
});
