import { z } from "zod";
import {
  isBusinessDate,
  amountToCentavos,
} from "@/features/transactions/transaction.rules";

export const sourceTypes = ["sales_notebook", "expense_notebook"] as const;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const proposalSchema = z.strictObject({
  id: z.uuid(),
  page: z.literal(1),
  line: z.number().int().min(1).max(9999),
  sourceText: z.string().max(1000),
  businessDate: z.string().max(10),
  description: z.string().max(500),
  amount: z.string().max(32),
  kind: z.enum(["sale", "expense", "unknown"]),
  paymentStatus: z.enum(["paid", "unpaid", "partial", "unknown"]),
  paymentAmount: z.string().max(32).optional(),
  paymentDate: z.string().max(10).optional(),
  uncertainties: z.array(z.string().max(100)).max(10),
});
export type DocumentProposal = z.infer<typeof proposalSchema>;
export const documentSchema = z.object({
  id: z.uuid(),
  business_id: z.uuid(),
  source_type: z.enum(sourceTypes),
  object_path: z.string(),
  mime_type: z.enum(["image/jpeg", "image/png"]),
  byte_size: z.number().int(),
  sha256: z.string(),
  state: z.enum(["uploading", "uploaded", "review", "failed"]),
  revision: z.number().int(),
  proposals: z.array(proposalSchema).max(50).optional(),
  original_extraction: z.unknown().optional(),
  failure_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type SourceDocument = z.infer<typeof documentSchema>;
export const detailSchema = z.object({
  document: documentSchema,
  acceptedRows: z.array(z.object({ rowId: z.uuid(), transactionId: z.uuid() })),
  duplicateDocuments: z.array(
    z.object({ id: z.uuid(), createdAt: z.string() }),
  ),
  duplicateRecords: z.array(
    z.object({
      rowId: z.uuid(),
      transactionId: z.uuid(),
      businessDate: z.string(),
      amountCentavos: z.string(),
      description: z.string().nullable(),
    }),
  ),
  history: z.array(
    z.object({
      revision: z.number(),
      action: z.string(),
      recordedAt: z.string(),
      actorId: z.uuid(),
      content: z.unknown(),
    }),
  ),
});
export type DocumentDetail = z.infer<typeof detailSchema>;
export const documentCommandSchema = z.strictObject({
  businessId: z.uuid(),
  documentId: z.uuid(),
  operationId: z.uuid(),
  expectedRevision: z.number().int().min(0),
  action: z.enum(["register", "uploaded", "review", "accept", "extract"]),
  values: z.record(z.string(), z.unknown()),
});
export type DocumentCommand = z.infer<typeof documentCommandSchema>;
export const registerValuesSchema = z.strictObject({
  sourceType: z.enum(sourceTypes),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export function validateProposal(row: DocumentProposal): string[] {
  const problems: string[] = [];
  if (!isBusinessDate(row.businessDate)) problems.push("date");
  try {
    amountToCentavos(row.amount);
  } catch {
    problems.push("amount");
  }
  if (row.kind === "unknown") problems.push("kind");
  if (row.line < 1 || row.line > 9999 || !Number.isInteger(row.line))
    problems.push("line");
  if (
    row.paymentStatus === "paid" &&
    (!row.paymentDate ||
      !isBusinessDate(row.paymentDate) ||
      row.paymentDate < row.businessDate)
  )
    problems.push("paymentDate");
  if (row.paymentStatus === "partial") {
    try {
      const paid = BigInt(amountToCentavos(row.paymentAmount ?? ""));
      const full = BigInt(amountToCentavos(row.amount));
      if (paid <= 0n || paid >= full) problems.push("payment");
    } catch {
      problems.push("payment");
    }
    if (
      !row.paymentDate ||
      !isBusinessDate(row.paymentDate) ||
      row.paymentDate < row.businessDate
    )
      problems.push("paymentDate");
  }
  return problems;
}
