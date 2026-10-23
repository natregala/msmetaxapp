import "server-only";
import { requireSession } from "@/features/auth/server/session";
import { requireBusiness } from "@/features/businesses/server/business-service";
import { businessIdSchema, commandSchema } from "../transaction.schema";
import {
  acceptManualTransaction,
  readTransactions,
} from "./transaction-repository";

export async function confirmReviewedTransaction(input: unknown) {
  const { database, user } = await requireSession();
  const command = commandSchema.parse(input);
  await requireBusiness(database, command.businessId, user.id);
  return acceptManualTransaction(database, command);
}

export async function listAcceptedTransactions(input: unknown) {
  const { database, user } = await requireSession();
  const businessId = businessIdSchema.parse(input);
  await requireBusiness(database, businessId, user.id);
  return { records: await readTransactions(database, businessId) };
}
