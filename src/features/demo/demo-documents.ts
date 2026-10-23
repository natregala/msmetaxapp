import { z } from "zod";
import {
  detailSchema,
  documentCommandSchema,
  proposalSchema,
  registerValuesSchema,
  validateProposal,
  type DocumentCommand,
  type DocumentDetail,
} from "@/features/documents/document.schema";
import { amountToCentavos } from "@/features/transactions/transaction.rules";
import { applyDemoLedgerCommand, type DemoLedgerState } from "./demo-ledger";

export type DocumentMutationReply = {
  detail: DocumentDetail;
  upload?: { path: string; token: string };
  ocrStatus?: "ready" | "processing";
};
type DocumentReceipt = {
  command: DocumentCommand;
  result: DocumentMutationReply;
};
export type DemoDocumentsState = {
  documents: Record<string, DocumentDetail>;
  receipts: Record<string, DocumentReceipt>;
};
export class DemoDocumentError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function createDemoDocumentsState(): DemoDocumentsState {
  return { documents: {}, receipts: {} };
}
function identity(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(identity).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => JSON.stringify(key) + ":" + identity(entry))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function requireDetail(
  state: DemoDocumentsState,
  businessId: string,
  documentId: string,
) {
  const detail = state.documents[documentId];
  if (!detail || detail.document.business_id !== businessId)
    throw new DemoDocumentError("FORBIDDEN", 403);
  return detail;
}
/** JSON-only state transition. The caller commits both returned states in one demo-store transaction.
 * This is a browser simulation, never a substitute for production authorization or persistence.
 */
