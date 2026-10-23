import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDraftStore } from "../../src/features/transactions/client/drafts";
import {
  buildCommand,
  selectPaymentAnswer,
} from "../../src/features/transactions/transaction.rules";
import type { SavedDraft } from "../../src/features/transactions/transaction.types";

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const businessA = "20000000-0000-4000-8000-000000000001";
const businessB = "20000000-0000-4000-8000-000000000002";
const operationId = "30000000-0000-4000-8000-000000000001";
const names: string[] = [];
const stores: ReturnType<typeof createDraftStore>[] = [];

function store(name = `draft-test-${crypto.randomUUID()}`) {
  names.push(name);
  const instance = createDraftStore(name);
  stores.push(instance);
  return { instance, name };
}

function state(): SavedDraft {
  return {
    operationId,
    draft: {
      businessDate: "2026-10-23",
      kind: "expense",
      amount: "12.",
      description: "Hindi pa tapos",
      moneyMovement: "unknown",
    },
    step: "edit",
    pendingCommand: null,
  };
}

afterEach(async () => {
  stores.splice(0).forEach((instance) => instance.close());
  for (const name of new Set(names.splice(0))) await Dexie.delete(name);
});

describe("durable drafts", () => {
  it("persists a draft-only partial payment answer and its exact place in the guide", async () => {
    const { instance } = store();
    const partial = selectPaymentAnswer(
      { ...state(), draft: { ...state().draft, amount: "200.25" } },
      "partial",
    );
    await instance.saveDraft(userA, businessA, partial, null);
    expect(await instance.loadDraft(userA, businessA)).toEqual(partial);
    await expect(
      instance.saveDraft(
        userA,
        businessA,
        { ...partial, step: "review", guidedStep: "review" },
        partial,
      ),
    ).rejects.toMatchObject({ code: "INVALID_LOCAL_DRAFT" });
  });

  it("rejects guided review without a deliberate unknown selection and rejects contradictory answers", async () => {
    const { instance } = store();
    const review: SavedDraft = {
      ...state(),
      draft: { ...state().draft, amount: "200" },
      step: "review",
      guidedStep: "review",
    };
    await expect(
      instance.saveDraft(userA, businessA, review),
    ).rejects.toMatchObject({ code: "INVALID_LOCAL_DRAFT" });
    await expect(
      instance.saveDraft(userA, businessA, {
        ...review,
        paymentAnswer: "paid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_LOCAL_DRAFT" });
    await instance.saveDraft(userA, businessA, {
      ...review,
      paymentAnswer: "unknown",
    });
  });

  it("retains older reviewed non-guided kinds and their original pending command", async () => {
    const { instance } = store();
    const legacy = state();
    legacy.draft = {
      ...legacy.draft,
      amount: "500",
      kind: "loan_received",
      moneyMovement: "in",
    };
    legacy.step = "review";
    legacy.pendingCommand = buildCommand(businessA, operationId, legacy.draft);
    await instance.saveDraft(userA, businessA, legacy);
    expect(await instance.loadDraft(userA, businessA)).toEqual(legacy);
  });

  it("rejects a stale same-operation edit from a second tab while preserving the latest draft", async () => {
    const first = store();
    const second = store(first.name);
    const original = state();
    await first.instance.saveDraft(userA, businessA, original, null);
    const tabOne = await first.instance.loadDraft(userA, businessA);
    const tabTwo = await second.instance.loadDraft(userA, businessA);
    const updated = {
      ...original,
      draft: { ...original.draft, amount: "75.50" },
    };
    await first.instance.saveDraft(userA, businessA, updated, tabOne);
    await expect(
      second.instance.saveDraft(
        userA,
        businessA,
        { ...original, draft: { ...original.draft, amount: "20.20" } },
        tabTwo,
      ),
    ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
    expect(await second.instance.loadDraft(userA, businessA)).toEqual(updated);
    await expect(
      second.instance.saveDraft(userA, businessA, original, null),
    ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
  });

  it("protects a pending guided command from an older tab using the legacy save signature", async () => {
    const first = store();
    const second = store(first.name);
    const original = state();
    original.draft.amount = "45.67";
    const reviewed: SavedDraft = {
      ...selectPaymentAnswer(original, "paid"),
      step: "review",
      guidedStep: "review",
    };
    reviewed.pendingCommand = buildCommand(
      businessA,
      operationId,
      reviewed.draft,
    );
    await first.instance.saveDraft(userA, businessA, reviewed, null);
    await expect(
      second.instance.saveDraft(userA, businessA, original),
    ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
    expect(await second.instance.loadDraft(userA, businessA)).toEqual(reviewed);
  });

  it("reopens the same raw unfinished amount after closing the database", async () => {
    const first = store();
    await first.instance.saveDraft(userA, businessA, state());
    first.instance.close();
    const second = store(first.name);
    expect(await second.instance.loadDraft(userA, businessA)).toEqual(state());
  });

  it("isolates local reads and deletion by both account and business", async () => {
    const { instance } = store();
    await instance.saveDraft(userA, businessA, state());
    expect(await instance.loadDraft(userB, businessA)).toBeNull();
    expect(await instance.loadDraft(userA, businessB)).toBeNull();
    await instance.deleteDraft(userB, businessA, operationId);
    expect(await instance.loadDraft(userA, businessA)).toEqual(state());
  });

  it("persists a frozen command with the reviewed draft, then rejects replacement after an ambiguous submission", async () => {
    const { instance } = store();
    const pending = state();
    pending.draft.amount = "12.50";
    pending.step = "review";
    pending.pendingCommand = buildCommand(
      businessA,
      operationId,
      pending.draft,
    );
    await instance.saveDraft(userA, businessA, pending);
    await expect(
      instance.saveDraft(userA, businessA, {
        ...pending,
        pendingCommand: null,
        step: "edit",
      }),
    ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
    const restored = await instance.loadDraft(userA, businessA);
    expect(restored).toEqual(pending);
    await instance.saveDraft(userA, businessA, pending);
    expect(
      (await instance.loadDraft(userA, businessA))?.pendingCommand?.operationId,
    ).toBe(operationId);
  });

  it("does not let a late response erase another operation's unsent work", async () => {
    const { instance } = store();
    await instance.saveDraft(userA, businessA, state());
    await expect(
      instance.deleteDraft(
        userA,
        businessA,
        "30000000-0000-4000-8000-000000000002",
      ),
    ).resolves.toBeUndefined();
    expect(await instance.loadDraft(userA, businessA)).toEqual(state());
  });

  it("requires the current snapshot for deliberate discard even when another tab kept the same operation ID", async () => {
    const { instance } = store();
    const original = state();
    await instance.saveDraft(userA, businessA, original);
    const updated = {
      ...original,
      draft: { ...original.draft, amount: "88.50" },
    };
    await instance.saveDraft(userA, businessA, updated, original);
    await expect(
      instance.deleteDraft(userA, businessA, operationId, original),
    ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
    expect(await instance.loadDraft(userA, businessA)).toEqual(updated);
    await instance.deleteDraft(userA, businessA, operationId, updated);
    expect(await instance.loadDraft(userA, businessA)).toBeNull();
  });

  it("refuses deliberate discard of a pending command while permitting acknowledged cleanup", async () => {
    const { instance } = store();
    const pending = state();
    pending.draft.amount = "20";
    pending.step = "review";
    pending.pendingCommand = buildCommand(
      businessA,
      operationId,
      pending.draft,
    );
    await instance.saveDraft(userA, businessA, pending);
    await expect(
      instance.deleteDraft(userA, businessA, operationId, pending),
    ).rejects.toMatchObject({ code: "LOCAL_DRAFT_CONFLICT" });
    expect(await instance.loadDraft(userA, businessA)).toEqual(pending);
    await instance.deleteDraft(userA, businessA, operationId);
    expect(await instance.loadDraft(userA, businessA)).toBeNull();
  });

  it("rejects a pending command for a different business and leaves no partial draft", async () => {
    const { instance } = store();
    const pending = state();
    pending.draft.amount = "1";
    pending.step = "review";
    pending.pendingCommand = buildCommand(
      businessB,
      operationId,
      pending.draft,
    );
    await expect(
      instance.saveDraft(userA, businessA, pending),
    ).rejects.toMatchObject({ code: "INVALID_LOCAL_DRAFT" });
    expect(await instance.loadDraft(userA, businessA)).toBeNull();
  });

  it.each([{ amount: "12." }, { businessDate: "2026-02-30" }])(
    "rejects invalid review input before saving: %j",
    async (invalid) => {
      const { instance } = store();
      const reviewed = state();
      reviewed.step = "review";
      reviewed.draft = { ...reviewed.draft, amount: "12.50", ...invalid };
      await expect(
        instance.saveDraft(userA, businessA, reviewed),
      ).rejects.toMatchObject({ code: "INVALID_LOCAL_DRAFT" });
      expect(await instance.loadDraft(userA, businessA)).toBeNull();
    },
  );

  it("reports a corrupted stored review state instead of returning unsafe values to the review screen", async () => {
    const { instance, name } = store();
    const raw = new Dexie(name);
    raw.version(1).stores({ drafts: "[userId+businessId], userId" });
    try {
      await raw.table("drafts").put({
        ...state(),
        step: "review",
        userId: userA,
        businessId: businessA,
        savedAt: new Date().toISOString(),
      });
      await expect(instance.loadDraft(userA, businessA)).rejects.toMatchObject({
        code: "INVALID_LOCAL_DRAFT",
      });
      raw.close();
      const upgraded = new Dexie(name);
      upgraded
        .version(3)
        .stores({
          entries:
            "[userId+businessId+operationId], [userId+businessId], userId",
        });
      expect(
        await upgraded.table("entries").get([userA, businessA, operationId]),
      ).toMatchObject({
        draft: { amount: "12." },
        step: "review",
      });
      upgraded.close();
    } finally {
      raw.close();
    }
  });

  it("reports storage unavailability instead of reporting a successful save", async () => {
    const { instance } = store();
    await instance.saveDraft(userA, businessA, state());
    instance.close();
    await expect(
      instance.saveDraft(userA, businessA, state()),
    ).rejects.toMatchObject({ code: "LOCAL_STORAGE_FAILED" });
  });
});
