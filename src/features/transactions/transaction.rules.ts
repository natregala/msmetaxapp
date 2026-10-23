import {
  transactionKinds,
  type ConfirmTransactionCommand,
  type DraftErrors,
  type MoneyMovement,
  type TransactionDraft,
  type TransactionKind,
  type SavedDraft,
  type GuidedStep,
  type PaymentAnswer,
  type GuidedValidation,
  type GuidedTransition,
} from "./transaction.types";

export const MAX_CENTAVOS = 999_999_999_999n;
export const MIN_BUSINESS_DATE = "1900-01-01";
export const MAX_BUSINESS_DATE = "2100-12-31";

/** No parseFloat, multiplication of decimal floats, rounding, or defaulting to zero. */
export function amountToCentavos(text: string): string {
  const value = text.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value))
    throw new RangeError("invalid_amount");
  const [pesos, fraction = ""] = value.split(".");
  const centavos = BigInt(pesos) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (centavos > MAX_CENTAVOS) throw new RangeError("amount_too_large");
  return centavos.toString();
}

export function isCanonicalCentavos(value: string): boolean {
  return /^(0|[1-9]\d{0,11})$/.test(value) && BigInt(value) <= MAX_CENTAVOS;
}

export function isBusinessDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < MIN_BUSINESS_DATE ||
    value > MAX_BUSINESS_DATE
  )
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function allowedMovements(
  kind: TransactionKind,
): readonly MoneyMovement[] {
  switch (kind) {
    case "sale":
      return ["in", "none", "unknown"];
    case "expense":
      return ["out", "none", "unknown"];
    case "owner_contribution":
    case "loan_received":
    case "transfer_in":
      return ["in", "unknown"];
    case "owner_withdrawal":
    case "loan_repayment":
    case "transfer_out":
      return ["out", "unknown"];
    default:
      return [];
  }
}

export function validateDraft(draft: TransactionDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.amount.trim()) errors.amount = "required";
  else {
    try {
      amountToCentavos(draft.amount);
    } catch (error) {
      errors.amount =
        error instanceof Error && error.message === "amount_too_large"
          ? "amount_too_large"
          : "invalid_amount";
    }
  }
  if (!draft.businessDate) errors.businessDate = "required";
  else if (!isBusinessDate(draft.businessDate))
    errors.businessDate = "invalid_date";
  if (!transactionKinds.includes(draft.kind)) errors.kind = "invalid_kind";
  if (!allowedMovements(draft.kind).includes(draft.moneyMovement))
    errors.moneyMovement = "invalid_movement";
  if ([...draft.description.trim()].length > 500)
    errors.description = "description_too_long";
  return errors;
}

export function buildCommand(
  businessId: string,
  operationId: string,
  draft: TransactionDraft,
): ConfirmTransactionCommand {
  if (Object.keys(validateDraft(draft)).length)
    throw new RangeError("invalid_draft");
  return {
    businessId,
    operationId,
    payload: {
      version: 1,
      businessDate: draft.businessDate,
      kind: draft.kind,
      amountCentavos: amountToCentavos(draft.amount),
      description: draft.description.trim() || null,
      moneyMovement: draft.moneyMovement,
      reviewConfirmed: true,
      expectedRevision: 0,
    },
  };
}

export function isGuidedKind(
  kind: TransactionKind,
): kind is "sale" | "expense" {
  return kind === "sale" || kind === "expense";
}

export function resolveGuidedStep(state: SavedDraft): GuidedStep {
  if (state.pendingCommand) return "review";
  return state.guidedStep ?? (state.step === "review" ? "review" : "amount");
}

export function resolvePaymentAnswer(
  state: SavedDraft,
): PaymentAnswer | undefined {
  if (state.paymentAnswer) return state.paymentAnswer;
  if (state.draft.moneyMovement === "in" || state.draft.moneyMovement === "out")
    return "paid";
  if (state.draft.moneyMovement === "none") return "unpaid";
  // Old reviewed/pending drafts already contain an explicit reviewed interpretation.
  if ((!state.guidedStep && state.step === "review") || state.pendingCommand)
    return "unknown";
  return undefined;
}