export function applyDemoDocumentCommand(
  documentState: DemoDocumentsState,
  ledgerState: DemoLedgerState,
  input: unknown,
  now = new Date().toISOString(),
): {
  documents: DemoDocumentsState;
  ledger: DemoLedgerState;
  result: DocumentMutationReply;
} {
  const parsed = documentCommandSchema.safeParse(input);
  if (!parsed.success) throw new DemoDocumentError("VALIDATION_ERROR", 422);
  const command = parsed.data;
  if (command.businessId !== ledgerState.businessId)
    throw new DemoDocumentError("FORBIDDEN", 403);
  const documents = structuredClone(documentState);
  const ledger = structuredClone(ledgerState);
  const receiptKey = command.businessId + ":" + command.operationId;
  const previous = documents.receipts[receiptKey];
  if (previous) {
    if (identity(previous.command) !== identity(command))
      throw new DemoDocumentError("CONFLICT", 409);
    const detail = requireDetail(
      documents,
      command.businessId,
      command.documentId,
    );
    return {
      documents,
      ledger,
      result: {
        detail,
        ...(detail.document.state === "uploading" && previous.result.upload
          ? { upload: previous.result.upload }
          : {}),
      },
    };
  }
  if (command.action === "extract")
    throw new DemoDocumentError("OCR_NOT_CONFIGURED", 503);
  let detail = documents.documents[command.documentId];
  let upload: DocumentMutationReply["upload"];
  if (command.action === "register") {
    const values = registerValuesSchema.safeParse(command.values);
    if (!values.success || detail || command.expectedRevision !== 0)
      throw new DemoDocumentError("VALIDATION_ERROR", 422);
    const objectPath =
      ledger.actorId +
      "/" +
      command.businessId +
      "/" +
      command.documentId +
      "/original." +
      (values.data.mimeType === "image/png" ? "png" : "jpg");
    detail = {
      document: {
        id: command.documentId,
        business_id: command.businessId,
        source_type: values.data.sourceType,
        object_path: objectPath,
        mime_type: values.data.mimeType,
        byte_size: values.data.byteSize,
        sha256: values.data.sha256,
        state: "uploading",
        revision: 1,
        proposals: [],
        original_extraction: null,
        failure_code: null,
        created_at: now,
        updated_at: now,
      },
      acceptedRows: [],
      duplicateDocuments: [],
      duplicateRecords: [],
      history: [],
    };
    documents.documents[command.documentId] = detail;
    upload = { path: objectPath, token: "browser-demo:" + command.documentId };
  } else {
    detail = requireDetail(documents, command.businessId, command.documentId);
    if (detail.document.revision !== command.expectedRevision)
      throw new DemoDocumentError("CONFLICT", 409);
    if (command.action === "uploaded") {
      if (detail.document.state !== "uploading")
        throw new DemoDocumentError("CONFLICT", 409);
      detail.document.state = "uploaded";
    } else if (command.action === "review") {
      const values = z
        .strictObject({ rows: z.array(proposalSchema).max(50) })
        .safeParse(command.values);
      if (!values.success || detail.document.state === "uploading")
        throw new DemoDocumentError("VALIDATION_ERROR", 422);
      const rows = values.data.rows;
      if (new Set(rows.map((row) => row.id)).size !== rows.length)
        throw new DemoDocumentError("VALIDATION_ERROR", 422);
      for (const accepted of detail.acceptedRows) {
        const before = detail.document.proposals?.find(
          (row) => row.id === accepted.rowId,
        );
        const after = rows.find((row) => row.id === accepted.rowId);
        if (!before || !after || identity(before) !== identity(after))
          throw new DemoDocumentError("ACCEPTED_ROW_LOCKED", 409);
      }
      detail.document.proposals = rows;
      detail.document.state = "review";
    } else if (command.action === "accept") {
      const values = z
        .strictObject({
          rowId: z.uuid(),
          reviewConfirmed: z.literal(true),
          duplicateReviewed: z.literal(true),
        })
        .safeParse(command.values);
      if (!values.success || detail.document.state !== "review")
        throw new DemoDocumentError("VALIDATION_ERROR", 422);
      const row = detail.document.proposals?.find(
        (row) => row.id === values.data.rowId,
      );
      if (!row || validateProposal(row).length)
        throw new DemoDocumentError("VALIDATION_ERROR", 422);
      if (detail.acceptedRows.some((accepted) => accepted.rowId === row.id))
        throw new DemoDocumentError("ROW_ALREADY_ACCEPTED", 409);
      const amount = amountToCentavos(row.amount);
      const accepted = applyDemoLedgerCommand(
        ledger,
        {
          businessId: command.businessId,
          operationId: command.operationId,
          action: "create",
          expectedRevision: 0,
          values: {
            businessDate: row.businessDate,
            kind: row.kind,
            amountCentavos: amount,
            description: row.description.trim() || null,
            paymentStatus: row.paymentStatus,
            paymentAmountCentavos:
              row.paymentStatus === "paid"
                ? amount
                : row.paymentStatus === "partial"
                  ? amountToCentavos(row.paymentAmount ?? "")
                  : null,
            paymentDate:
              row.paymentStatus === "paid" || row.paymentStatus === "partial"
                ? row.paymentDate
                : null,
          },
        },
        {
          now,
          sourceReference: {
            documentId: command.documentId,
            rowId: row.id,
            sourceType: detail.document.source_type,
          },
        },
      );
      Object.assign(ledger, accepted.state);
      detail.acceptedRows.push({
        rowId: row.id,
        transactionId: accepted.result.id,
      });
    } else {
      throw new DemoDocumentError("INVALID_REQUEST");
    }
    detail.document.revision++;
    detail.document.updated_at = now;
  }
  detail.history.push({
    revision: detail.document.revision,
    action: command.action,
    recordedAt: now,
    actorId: ledger.actorId,
    content: {
      proposals: structuredClone(detail.document.proposals ?? []),
      state: detail.document.state,
    },
  });
  const result = { detail, ...(upload ? { upload } : {}) };
  documents.receipts[receiptKey] = {
    command: structuredClone(command),
    result: structuredClone(result),
  };
  return { documents, ledger, result };
}

const imageUrls = new Map<string, { key: string; url: string }>();
const placeholder =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#fff7e3"/><text x="30" y="70" fill="#183f33" font-family="sans-serif" font-size="24">Browser demo · photo not stored yet</text></svg>',
  );
