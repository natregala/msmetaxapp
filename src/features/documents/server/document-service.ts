import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/features/auth/server/session";
import { requireBusiness } from "@/features/businesses/server/business-service";
import { OperationError } from "@/lib/http/result";
import {
  documentCommandSchema,
  proposalSchema,
  registerValuesSchema,
  validateProposal,
  MAX_IMAGE_BYTES,
} from "../document.schema";
import { proposeNotebookRows } from "../extraction.rules";
import {
  documentRpc,
  readDocument,
  readDocuments,
} from "./document-repository";
import { ocrConfigured, startRead, pollRead } from "./azure-read";
import type { UserDatabase } from "@/lib/supabase/server";
import type { SourceDocument } from "../document.schema";

const BUCKET = "notebook-sources";
export function validateImageBytes(bytes: Uint8Array, mime: string) {
  if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES)
    throw new OperationError("INVALID_IMAGE", 422);
  const png =
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (
    (mime === "image/png" && !png) ||
    (mime === "image/jpeg" && !jpeg) ||
    !["image/png", "image/jpeg"].includes(mime)
  )
    throw new OperationError("INVALID_IMAGE", 422);
}
async function downloadOriginal(
  database: UserDatabase,
  document: SourceDocument,
) {
  const { data, error } = await database.storage
    .from(BUCKET)
    .download(document.object_path);
  if (error || !data) throw new OperationError("UPLOAD_INCOMPLETE", 409);
  const bytes = new Uint8Array(await data.arrayBuffer());
  validateImageBytes(bytes, document.mime_type);
  if (
    bytes.length !== document.byte_size ||
    createHash("sha256").update(bytes).digest("hex") !== document.sha256
  )
    throw new OperationError("INVALID_IMAGE", 422);
  return bytes;
}
export async function getDocuments(input: unknown) {
  const value = z
    .strictObject({ businessId: z.uuid(), documentId: z.uuid().optional() })
    .parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, value.businessId, user.id);
  return value.documentId
    ? {
        ...(await readDocument(database, value.businessId, value.documentId)),
        ocrConfigured: ocrConfigured(),
      }
    : {
        ...(await readDocuments(database, value.businessId)),
        ocrConfigured: ocrConfigured(),
      };
}
export async function getDocumentImage(input: unknown) {
  const value = z
    .strictObject({ businessId: z.uuid(), documentId: z.uuid() })
    .parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, value.businessId, user.id);
  const { document } = await readDocument(
    database,
    value.businessId,
    value.documentId,
  );
  return {
    bytes: await downloadOriginal(database, document),
    mime: document.mime_type,
  };
}
export async function changeDocument(input: unknown) {
  const command = documentCommandSchema.parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, command.businessId, user.id);
  const args: {
    p_business_id: string;
    p_document_id: string;
    p_operation_id: string;
    p_expected_revision: number;
    p_action: string;
    p_values: Record<string, unknown>;
  } = {
    p_business_id: command.businessId,
    p_document_id: command.documentId,
    p_operation_id: command.operationId,
    p_expected_revision: command.expectedRevision,
    p_action: command.action,
    p_values: command.values,
  };
  if (command.action === "register") {
    args.p_values = registerValuesSchema.parse(command.values);
    await documentRpc(database, "document_command", args);
    const detail = await readDocument(
      database,
      command.businessId,
      command.documentId,
    );
    if (detail.document.state !== "uploading") return { detail };
    const { data, error } = await database.storage
      .from(BUCKET)
      .createSignedUploadUrl(detail.document.object_path);
    if (error || !data) throw new OperationError("UPLOAD_FAILED", 503);
    return { detail, upload: { path: data.path, token: data.token } };
  }
  const detail = await readDocument(
    database,
    command.businessId,
    command.documentId,
  );
  if (command.action === "uploaded")
    await downloadOriginal(database, detail.document);
  if (command.action === "review") {
    args.p_values = z
      .strictObject({ rows: z.array(proposalSchema).max(50) })
      .parse(command.values);
  }
  if (command.action === "accept") {
    const value = z
      .strictObject({
        rowId: z.uuid(),
        reviewConfirmed: z.literal(true),
        duplicateReviewed: z.literal(true),
      })
      .parse(command.values);
    const row = detail.document.proposals?.find(
      (row) => row.id === value.rowId,
    );
    if (!row || validateProposal(row).length)
      throw new OperationError("VALIDATION_ERROR", 422);
    args.p_values = value;
  }
  if (command.action === "extract") {
    z.strictObject({ consent: z.literal(true) }).parse(command.values);
    if (!ocrConfigured()) throw new OperationError("OCR_NOT_CONFIGURED", 503);
    // Replaying after completed extraction never starts another provider job.
    if (detail.document.original_extraction)
      return { detail, ocrStatus: "ready" as const };
    if (detail.document.state === "uploading")
      throw new OperationError("UPLOAD_INCOMPLETE", 409);
    let job = await documentRpc(database, "document_provider_job", {
      p_business_id: command.businessId,
      p_document_id: command.documentId,
      p_operation_url: null,
    });
    if (!job) {
      const bytes = await downloadOriginal(database, detail.document);
      const operation = await startRead(bytes);
      job = await documentRpc(database, "document_provider_job", {
        p_business_id: command.businessId,
        p_document_id: command.documentId,
        p_operation_url: operation,
      });
    }
    if (typeof job !== "string") throw new OperationError("OCR_FAILED", 503);
    let lines;
    try {
      lines = await pollRead(job);
    } catch (error) {
      if (error instanceof OperationError && error.code === "OCR_JOB_FAILED") {
        await documentRpc(database, "document_provider_job", {
          p_business_id: command.businessId,
          p_document_id: command.documentId,
          p_operation_url: "",
        });
        throw new OperationError("OCR_FAILED", 503);
      }
      throw error;
    }
    if (!lines) return { detail, ocrStatus: "processing" as const };
    args.p_action = "extracted";
    args.p_values = {
      rows: proposeNotebookRows(
        lines,
        detail.document.source_type === "sales_notebook" ? "sale" : "expense",
        randomUUID,
      ),
      extraction: {
        provider: "azure-document-intelligence",
        model: "prebuilt-read",
        apiVersion: "2024-11-30",
        lines,
        processedAt: new Date().toISOString(),
      },
    };
  }
  await documentRpc(database, "document_command", args);
  return {
    detail: await readDocument(
      database,
      command.businessId,
      command.documentId,
    ),
    ocrStatus: command.action === "extract" ? "ready" : undefined,
  };
}
