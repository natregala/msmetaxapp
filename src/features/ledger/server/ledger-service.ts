import "server-only";
import { z } from "zod";
import { requireSession } from "@/features/auth/server/session";
import { requireBusiness } from "@/features/businesses/server/business-service";
import { OperationError } from "@/lib/http/result";
import type { Json } from "@/lib/supabase/database.types";
import {
  ledgerCommandSchema,
  ledgerFilterSchema,
  ledgerPeriodSchema,
  snapshotSchema,
  ledgerDetailSchema,
  ledgerListSchema,
  ledgerSummarySchema,
  ledgerSnapshotSchema,
} from "../ledger.schema";

export function ledgerDatabaseError(error: {
  code: string;
  message: string;
}): never {
  if (error.code === "42501") throw new OperationError("FORBIDDEN", 403);
  if (
    ["23505", "40001", "40P01"].includes(error.code) ||
    error.code === "P0001"
  )
    throw new OperationError(
      error.message === "CLARIFICATION_REQUIRED"
        ? "CLARIFICATION_REQUIRED"
        : error.message === "LINKED_PAYMENT_CONFLICT"
          ? "LINKED_PAYMENT_CONFLICT"
          : "CONFLICT",
      409,
    );
  if (["22023", "23514", "22P02", "22007", "22008"].includes(error.code))
    throw new OperationError(
      [
        "INVALID_PAYMENT",
        "PAYMENT_BEFORE_RECORD",
        "PERIOD_TOO_LARGE",
        "UNSUPPORTED_SETTLEMENT",
        "PROFILE_PERIOD_MISMATCH",
      ].includes(error.message)
        ? error.message
        : "VALIDATION_ERROR",
      422,
    );
  throw new OperationError("SERVER_ERROR", 503);
}
function result<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new OperationError("SERVER_ERROR", 503);
  return parsed.data;
}
export async function mutateLedger(input: unknown) {
  const command = ledgerCommandSchema.parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, command.businessId, user.id);
  const { data, error } = await database.rpc("ledger_mutate", {
    p_business_id: command.businessId,
    p_operation_id: command.operationId,
    p_action: command.action,
    // Generated Supabase argument types omit PostgreSQL nullable function
    // arguments. The SQL contract requires an explicit NULL for create.
    p_record_id: ("recordId" in command ? command.recordId : null) as string,
    p_expected_revision: command.expectedRevision,
    p_values: command.values as Json,
  });
  if (error) ledgerDatabaseError(error);
  return result(
    z.object({ id: z.uuid(), revision: z.number().int().positive() }),
    data,
  );
}
export async function listLedger(input: unknown) {
  const { businessId, ...filters } = ledgerFilterSchema.parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, businessId, user.id);
  const { data, error } = await database.rpc("ledger_list", {
    p_business_id: businessId,
    p_filters: filters as Json,
  });
  if (error) ledgerDatabaseError(error);
  return result(ledgerListSchema, data);
}
export async function ledgerDetail(businessId: string, recordId: string) {
  z.uuid().parse(businessId);
  z.uuid().parse(recordId);
  const { database, user } = await requireSession();
  await requireBusiness(database, businessId, user.id);
  const { data, error } = await database.rpc("ledger_detail", {
    p_business_id: businessId,
    p_record_id: recordId,
  });
  if (error) ledgerDatabaseError(error);
  return result(ledgerDetailSchema, data);
}
export async function ledgerSummary(input: unknown) {
  const values = ledgerPeriodSchema.parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, values.businessId, user.id);
  const { data, error } = await database.rpc("ledger_summary", {
    p_business_id: values.businessId,
    p_from: values.from,
    p_to: values.to,
  });
  if (error) ledgerDatabaseError(error);
  return result(ledgerSummarySchema, data);
}
export async function createLedgerSnapshot(input: unknown) {
  const values = snapshotSchema.parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, values.businessId, user.id);
  const { data, error } = await database.rpc("ledger_snapshot", {
    p_business_id: values.businessId,
    p_operation_id: values.operationId,
    p_from: values.from,
    p_to: values.to,
    p_preparation: (values.preparation as Json) ?? null,
  });
  if (error) ledgerDatabaseError(error);
  return result(ledgerSnapshotSchema, data);
}
export async function readLedgerSnapshot(
  businessId: string,
  snapshotId: string,
) {
  z.uuid().parse(businessId);
  z.uuid().parse(snapshotId);
  const { database, user } = await requireSession();
  await requireBusiness(database, businessId, user.id);
  const { data, error } = await database.rpc("ledger_read_snapshot", {
    p_business_id: businessId,
    p_snapshot_id: snapshotId,
  });
  if (error) ledgerDatabaseError(error);
  return result(ledgerSnapshotSchema, data);
}
