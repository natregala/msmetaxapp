import { describe, expect, it } from "vitest";
import {
  advanceGuidedDraft,
  buildCommand,
  buildGuidedCommand,
  paymentMovement,
  resolveGuidedStep,
  resolvePaymentAnswer,
  selectPaymentAnswer,
} from "../../src/features/transactions/transaction.rules";
import type { SavedDraft } from "../../src/features/transactions/transaction.types";

const businessId = "20000000-0000-4000-8000-000000000001";
function initial(): SavedDraft {
  return {
    operationId: "30000000-0000-4000-8000-000000000001",
    draft: {
      businessDate: "2026-10-23",
      kind: "sale",
      amount: "123.45",
      description: "",
      moneyMovement: "unknown",
    },
    step: "edit",
    guidedStep: "amount",
    pendingCommand: null,
  };
}

describe("guided transaction rules", () => {
  it("requires an explicit payment answer between amount and review", () => {
    const amount = initial();
    const first = advanceGuidedDraft(amount);
    expect(first).toMatchObject({
      ok: true,
      state: { step: "edit", guidedStep: "payment" },
    });
    if (!first.ok) throw new Error("Expected payment step");
    expect(resolvePaymentAnswer(first.state)).toBeUndefined();
    expect(advanceGuidedDraft(first.state)).toEqual({
      ok: false,
      errors: {},
      problem: "payment_required",
    });
    const answered = selectPaymentAnswer(first.state, "unknown");
    const reviewed = advanceGuidedDraft(answered);
    expect(reviewed).toMatchObject({
      ok: true,
      state: { guidedStep: "review", step: "review", paymentAnswer: "unknown" },
    });
    if (!reviewed.ok) throw new Error("Expected review step");
    expect(
      buildGuidedCommand(businessId, reviewed.state).payload,
    ).toMatchObject({ amountCentavos: "12345", moneyMovement: "unknown" });
    expect(amount.draft.amount).toBe("123.45");
  });

  it("keeps partial payments in a resumable draft without producing an acceptance command", () => {
    const partial = selectPaymentAnswer(initial(), "partial");
    expect(partial).toMatchObject({
      step: "edit",
      guidedStep: "payment",
      paymentAnswer: "partial",
      draft: { amount: "123.45" },
    });
    expect(advanceGuidedDraft(partial)).toEqual({
      ok: false,
      errors: {},
      problem: "partial_unsupported",
    });
    expect(() =>
      buildGuidedCommand(businessId, {
        ...partial,
        step: "review",
        guidedStep: "review",
      }),
    ).toThrow("partial_unsupported");
  });

  it.each([
    ["sale", "in"],
    ["expense", "out"],
  ] as const)(
    "maps fully paid %s to its supported money movement",
    (kind, expected) => {
      expect(paymentMovement(kind, "paid")).toBe(expected);
      expect(paymentMovement(kind, "unpaid")).toBe("none");
      expect(paymentMovement(kind, "unknown")).toBe("unknown");
      expect(paymentMovement(kind, "partial")).toBeNull();
    },
  );

  it("does not proceed with missing amounts, invalid dates, or missing classification", () => {
    const state = initial();
    state.draft.amount = "";
    state.draft.businessDate = "2026-02-30";
    expect(advanceGuidedDraft(state)).toEqual({
      ok: false,
      errors: { amount: "required", businessDate: "invalid_date" },
    });
  });

  it("requires the review stage before producing a guided command", () => {
    expect(() => buildGuidedCommand(businessId, initial())).toThrow(
      "invalid_step",
    );
    expect(() =>
      buildGuidedCommand(businessId, {
        ...initial(),
        step: "review",
        guidedStep: "review",
      }),
    ).toThrow("payment_required");
  });

  it("rejects an answer whose stored money movement contradicts it", () => {
    const state = {
      ...initial(),
      guidedStep: "payment" as const,
      paymentAnswer: "paid" as const,
    };
    expect(advanceGuidedDraft(state)).toEqual({
      ok: false,
      errors: { moneyMovement: "invalid_movement" },
    });
  });

  it("reopens legacy edits at amount and preserves legacy reviewed unknown answers", () => {
    const legacy = initial();
    delete legacy.guidedStep;
    expect(resolveGuidedStep(legacy)).toBe("amount");
    expect(resolvePaymentAnswer(legacy)).toBeUndefined();
    const review = { ...legacy, step: "review" as const };
    expect(resolveGuidedStep(review)).toBe("review");
    expect(resolvePaymentAnswer(review)).toBe("unknown");
    expect(buildGuidedCommand(businessId, review)).toEqual(
      buildCommand(businessId, review.operationId, review.draft),
    );
  });

  it("preserves already reviewed older transaction kinds and their pending operation", () => {
    const legacy = initial();
    delete legacy.guidedStep;
    legacy.draft.kind = "loan_received";
    legacy.draft.moneyMovement = "in";
    legacy.step = "review";
    legacy.pendingCommand = buildCommand(
      businessId,
      legacy.operationId,
      legacy.draft,
    );
    expect(buildGuidedCommand(businessId, legacy)).toBe(legacy.pendingCommand);
    expect(() => selectPaymentAnswer(legacy, "paid")).toThrow(
      "pending_command",
    );
    expect(
      advanceGuidedDraft({ ...legacy, step: "edit", pendingCommand: null }),
    ).toMatchObject({ ok: false, problem: "unsupported_kind" });
  });
});
