import Dexie, { type Table } from "dexie";
import { z } from "zod";
import { commandSchema } from "../transaction.schema";
import { ledgerCommandSchema } from "@/features/ledger/ledger.schema";
import { buildLedgerEntry } from "../guided-ledger";
import {
  buildCommand,
  isGuidedKind,
  paymentMovement,
  validateDraft,
  validateGuidedStep,
} from "../transaction.rules";
import {
  moneyMovements,
  transactionKinds,
  type SavedDraft,
} from "../transaction.types";

const savedDraftSchema = z.strictObject({
  operationId: z.uuid(),
  draft: z.strictObject({
    businessDate: z.string(),
    kind: z.enum(transactionKinds),
    description: z.string(),
    amount: z.string(),
    moneyMovement: z.enum(moneyMovements),
  }),
  step: z.enum(["edit", "review"]),
  pendingCommand: commandSchema.nullable(),
  guidedStep: z.enum(["amount", "payment", "review"]).optional(),
  paymentAnswer: z.enum(["paid", "unpaid", "unknown", "partial"]).optional(),
  entryVersion: z.literal(2).optional(),
  paymentAmount: z.string().optional(),
  paymentDate: z.string().optional(),
  pendingLedgerCommand: ledgerCommandSchema.nullable().optional(),
});

type DraftRow = SavedDraft & {
  userId: string;
  businessId: string;
  savedAt: string;
};

export class DraftStorageError extends Error {
  constructor(
    public readonly code:
      "LOCAL_STORAGE_FAILED" | "LOCAL_DRAFT_CONFLICT" | "INVALID_LOCAL_DRAFT",
  ) {
    super(code);
    this.name = "DraftStorageError";
  }
}

