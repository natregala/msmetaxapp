import "server-only";
import type { UserDatabase } from "@/lib/supabase/server";
import { OperationError } from "@/lib/http/result";
import { detailSchema, documentSchema } from "../document.schema";
import { z } from "zod";

// Keep transport casting at one RPC adapter; every returned document value is validated here.
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { code: string; message: string } | null;
}>;
export async function documentRpc(
  database: UserDatabase,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await (database.rpc.bind(database) as unknown as Rpc)(
    name,
    args,
  );
  if (error) {
    if (error.code === "42501") throw new OperationError("FORBIDDEN", 403);
    if (error.code === "P0001")
      throw new OperationError(
        error.message === "ACCEPTED_ROW_LOCKED"
          ? "ACCEPTED_ROW_LOCKED"
          : error.message === "ROW_ALREADY_ACCEPTED"
            ? "ROW_ALREADY_ACCEPTED"
            : "CONFLICT",
        409,
      );
    if (
      error.code === "22023" ||
      error.code === "22P02" ||
      error.code === "23514"
    )
      throw new OperationError("VALIDATION_ERROR", 422);
    throw new OperationError("SERVER_ERROR", 503);
  }
  return data;
}
export async function readDocument(
  database: UserDatabase,
  businessId: string,
  documentId: string,
) {
  return detailSchema.parse(
    await documentRpc(database, "document_read", {
      p_business_id: businessId,
      p_document_id: documentId,
    }),
  );
}
export async function readDocuments(
  database: UserDatabase,
  businessId: string,
) {
  return z.object({ documents: z.array(documentSchema) }).parse(
    await documentRpc(database, "document_read", {
      p_business_id: businessId,
      p_document_id: null,
    }),
  );
}
