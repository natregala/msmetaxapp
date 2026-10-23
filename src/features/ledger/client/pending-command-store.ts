import Dexie, { type Table } from "dexie";
import {
  acknowledgeEditor,
  forgetEditor,
  recoveredEditor,
  rememberEditor,
} from "./editor-recovery";

export type PendingLedgerOperation = {
  userId: string;
  businessId: string;
  operationId: string;
  command: Record<string, unknown>;
  createdAt: string;
};

/** Only reviewed commands enter this store. Their payload never changes during retry. */
export function createPendingLedgerStore(name = "msme-ledger-operations-v1") {
  const database = new Dexie(name);
  database.version(1).stores({
    operations: "[userId+businessId+operationId], [userId+businessId]",
  });
  database.version(2).stores({ editors: "[userId+businessId+key]" });
  const operations: Table<PendingLedgerOperation, [string, string, string]> =
    database.table("operations");
  const editors: Table<
    {
      userId: string;
      businessId: string;
      key: string;
      values: Record<string, string>;
    },
    [string, string, string]
  > = database.table("editors");
  function scope(userId: string, businessId: string, operationId?: string) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      ![userId, businessId, ...(operationId ? [operationId] : [])].every(
        (value) => uuid.test(value),
      )
    )
      throw new Error("INVALID_LOCAL_OPERATION");
  }
  return {
    async put(
      userId: string,
      businessId: string,
      operationId: string,
      command: Record<string, unknown>,
    ) {
      scope(userId, businessId, operationId);
      if (
        command.businessId !== businessId ||
        command.operationId !== operationId
      )
        throw new Error("INVALID_LOCAL_OPERATION");
      await database.transaction("rw", operations, async () => {
        const previous = await operations.get([
          userId,
          businessId,
          operationId,
        ]);
        if (
          previous &&
          JSON.stringify(previous.command) !== JSON.stringify(command)
        )
          throw new Error("LOCAL_OPERATION_CONFLICT");
        if (!previous)
          await operations.add({
            userId,
            businessId,
            operationId,
            command,
            createdAt: new Date().toISOString(),
          });
      });
    },
    async list(userId: string, businessId: string) {
      scope(userId, businessId);
      return operations
        .where("[userId+businessId]")
        .equals([userId, businessId])
        .sortBy("createdAt");
    },
    async acknowledge(userId: string, businessId: string, operationId: string) {
      scope(userId, businessId, operationId);
      await operations.delete([userId, businessId, operationId]);
    },
    async readEditor(userId: string, businessId: string, key: string) {
      scope(userId, businessId);
      const recovery = recoveredEditor(name, userId, businessId, key);
      if (recovery) return recovery;
      return (await editors.get([userId, businessId, key]))?.values ?? null;
    },
    async saveEditor(
      userId: string,
      businessId: string,
      key: string,
      values: Record<string, string>,
    ) {
      scope(userId, businessId);
      const generation = rememberEditor(name, userId, businessId, key, values);
      await editors.put({ userId, businessId, key, values });
      acknowledgeEditor(name, userId, businessId, key, generation);
    },
    async clearEditor(userId: string, businessId: string, key: string) {
      scope(userId, businessId);
      await editors.delete([userId, businessId, key]);
      forgetEditor(name, userId, businessId, key);
    },
    close() {
      database.close();
    },
  };
}

let store: ReturnType<typeof createPendingLedgerStore> | undefined;
export function pendingLedgerStore() {
  return (store ??= createPendingLedgerStore());
}
