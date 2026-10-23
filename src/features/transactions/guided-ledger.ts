import { ledgerCommandSchema } from "@/features/ledger/ledger.schema";
import type { LedgerCommand } from "@/features/ledger/ledger.types";
import {
  amountToCentavos,
  validateGuidedStep,
  validateDraft,
} from "./transaction.rules";
import type { SavedDraft } from "./transaction.types";

export function buildLedgerEntry(
  businessId: string,
  state: SavedDraft,
): LedgerCommand {
  if (state.entryVersion !== 2 || state.step !== "review")
    throw new RangeError("invalid_step");
  const validation =
    state.draft.kind === "sale" || state.draft.kind === "expense"
      ? validateGuidedStep(state)
      : { errors: validateDraft(state.draft), problem: undefined };
  if (validation.problem || Object.keys(validation.errors).length)
    throw new RangeError(validation.problem ?? "invalid_draft");
  const kind = state.draft.kind;
  if (
    !["sale", "expense", "owner_contribution", "owner_withdrawal"].includes(
      kind,
    )
  )
    throw new RangeError("unsupported_kind");
  const answer =
    kind === "sale" || kind === "expense"
      ? state.paymentAnswer
      : state.draft.moneyMovement === "unknown"
        ? "unknown"
        : "paid";
  if (!answer) throw new RangeError("payment_required");
  const amount = amountToCentavos(state.draft.amount);
  return ledgerCommandSchema.parse({
    businessId,
    operationId: state.operationId,
    action: "create",
    expectedRevision: 0,
    values: {
      kind,
      businessDate: state.draft.businessDate,
      amountCentavos: amount,
      description: state.draft.description.trim() || null,
      paymentStatus: answer,
      paymentAmountCentavos:
        answer === "paid"
          ? amount
          : answer === "partial"
            ? amountToCentavos(state.paymentAmount ?? "")
            : null,
      paymentDate:
        answer === "paid" || answer === "partial"
          ? (state.paymentDate ?? state.draft.businessDate)
          : null,
    },
  });
}
