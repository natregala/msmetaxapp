import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createPendingLedgerStore } from "@/features/ledger/client/pending-command-store";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const businessId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
describe("reviewed ledger operation recovery", () => {
  it("survives reopen and isolates accounts while refusing changed retry content", async () => {
    const name = "pending-ledger-" + crypto.randomUUID();
    const command = {
      businessId,
      operationId,
      action: "void",
      expectedRevision: 1,
      values: { reason: "Synthetic correction" },
    };
    const first = createPendingLedgerStore(name);
    await first.put(user, businessId, operationId, command);
    await expect(
      first.put(user, businessId, operationId, {
        ...command,
        expectedRevision: 2,
      }),
    ).rejects.toThrow("LOCAL_OPERATION_CONFLICT");
    expect(await first.list(other, businessId)).toEqual([]);
    first.close();
    const reopened = createPendingLedgerStore(name);
    expect((await reopened.list(user, businessId))[0].command).toEqual(command);
    await reopened.acknowledge(other, businessId, operationId);
    expect(await reopened.list(user, businessId)).toHaveLength(1);
    await reopened.acknowledge(user, businessId, operationId);
    expect(await reopened.list(user, businessId)).toEqual([]);
    reopened.close();
  });
});
