import type { TransactionKind } from "@/features/transactions/transaction.types";

export type PaymentStatus = "paid" | "unpaid" | "partial" | "unknown";
export type LedgerRecord = {
  id: string;
  businessId: string;
  kind: TransactionKind;
  businessDate: string;
  amountCentavos: string;
  description: string | null;
  moneyMovement: "in" | "out" | "none" | "unknown";
  revision: number;
  status: "active" | "void";
  paymentKnowledge: "known" | "unknown";
  paidCentavos: string;
  remainingCentavos: string | null;
  paymentStatus: PaymentStatus;
  recordedAt: string;
  source: "manual" | "document_review";
  sourceReference: {
    documentId: string;
    rowId: string;
    sourceType: string;
  } | null;
};
export type LedgerPayment = {
  id: string;
  transactionId: string;
  amountCentavos: string;
  paymentDate: string | null;
  status: "active" | "void";
  revision: number;
  recordedAt: string;
};
export type LedgerHistory = {
  revision: number;
  previousRevision: number;
  actorId: string;
  recordedAt: string;
  interpretation: Record<string, unknown>;
};
export type LedgerDetail = {
  record: LedgerRecord;
  payments: LedgerPayment[];
  history: LedgerHistory[];
  paymentHistory: (LedgerHistory & { paymentId: string })[];
};
export type LedgerList = {
  records: LedgerRecord[];
  total: number;
  page: number;
  pageSize: number;
};
export type LedgerTotals = {
  salesCentavos: string;
  expensesCentavos: string;
  receivedCentavos: string;
  paidCentavos: string;
  receivableCentavos: string;
  payableCentavos: string;
  unknownCount: number;
  recordCount: number;
  voidCount: number;
  undatedPaymentCount?: number;
};
export type LedgerSummary = {
  from: string;
  to: string;
  totals: LedgerTotals;
  records: LedgerRecord[];
  coverage: string;
  payments: LedgerPayment[];
};
export type LedgerSnapshot = LedgerSummary & {
  id: string;
  businessId: string;
  createdAt: string;
  ledgerVersion: string;
  stale: boolean;
  preparation: Record<string, unknown> | null;
  manifest: { recordId: string; revision: number }[];
};
export type LedgerCreateValues = {
  businessDate: string;
  kind: "sale" | "expense" | "owner_contribution" | "owner_withdrawal";
  amountCentavos: string;
  description: string | null;
  paymentStatus: PaymentStatus;
  paymentAmountCentavos: string | null;
  paymentDate: string | null;
};
export type LedgerCommand = {
  businessId: string;
  operationId: string;
  action:
    | "create"
    | "correct"
    | "void"
    | "add_payment"
    | "correct_payment"
    | "void_payment"
    | "resolve_payment";
  recordId?: string;
  expectedRevision: number;
  values: Record<string, unknown>;
};