export function demoDocumentImageUrl(
  businessId: string,
  documentId: string,
): string {
  return imageUrls.get(businessId + ":" + documentId)?.url ?? placeholder;
}
export function clearDemoDocumentImages() {
  for (const image of imageUrls.values()) URL.revokeObjectURL(image.url);
  imageUrls.clear();
}
async function primeImage(
  detail: DocumentDetail,
  getDemoImage: (key: string) => Promise<Blob | null>,
) {
  const blob = await getDemoImage(detail.document.object_path);
  const key = detail.document.business_id + ":" + detail.document.id;
  const previous = imageUrls.get(key);
  if (previous) URL.revokeObjectURL(previous.url);
  if (blob)
    imageUrls.set(key, {
      key: detail.document.object_path,
      url: URL.createObjectURL(blob),
    });
  else imageUrls.delete(key);
}
function refreshCandidates(
  documents: DemoDocumentsState,
  ledger: DemoLedgerState,
  detail: DocumentDetail,
) {
  detail.duplicateDocuments = Object.values(documents.documents)
    .filter(
      (other) =>
        other.document.business_id === detail.document.business_id &&
        other.document.id !== detail.document.id &&
        other.document.sha256 === detail.document.sha256,
    )
    .map((other) => ({
      id: other.document.id,
      createdAt: other.document.created_at,
    }));
  // Ledger details retain every accepted record; matching is advisory and never removes rows.
  detail.duplicateRecords = [];
  for (const row of detail.document.proposals ?? []) {
    if (validateProposal(row).includes("amount")) continue;
    const amount = amountToCentavos(row.amount);
    for (const entry of ledger.details) {
      const record = entry.record;
      if (
        record.businessDate === row.businessDate &&
        record.kind === row.kind &&
        record.amountCentavos === amount &&
        !detail.acceptedRows.some(
          (accepted) =>
            accepted.rowId === row.id && accepted.transactionId === record.id,
        )
      ) {
        detail.duplicateRecords.push({
          rowId: row.id,
          transactionId: record.id,
          businessDate: record.businessDate,
          amountCentavos: record.amountCentavos,
          description: record.description,
        });
      }
    }
  }
}
export async function listDemoDocuments(businessId: string) {
  const { withDemoState } = await import("./demo-store");
  return withDemoState((state) => {
    if (!state.ledgers[businessId])
      throw new DemoDocumentError("FORBIDDEN", 403);
    return {
      documents: Object.values(state.documents.documents)
        .filter((item) => item.document.business_id === businessId)
        .sort((a, b) =>
          b.document.created_at.localeCompare(a.document.created_at),
        )
        .slice(0, 100)
        .map((item) => ({
          ...item.document,
          proposals: undefined,
          original_extraction: undefined,
        })),
      ocrConfigured: false,
    };
  });
}
export async function readDemoDocument(businessId: string, documentId: string) {
  const { withDemoState, getDemoImage } = await import("./demo-store");
  return withDemoState(async (state) => {
    const ledger = state.ledgers[businessId];
    if (!ledger) throw new DemoDocumentError("FORBIDDEN", 403);
    const detail = structuredClone(
      requireDetail(state.documents, businessId, documentId),
    );
    refreshCandidates(state.documents, ledger, detail);
    await primeImage(detail, getDemoImage);
    return { ...detailSchema.parse(detail), ocrConfigured: false };
  });
}
export async function mutateDemoDocument(command: DocumentCommand) {
  const { withDemoState, getDemoImage } = await import("./demo-store");
  return withDemoState(async (state) => {
    const ledger = state.ledgers[command.businessId];
    if (!ledger) throw new DemoDocumentError("FORBIDDEN", 403);
    if (command.action === "uploaded") {
      const detail = requireDetail(
        state.documents,
        command.businessId,
        command.documentId,
      );
      if (!(await getDemoImage(detail.document.object_path)))
        throw new DemoDocumentError("UPLOAD_INCOMPLETE", 409);
    }
    const result = applyDemoDocumentCommand(state.documents, ledger, command);
    state.documents = result.documents;
    state.ledgers[command.businessId] = result.ledger;
    refreshCandidates(state.documents, result.ledger, result.result.detail);
    await primeImage(result.result.detail, getDemoImage);
    return result.result;
  });
}
export async function uploadDemoDocumentImage(
  upload: { path: string; token: string },
  file: Blob,
) {
  const { withDemoState, getDemoImage, putDemoImage } =
    await import("./demo-store");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return withDemoState(async (state) => {
    const detail = Object.values(state.documents.documents).find(
      (item) => item.document.object_path === upload.path,
    );
    if (
      !detail ||
      !state.ledgers[detail.document.business_id] ||
      upload.token !== "browser-demo:" + detail.document.id
    )
      throw new DemoDocumentError("FORBIDDEN", 403);
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
      bytes.length !== detail.document.byte_size ||
      hash !== detail.document.sha256 ||
      file.type !== detail.document.mime_type ||
      (file.type === "image/png" ? !png : !jpeg)
    )
      throw new DemoDocumentError("INVALID_IMAGE", 422);
    const previous = await getDemoImage(upload.path);
    if (previous) return; // Immutable original: same metadata fingerprint was checked above.
    if (detail.document.state !== "uploading")
      throw new DemoDocumentError("CONFLICT", 409);
    await putDemoImage(upload.path, file);
  });
}
