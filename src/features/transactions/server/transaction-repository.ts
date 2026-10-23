import "server-only";
import type { UserDatabase } from "@/lib/supabase/server";
import { OperationError } from "@/lib/http/result";
import type {
  Acceptance,
  AcceptedTransaction,
  ConfirmTransactionCommand,
} from "../transaction.types";
import { acceptanceSchema } from "../transaction.schema";

export async function acceptManualTransaction(
  database: UserDatabase,
  command: ConfirmTransactionCommand,
): Promise<Acceptance> {
  const { data, error } = await database.rpc("accept_manual_transaction", {
    p_business_id: command.businessId,
    p_operation_id: command.operationId,
    p_payload: command.payload,
  });
  if (error) {
    if (error.code === "42501") throw new OperationError("FORBIDDEN", 403);
    if (
      error.code === "23505" ||
      error.code === "40001" ||
      (error.code === "P0001" && error.message === "OPERATION_CONFLICT")
    )
      throw new OperationError("CONFLICT", 409);
    if (error.code === "22023" || error.code === "23514")
      throw new OperationError("VALIDATION_ERROR", 422);
    throw new OperationError("SERVER_ERROR", 503);
  }
  const result = acceptanceSchema.safeParse(data);
  if (!result.success) throw new OperationError("SERVER_ERROR", 503);
  return result.data;
}

export async function readTransactions(
  database: UserDatabase,
  businessId: string,
): Promise<AcceptedTransaction[]> {
  const { data, error } = await database
    .from("transactions")
    .select(
      "id,business_id,business_date,kind,amount_centavos,currency,description,money_movement,source,review_status,revision,recorded_at",
    )
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("recorded_at", { ascending: false })
    .limit(50);
  if (error) throw new OperationError("SERVER_ERROR", 503);
  return data.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    businessDate: row.business_date,
    kind: row.kind as AcceptedTransaction["kind"],
    amountCentavos: String(row.amount_centavos),
    currency: row.currency as "PHP",
    description: row.description,
    moneyMovement: row.money_movement as AcceptedTransaction["moneyMovement"],
    source: row.source as AcceptedTransaction["source"],
    reviewStatus: row.review_status as "confirmed",
    revision: row.revision,
    recordedAt: row.recorded_at,
  }));
}
