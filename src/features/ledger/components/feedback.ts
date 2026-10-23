import { LedgerApiError } from "../client/commands";
import { ledgerMessages } from "./ledger-messages";
export function errorText(error: string, t: typeof ledgerMessages.en): string {
  if (error === "LINKED_PAYMENT_CONFLICT") return t.linkedConflict;
  if (error === "CLARIFICATION_REQUIRED") return t.clarifyFirst;
  if (error === "PAYMENT_BEFORE_RECORD") return t.paymentBefore;
  if (error === "INVALID_PAYMENT") return t.invalidPayment;
  if (error === "UNSUPPORTED_SETTLEMENT") return t.invalidPayment;
  if (error === "PERIOD_TOO_LARGE") return t.largePeriod;
  if (error === "PROFILE_PERIOD_MISMATCH") return t.validation;
  if (error === "CONFLICT") return t.conflict;
  if (error === "VALIDATION_ERROR") return t.validation;
  if (error === "UNAUTHENTICATED" || error === "AUTH_FAILED")
    return t.unauthorized;
  if (error === "FORBIDDEN") return t.forbidden;
  if (error === "NETWORK_ERROR" || error === "SERVER_ERROR") return t.network;
  if (
    error.includes("LOCAL") ||
    error === "QuotaExceededError" ||
    error === "UnknownError"
  )
    return t.storageError;
  return t.generic;
}
export function code(error: unknown) {
  return error instanceof LedgerApiError
    ? error.code
    : error instanceof Error
      ? error.message
      : "SERVER_ERROR";
}
