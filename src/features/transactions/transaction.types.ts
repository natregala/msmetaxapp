import type { LedgerCommand } from "@/features/ledger/ledger.types";

export const transactionKinds = [
  "sale",
  "expense",
  "owner_contribution",
  "owner_withdrawal",
  "loan_received",
  "loan_repayment",
  "transfer_in",
  "transfer_out",
] as const;

export const moneyMovements = ["in", "out", "none", "unknown"] as const;
export type TransactionKind = (typeof transactionKinds)[number];
export type MoneyMovement = (typeof moneyMovements)[number];

/** Unparsed amount text belongs to the form, so language changes never round it. */
export type TransactionDraft = {
  businessDate: string;
  kind: TransactionKind;
  description: string;
  amount: string;
  moneyMovement: MoneyMovement;
};

export type TransactionPayload = {
  version: 1;
  businessDate: string;
  kind: TransactionKind;
  amountCentavos: string;
  description: string | null;
  moneyMovement: MoneyMovement;
  reviewConfirmed: true;
  expectedRevision: 0;
};

export type ConfirmTransactionCommand = {
  businessId: string;
  operationId: string;
  payload: TransactionPayload;
};

export type AcceptedTransaction = {
  paymentStatus?: "paid" | "unpaid" | "partial" | "unknown";
  paidCentavos?: string;
  remainingCentavos?: string | null;
  id: string;
  businessId: string;
  businessDate: string;
  kind: TransactionKind;
  amountCentavos: string;
  currency: "PHP";
  description: string | null;
  moneyMovement: MoneyMovement;
  source: "manual" | "document_review";
  reviewStatus: "confirmed";
  revision: number;
  recordedAt: string;
};

export const businessActivities = [
  "products",
  "services",
  "both",
  "other",
] as const;
export type BusinessActivity = (typeof businessActivities)[number];
export type Business = {
  id: string;
  name: string;
  activity: BusinessActivity | null;
  setupCompleted: boolean;
  profileRevision: number;
};
export type SessionUser = { id: string; email: string | null };
export type Acceptance = { id: string; revision: 1 };
export type ValidationCode =
  | "required"
  | "invalid_amount"
  | "amount_too_large"
  | "invalid_date"
  | "invalid_kind"
  | "invalid_movement"
  | "description_too_long";
export type DraftErrors = Partial<
  Record<keyof TransactionDraft, ValidationCode>
>;

export type SavedDraft = {
  operationId: string;
  draft: TransactionDraft;
  step: "edit" | "review";
  /** Once sent, the command stays immutable until its original outcome is known. */
  pendingCommand: ConfirmTransactionCommand | null;
  /** Optional so existing version-one drafts remain readable. */
  guidedStep?: GuidedStep;
  /** An omitted answer is different from an explicitly selected unknown. */
  paymentAnswer?: PaymentAnswer;
  /** Version two separates the event from its initial payment. Older commands stay untouched. */
  entryVersion?: 2;
  paymentAmount?: string;
  paymentDate?: string;
  pendingLedgerCommand?: LedgerCommand | null;
};

export type GuidedStep = "amount" | "payment" | "review";
export type PaymentAnswer = "paid" | "unpaid" | "unknown" | "partial";
export type GuidedProblem =
  | "payment_required"
  | "partial_unsupported"
  | "invalid_payment_amount"
  | "invalid_payment_date"
  | "unsupported_kind"
  | "invalid_step";
export type GuidedValidation = { errors: DraftErrors; problem?: GuidedProblem };
export type GuidedTransition =
  { ok: true; state: SavedDraft } | ({ ok: false } & GuidedValidation);
