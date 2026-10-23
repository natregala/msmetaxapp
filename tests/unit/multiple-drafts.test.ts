import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it } from "vitest";
import { createDraftStore } from "../../src/features/transactions/client/drafts";
import { buildLedgerEntry } from "../../src/features/transactions/guided-ledger";
import {
  advanceGuidedDraft,
  selectPaymentAnswer,
  validateGuidedStep,
} from "../../src/features/transactions/transaction.rules";
import type { SavedDraft } from "../../src/features/transactions/transaction.types";
const user = "10000000-0000-4000-8000-000000000001",
  business = "20000000-0000-4000-8000-000000000001";
const names: string[] = [],
  stores: ReturnType<typeof createDraftStore>[] = [];
function store() {
  const name = "multi-" + crypto.randomUUID();
  names.push(name);
  const db = createDraftStore(name);
  stores.push(db);
  return { db, name };
}
function state(): SavedDraft {
  return {
    operationId: crypto.randomUUID(),
    entryVersion: 2,
    step: "edit",
    guidedStep: "amount",
    paymentAnswer: undefined,
    pendingCommand: null,
    draft: {
      amount: "12.",
      businessDate: "2026-10-23",
      description: "",
      kind: "sale",
      moneyMovement: "unknown",
    },
  };
}
afterEach(async () => {
  stores.forEach((s) => s.close());
  for (const name of names) await Dexie.delete(name);
  stores.length = 0;
  names.length = 0;
});
it("parks multiple exact raw drafts, resumes a specific one, and cleanup cannot erase another", async () => {
  const { db } = store(),
    first = state(),
    second = {
      ...state(),
      draft: { ...state().draft, kind: "expense" as const, amount: "999." },
    };
  await db.saveDraft(user, business, first, null);
  await db.saveDraft(user, business, second, null);
  expect(await db.listDrafts(user, business)).toHaveLength(2);
  expect(await db.loadDraft(user, business, first.operationId)).toEqual(first);
  await db.deleteDraft(user, business, first.operationId, first);
  expect(await db.loadDraft(user, business, second.operationId)).toEqual(
    second,
  );
  expect(
    await db.listDrafts("10000000-0000-4000-8000-000000000002", business),
  ).toEqual([]);
});
it("migrates original scoped v1 drafts without changing operation IDs or raw amounts", async () => {
  const { db, name } = store(),
    legacy = { ...state() };
  delete legacy.entryVersion;
  const raw = new Dexie(name);
  raw.version(1).stores({ drafts: "[userId+businessId], userId" });
  await raw
    .table("drafts")
    .put({
      ...legacy,
      userId: user,
      businessId: business,
      savedAt: "2026-10-23T00:00:00Z",
    });
  raw.close();
  expect(await db.loadDraft(user, business, legacy.operationId)).toEqual(
    legacy,
  );
});
it("accepts an exact partial payment only after the paid amount is supplied", () => {
  let partial = selectPaymentAnswer(
    { ...state(), draft: { ...state().draft, amount: "1250.50" } },
    "partial",
  );
  expect(validateGuidedStep(partial).problem).toBe("invalid_payment_amount");
  partial = { ...partial, paymentAmount: "250.25", paymentDate: "2026-10-23" };
  const reviewed = advanceGuidedDraft(partial);
  expect(reviewed.ok).toBe(true);
  if (!reviewed.ok) throw Error();
  expect(buildLedgerEntry(business, reviewed.state).values).toMatchObject({
    amountCentavos: "125050",
    paymentAmountCentavos: "25025",
    paymentStatus: "partial",
  });
  expect(
    validateGuidedStep({ ...partial, paymentAmount: "1250.50" }).problem,
  ).toBe("invalid_payment_amount");
});
it("keeps an unresolved v2 command frozen while allowing a separate parked draft", async () => {
  const { db } = store();
  const draft = selectPaymentAnswer(
    { ...state(), draft: { ...state().draft, amount: "100.25" } },
    "paid",
  );
  const reviewed = {
    ...draft,
    step: "review" as const,
    guidedStep: "review" as const,
  };
  reviewed.pendingLedgerCommand = buildLedgerEntry(business, reviewed);
  await db.saveDraft(user, business, reviewed, null);
  await db.saveDraft(user, business, state(), null);
  await expect(
    db.saveDraft(
      user,
      business,
      { ...reviewed, pendingLedgerCommand: null },
      reviewed,
    ),
  ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
  await expect(
    db.deleteDraft(user, business, reviewed.operationId, reviewed),
  ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
  expect(await db.listDrafts(user, business)).toHaveLength(2);
});
it("allows editing after a definitive validation rejection, never after an uncertain or authorization failure", async () => {
  const { db } = store();
  const chosen = selectPaymentAnswer(
    { ...state(), draft: { ...state().draft, amount: "100" } },
    "paid",
  );
  const reviewed: SavedDraft = {
    ...chosen,
    step: "review",
    guidedStep: "review",
  };
  reviewed.pendingLedgerCommand = buildLedgerEntry(business, reviewed);
  await db.saveDraft(user, business, reviewed, null);
  await expect(
    db.releaseRejectedDraft(user, business, reviewed, "NETWORK_ERROR"),
  ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
  await expect(
    db.releaseRejectedDraft(user, business, reviewed, "FORBIDDEN"),
  ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
  const editable = await db.releaseRejectedDraft(
    user,
    business,
    reviewed,
    "VALIDATION_ERROR",
  );
  expect(editable).toMatchObject({
    step: "edit",
    guidedStep: "payment",
    pendingLedgerCommand: null,
    draft: { amount: "100" },
  });
});