/** Partial payment needs its own supported record contract; never silently map it. */
export function paymentMovement(
  kind: "sale" | "expense",
  answer: PaymentAnswer,
): MoneyMovement | null {
  if (answer === "partial") return null;
  if (answer === "unpaid") return "none";
  if (answer === "unknown") return "unknown";
  return kind === "sale" ? "in" : "out";
}

export function selectPaymentAnswer(
  state: SavedDraft,
  answer: PaymentAnswer,
): SavedDraft {
  if (state.pendingCommand || state.pendingLedgerCommand)
    throw new RangeError("pending_command");
  if (!isGuidedKind(state.draft.kind)) throw new RangeError("unsupported_kind");
  return {
    ...state,
    step: "edit",
    guidedStep: "payment",
    paymentAnswer: answer,
    draft: {
      ...state.draft,
      moneyMovement: paymentMovement(state.draft.kind, answer) ?? "unknown",
    },
  };
}

export function validateGuidedStep(state: SavedDraft): GuidedValidation {
  const errors = validateDraft(state.draft);
  if (!isGuidedKind(state.draft.kind))
    return { errors, problem: "unsupported_kind" };
  if (resolveGuidedStep(state) === "amount") return { errors };
  const answer = resolvePaymentAnswer(state);
  if (!answer) return { errors, problem: "payment_required" };
  if (answer === "partial") {
    if (state.entryVersion !== 2)
      return { errors, problem: "partial_unsupported" };
    try {
      const paid = BigInt(amountToCentavos(state.paymentAmount ?? ""));
      if (paid <= 0n || paid >= BigInt(amountToCentavos(state.draft.amount)))
        return { errors, problem: "invalid_payment_amount" };
    } catch {
      return { errors, problem: "invalid_payment_amount" };
    }
    if (
      !isBusinessDate(state.paymentDate ?? state.draft.businessDate) ||
      (state.paymentDate ?? state.draft.businessDate) < state.draft.businessDate
    )
      return { errors, problem: "invalid_payment_date" };
    return { errors };
  }
  if (
    state.entryVersion === 2 &&
    answer === "paid" &&
    (!isBusinessDate(state.paymentDate ?? state.draft.businessDate) ||
      (state.paymentDate ?? state.draft.businessDate) <
        state.draft.businessDate)
  )
    return { errors, problem: "invalid_payment_date" };
  if (paymentMovement(state.draft.kind, answer) !== state.draft.moneyMovement)
    errors.moneyMovement = "invalid_movement";
  return { errors };
}

export function advanceGuidedDraft(state: SavedDraft): GuidedTransition {
  const validation = validateGuidedStep(state);
  if (validation.problem || Object.keys(validation.errors).length)
    return { ok: false, ...validation };
  const currentStep = resolveGuidedStep(state);
  if (state.pendingCommand || currentStep === "review")
    return { ok: false, errors: {}, problem: "invalid_step" };
  if (currentStep === "amount")
    return {
      ok: true,
      state: { ...state, step: "edit", guidedStep: "payment" },
    };
  return {
    ok: true,
    state: { ...state, step: "review", guidedStep: "review" },
  };
}

/** New guided entries require the payment step; older reviewed records retain their contract. */
export function buildGuidedCommand(
  businessId: string,
  state: SavedDraft,
): ConfirmTransactionCommand {
  if (resolveGuidedStep(state) !== "review" || state.step !== "review")
    throw new RangeError("invalid_step");
  if (state.paymentAnswer === "partial")
    throw new RangeError("partial_unsupported");
  if (isGuidedKind(state.draft.kind)) {
    const result = validateGuidedStep(state);
    if (result.problem || Object.keys(result.errors).length)
      throw new RangeError(result.problem ?? "invalid_draft");
  } else if (state.guidedStep) throw new RangeError("unsupported_kind");
  const command = buildCommand(businessId, state.operationId, state.draft);
  if (
    state.pendingCommand &&
    JSON.stringify(command) !== JSON.stringify(state.pendingCommand)
  )
    throw new RangeError("pending_command");
  return state.pendingCommand ?? command;
}

export function todayInManila(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Format exact digits without converting the decimal amount to a floating point number. */
export function formatPHP(centavos: string): string {
  if (!isCanonicalCentavos(centavos)) throw new RangeError("invalid_centavos");
  const digits = centavos.padStart(3, "0");
  const pesos = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${pesos}.${digits.slice(-2)}`;
}