/** An explicit adapter factory also lets integration tests reopen the same database. */
export function createDraftStore(databaseName = "msme-manual-drafts-v1") {
  const database = new Dexie(databaseName);
  database.version(1).stores({ drafts: "[userId+businessId], userId" });
  database
    .version(2)
    .stores({
      entries: "[userId+businessId+operationId], [userId+businessId], userId",
    })
    .upgrade(async (tx) => {
      const rows = await tx.table("drafts").toArray();
      if (rows.length) await tx.table("entries").bulkPut(rows);
    });
  database.version(3).stores({ drafts: null });
  const drafts: Table<DraftRow, [string, string, string]> =
    database.table("entries");

  function checkScope(userId: string, businessId: string) {
    if (
      !z.uuid().safeParse(userId).success ||
      !z.uuid().safeParse(businessId).success
    )
      throw new DraftStorageError("INVALID_LOCAL_DRAFT");
  }

  async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DraftStorageError) throw error;
      throw new DraftStorageError("LOCAL_STORAGE_FAILED");
    }
  }

  function validateState(businessId: string, state: SavedDraft): SavedDraft {
    const parsed = savedDraftSchema.safeParse(state);
    if (!parsed.success) throw new DraftStorageError("INVALID_LOCAL_DRAFT");
    const value = parsed.data;
    if (
      value.guidedStep &&
      (value.guidedStep === "review") !== (value.step === "review")
    )
      throw new DraftStorageError("INVALID_LOCAL_DRAFT");
    if (value.paymentAnswer) {
      if (!isGuidedKind(value.draft.kind))
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
      if (value.paymentAnswer === "partial") {
        if (
          value.entryVersion !== 2 &&
          (value.step === "review" || value.pendingCommand)
        )
          throw new DraftStorageError("INVALID_LOCAL_DRAFT");
      } else if (
        paymentMovement(value.draft.kind, value.paymentAnswer) !==
        value.draft.moneyMovement
      ) {
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
      }
    }
    if (
      value.step === "review" &&
      Object.keys(validateDraft(value.draft)).length > 0
    )
      throw new DraftStorageError("INVALID_LOCAL_DRAFT");
    if (value.guidedStep === "review") {
      const review = validateGuidedStep(value);
      if (review.problem || Object.keys(review.errors).length)
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
    }
    if (value.pendingLedgerCommand) {
      if (
        value.pendingCommand ||
        value.step !== "review" ||
        value.entryVersion !== 2 ||
        JSON.stringify(buildLedgerEntry(businessId, value)) !==
          JSON.stringify(value.pendingLedgerCommand)
      )
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
    }
    if (value.pendingCommand) {
      if (
        value.step !== "review" ||
        value.pendingCommand.businessId !== businessId ||
        value.pendingCommand.operationId !== value.operationId
      )
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
      let reconstructed;
      try {
        reconstructed = buildCommand(
          businessId,
          value.operationId,
          value.draft,
        );
      } catch {
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
      }
      if (
        JSON.stringify(reconstructed) !== JSON.stringify(value.pendingCommand)
      )
        throw new DraftStorageError("INVALID_LOCAL_DRAFT");
    }
    return value;
  }

  function rowState(row: DraftRow): SavedDraft {
    const {
      operationId,
      draft,
      step,
      pendingCommand,
      guidedStep,
      paymentAnswer,
      entryVersion,
      paymentAmount,
      paymentDate,
      pendingLedgerCommand,
    } = row;
    return {
      operationId,
      draft,
      step,
      pendingCommand,
      ...(guidedStep ? { guidedStep } : {}),
      ...(paymentAnswer ? { paymentAnswer } : {}),
      ...(entryVersion ? { entryVersion } : {}),
      ...(paymentAmount !== undefined ? { paymentAmount } : {}),
      ...(paymentDate !== undefined ? { paymentDate } : {}),
      ...(pendingLedgerCommand !== undefined ? { pendingLedgerCommand } : {}),
    };
  }

  return {
    async releaseRejectedDraft(
      userId: string,
      businessId: string,
      expected: SavedDraft,
      code: string,
    ): Promise<SavedDraft> {
      checkScope(userId, businessId);
      if (
        ![
          "VALIDATION_ERROR",
          "INVALID_PAYMENT",
          "PAYMENT_BEFORE_RECORD",
          "UNSUPPORTED_SETTLEMENT",
        ].includes(code)
      )
        throw new DraftStorageError("LOCAL_DRAFT_CONFLICT");
      return storageOperation(() =>
        database.transaction("rw", drafts, async () => {
          const row = await drafts.get([
            userId,
            businessId,
            expected.operationId,
          ]);
          if (
            !row ||
            JSON.stringify(validateState(businessId, rowState(row))) !==
              JSON.stringify(validateState(businessId, expected)) ||
            (!expected.pendingCommand && !expected.pendingLedgerCommand)
          )
            throw new DraftStorageError("LOCAL_DRAFT_CONFLICT");
          // A definitive server validation rejection has no accepted operation.
          // Network, authorization and uncertain outcomes cannot enter this path.
          const next: SavedDraft = {
            ...expected,
            pendingCommand: null,
            ...(expected.pendingLedgerCommand !== undefined
              ? { pendingLedgerCommand: null }
              : {}),
            step: "edit",
            ...(isGuidedKind(expected.draft.kind)
              ? { guidedStep: "payment" }
              : {}),
          };
          await drafts.put({
            ...next,
            userId,
            businessId,
            savedAt: new Date().toISOString(),
          });
          return next;
        }),
      );
    },
    async loadDraft(
      userId: string,
      businessId: string,
      operationId?: string,
    ): Promise<SavedDraft | null> {
      checkScope(userId, businessId);
      return storageOperation(async () => {
        const row = operationId
          ? await drafts.get([userId, businessId, operationId])
          : (
              await drafts
                .where("[userId+businessId]")
                .equals([userId, businessId])
                .sortBy("savedAt")
            ).at(-1);
        if (!row) return null;
        return validateState(businessId, rowState(row));
      });
    },
    async listDrafts(
      userId: string,
      businessId: string,
    ): Promise<SavedDraft[]> {
      checkScope(userId, businessId);
      return storageOperation(async () => {
        const rows = await drafts
          .where("[userId+businessId]")
          .equals([userId, businessId])
          .sortBy("savedAt");
        return rows
          .reverse()
          .map((row) => validateState(businessId, rowState(row)));
      });
    },
    async saveDraft(
      userId: string,
      businessId: string,
      state: SavedDraft,
      expectedPrevious?: SavedDraft | null,
    ): Promise<void> {
      checkScope(userId, businessId);
      const value = validateState(businessId, state);
      await storageOperation(() =>
        database.transaction("rw", drafts, async () => {
          const previous = await drafts.get([
            userId,
            businessId,
            value.operationId,
          ]);
          if (expectedPrevious !== undefined) {
            const expected =
              expectedPrevious === null
                ? null
                : validateState(businessId, expectedPrevious);
            const current = previous
              ? validateState(businessId, rowState(previous))
              : null;
            if (JSON.stringify(current) !== JSON.stringify(expected))
              throw new DraftStorageError("LOCAL_DRAFT_CONFLICT");
          }
          if (
            previous &&
            (previous.operationId !== value.operationId ||
              (previous.pendingCommand &&
                JSON.stringify(previous.pendingCommand) !==
                  JSON.stringify(value.pendingCommand)) ||
              (previous.pendingLedgerCommand &&
                JSON.stringify(previous.pendingLedgerCommand) !==
                  JSON.stringify(value.pendingLedgerCommand)))
          )
            throw new DraftStorageError("LOCAL_DRAFT_CONFLICT");
          await drafts.put({
            ...value,
            userId,
            businessId,
            savedAt: new Date().toISOString(),
          });
        }),
      );
    },
    async deleteDraft(
      userId: string,
      businessId: string,
      operationId: string,
      expectedPrevious?: SavedDraft,
    ): Promise<void> {
      checkScope(userId, businessId);
      await storageOperation(() =>
        database.transaction("rw", drafts, async () => {
          const previous = await drafts.get([userId, businessId, operationId]);
          if (expectedPrevious !== undefined) {
            const expected = validateState(businessId, expectedPrevious);
            const current = previous
              ? validateState(businessId, rowState(previous))
              : null;
            // Supplying a snapshot means a deliberate unsent discard, never acceptance cleanup.
            if (
              expected.pendingCommand ||
              expected.pendingLedgerCommand ||
              current?.pendingCommand ||
              current?.pendingLedgerCommand ||
              JSON.stringify(current) !== JSON.stringify(expected)
            )
              throw new DraftStorageError("LOCAL_DRAFT_CONFLICT");
          }
          if (previous && previous.operationId !== operationId)
            throw new DraftStorageError("LOCAL_DRAFT_CONFLICT");
          await drafts.delete([userId, businessId, operationId]);
        }),
      );
    },
    close() {
      database.close();
    },
  };
}

let store: ReturnType<typeof createDraftStore> | undefined;
function getStore() {
  return (store ??= createDraftStore());
}
export function loadDraft(
  userId: string,
  businessId: string,
  operationId?: string,
) {
  return getStore().loadDraft(userId, businessId, operationId);
}
export function listDrafts(userId: string, businessId: string) {
  return getStore().listDrafts(userId, businessId);
}
export function releaseRejectedDraft(
  userId: string,
  businessId: string,
  expected: SavedDraft,
  code: string,
) {
  return getStore().releaseRejectedDraft(userId, businessId, expected, code);
}
export function saveDraft(
  userId: string,
  businessId: string,
  state: SavedDraft,
  expectedPrevious?: SavedDraft | null,
) {
  return getStore().saveDraft(userId, businessId, state, expectedPrevious);
}
export function deleteDraft(
  userId: string,
  businessId: string,
  operationId: string,
  expectedPrevious?: SavedDraft,
) {
  return getStore().deleteDraft(
    userId,
    businessId,
    operationId,
    expectedPrevious,
  );
}
