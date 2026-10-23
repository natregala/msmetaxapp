import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCommand } from "../../src/features/transactions/transaction.rules";
import {
  confirmReviewedTransaction,
  listAcceptedTransactions,
} from "../../src/features/transactions/server/confirm-transaction";

const fixture = vi.hoisted(() => ({ database: undefined as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fixture.database,
}));

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const businessA = "20000000-0000-4000-8000-000000000001";
const operationId = "30000000-0000-4000-8000-000000000001";
const recordId = "40000000-0000-4000-8000-000000000001";
const command = buildCommand(businessA, operationId, {
  amount: "100.01",
  businessDate: "2026-10-23",
  description: "Morning sales",
  kind: "sale",
  moneyMovement: "unknown",
});

function providerFixture(userId: string | null = userA) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { id: recordId, revision: 1 }, error: null });
  const seenFilters: [string, unknown][] = [];
  const from = vi.fn((table: string) => {
    const filters = new Map<string, unknown>();
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.set(column, value);
        seenFilters.push([column, value]);
        return query;
      }),
      order: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data:
          table === "businesses" &&
          filters.get("id") === businessA &&
          filters.get("owner_id") === userA
            ? { id: businessA, name: "Synthetic business A" }
            : null,
        error: null,
      })),
      limit: vi.fn(async () => ({
        data: [
          {
            id: recordId,
            business_id: businessA,
            business_date: "2026-10-23",
            kind: "sale",
            amount_centavos: 10001,
            currency: "PHP",
            description: "Morning sales",
            money_movement: "unknown",
            source: "manual",
            review_status: "confirmed",
            revision: 1,
            recorded_at: "2026-10-23T00:00:00Z",
          },
        ],
        error: null,
      })),
    };
    return query;
  });
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId ? { id: userId, email: "synthetic@example.test" } : null,
        },
        error: null,
      })),
    },
    rpc,
    from,
    seenFilters,
  };
}

beforeEach(() => {
  fixture.database = providerFixture();
});

describe("transaction services with a mocked provider", () => {
  it("verifies the session and business owner before submitting one atomic RPC", async () => {
    const database = providerFixture();
    fixture.database = database;
    await expect(confirmReviewedTransaction(command)).resolves.toEqual({
      id: recordId,
      revision: 1,
    });
    expect(database.auth.getUser).toHaveBeenCalledOnce();
    expect(database.seenFilters).toContainEqual(["id", businessA]);
    expect(database.seenFilters).toContainEqual(["owner_id", userA]);
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith(
      "accept_manual_transaction",
      {
        p_business_id: businessA,
        p_operation_id: operationId,
        p_payload: command.payload,
      },
    );
  });

  it("denies another account before any acceptance request reaches the provider", async () => {
    const database = providerFixture(userB);
    fixture.database = database;
    await expect(confirmReviewedTransaction(command)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("denies unauthenticated requests before looking up private business data", async () => {
    const database = providerFixture(null);
    fixture.database = database;
    await expect(confirmReviewedTransaction(command)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("validates untrusted money and prohibits caller-supplied authority", async () => {
    const database = providerFixture();
    fixture.database = database;
    await expect(
      confirmReviewedTransaction({
        ...command,
        payload: { ...command.payload, amountCentavos: 10001 },
      }),
    ).rejects.toThrow();
    await expect(
      confirmReviewedTransaction({ ...command, ownerId: userA }),
    ).rejects.toThrow();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("requires ownership for reads and returns exact amount strings", async () => {
    const database = providerFixture();
    fixture.database = database;
    const result = await listAcceptedTransactions(businessA);
    expect(result.records[0]).toMatchObject({
      id: recordId,
      amountCentavos: "10001",
      moneyMovement: "unknown",
      source: "manual",
      revision: 1,
    });
    expect(database.seenFilters).toContainEqual(["business_id", businessA]);
    expect(database.seenFilters).toContainEqual(["status", "active"]);
    fixture.database = providerFixture(userB);
    await expect(listAcceptedTransactions(businessA)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it.each([
    ["42501", "FORBIDDEN", 403],
    ["22023", "VALIDATION_ERROR", 422],
    ["40001", "CONFLICT", 409],
    ["XX000", "SERVER_ERROR", 503],
  ])(
    "maps database error %s without exposing provider detail",
    async (code, expected, status) => {
      const database = providerFixture();
      database.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "private SQL detail" },
      });
      fixture.database = database;
      await expect(confirmReviewedTransaction(command)).rejects.toMatchObject({
        code: expected,
        status,
      });
    },
  );
  it("treats incompatible reuse of an operation as a conflict", async () => {
    const database = providerFixture();
    database.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "OPERATION_CONFLICT" },
    });
    fixture.database = database;
    await expect(confirmReviewedTransaction(command)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
  });
  it("does not acknowledge a malformed database outcome", async () => {
    const database = providerFixture();
    database.rpc.mockResolvedValue({ data: { revision: 1 }, error: null });
    fixture.database = database;
    await expect(confirmReviewedTransaction(command)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 503,
    });
  });
});
