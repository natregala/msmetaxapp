import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  applyDemoDocumentCommand,
  createDemoDocumentsState,
  clearDemoDocumentImages,
  listDemoDocuments,
  readDemoDocument,
  mutateDemoDocument,
  uploadDemoDocumentImage,
  type DemoDocumentsState,
} from "@/features/demo/demo-documents";
import {
  createDemoLedgerState,
  applyDemoLedgerCommand,
  type DemoLedgerState,
} from "@/features/demo/demo-ledger";
import type {
  DocumentCommand,
  DocumentProposal,
} from "@/features/documents/document.schema";
import {
  getDemoImage,
  resetDemo,
  withDemoState,
} from "@/features/demo/demo-store";
import {
  listSourceDocuments,
  readSourceDocument,
  submitDocument,
  uploadDocumentImage,
  documentImageUrl,
} from "@/features/documents/client/document-api";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  business = "11111111-1111-4111-8111-111111111111",
  document = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-23T02:00:00.000Z";
let documents: DemoDocumentsState, ledger: DemoLedgerState;
function cmd(
  action: DocumentCommand["action"],
  revision: number,
  values: Record<string, unknown> = {},
  operationId = crypto.randomUUID(),
): DocumentCommand {
  return {
    businessId: business,
    documentId: document,
    operationId,
    expectedRevision: revision,
    action,
    values,
  };
}
const registration = {
  sourceType: "sales_notebook",
  mimeType: "image/png",
  byteSize: 8,
  sha256: "a".repeat(64),
};
function proposal(overrides: Partial<DocumentProposal> = {}): DocumentProposal {
  return {
    id: crypto.randomUUID(),
    page: 1,
    line: 1,
    sourceText: "Sample source",
    businessDate: "2026-10-23",
    description: "Sample sale",
    amount: "125.50",
    kind: "sale",
    paymentStatus: "partial",
    paymentAmount: "25.25",
    paymentDate: "2026-10-23",
    uncertainties: [],
    ...overrides,
  };
}
function apply(command: DocumentCommand) {
  const result = applyDemoDocumentCommand(documents, ledger, command, now);
  documents = result.documents;
  ledger = result.ledger;
  return result.result;
}
function ready(row = proposal()) {
  apply(cmd("register", 0, registration));
  apply(cmd("uploaded", 1));
  apply(cmd("review", 2, { rows: [row] }));
  return row;
}
beforeEach(() => {
  documents = createDemoDocumentsState();
  ledger = createDemoLedgerState(business, user);
});
describe("browser-only notebook state transitions", () => {
  it("requires deliberate review and atomically returns sourced financial demo data", () => {
    const row = ready();
    expect(ledger.details).toHaveLength(0);
    const originalDocuments = structuredClone(documents),
      originalLedger = structuredClone(ledger);
    const result = applyDemoDocumentCommand(
      documents,
      ledger,
      cmd("accept", 3, {
        rowId: row.id,
        reviewConfirmed: true,
        duplicateReviewed: true,
      }),
      now,
    );
    expect(documents).toEqual(originalDocuments);
    expect(ledger).toEqual(originalLedger);
    expect(result.documents.documents[document].acceptedRows).toHaveLength(1);
    expect(result.ledger.details).toHaveLength(1);
    expect(result.ledger.details[0].record).toMatchObject({
      amountCentavos: "12550",
      paidCentavos: "2525",
      remainingCentavos: "10025",
      source: "document_review",
      sourceReference: {
        documentId: document,
        rowId: row.id,
        sourceType: "sales_notebook",
      },
    });
  });
  it("replays the same acceptance after later review without duplicating or downgrading", () => {
    const row = ready(),
      command = cmd("accept", 3, {
        rowId: row.id,
        reviewConfirmed: true,
        duplicateReviewed: true,
      });
    apply(command);
    apply(cmd("review", 4, { rows: [row, proposal({ line: 2 })] }));
    const retried = apply(command);
    expect(retried.detail.document.revision).toBe(5);
    expect(ledger.details).toHaveLength(1);
    expect(ledger.details[0].payments).toHaveLength(1);
    expect(() =>
      apply({
        ...command,
        values: { ...command.values, rowId: crypto.randomUUID() },
      }),
    ).toThrow("CONFLICT");
  });
  it("preserves unknown payment and blocks missing full-paid dates or accepted-row deletion", () => {
    const row = ready(
      proposal({
        paymentStatus: "unknown",
        paymentAmount: undefined,
        paymentDate: undefined,
      }),
    );
    apply(
      cmd("accept", 3, {
        rowId: row.id,
        reviewConfirmed: true,
        duplicateReviewed: true,
      }),
    );
    expect(ledger.details[0].record).toMatchObject({
      paymentStatus: "unknown",
      remainingCentavos: null,
    });
    expect(ledger.details[0].payments).toEqual([]);
    expect(() => apply(cmd("review", 4, { rows: [] }))).toThrow(
      "ACCEPTED_ROW_LOCKED",
    );
    documents = createDemoDocumentsState();
    ledger = createDemoLedgerState(business, user);
    const missingDate = ready(
      proposal({ paymentStatus: "paid", paymentDate: "" }),
    );
    expect(() =>
      apply(
        cmd("accept", 3, {
          rowId: missingDate.id,
          reviewConfirmed: true,
          duplicateReviewed: true,
        }),
      ),
    ).toThrow("VALIDATION_ERROR");
  });
  it("rejects reuse of a manual operation to rewrite its source and reports OCR unavailable", () => {
    const row = ready(),
      operationId = crypto.randomUUID();
    ledger = applyDemoLedgerCommand(
      ledger,
      {
        businessId: business,
        operationId,
        action: "create",
        expectedRevision: 0,
        values: {
          businessDate: row.businessDate,
          kind: row.kind,
          amountCentavos: "12550",
          description: row.description,
          paymentStatus: "partial",
          paymentAmountCentavos: "2525",
          paymentDate: row.paymentDate,
        },
      },
      { now },
    ).state;
    expect(() =>
      apply(
        cmd(
          "accept",
          3,
          { rowId: row.id, reviewConfirmed: true, duplicateReviewed: true },
          operationId,
        ),
      ),
    ).toThrow();
    expect(ledger.details[0].record.source).toBe("manual");
    expect(() => apply(cmd("extract", 3, { consent: true }))).toThrow(
      "OCR_NOT_CONFIGURED",
    );
  });
  it("detects stale revisions and wrong-business scopes without mutating input state", () => {
    ready();
    expect(() => apply(cmd("review", 2, { rows: [] }))).toThrow("CONFLICT");
    expect(() =>
      apply({
        ...cmd("review", 3, { rows: [] }),
        businessId: crypto.randomUUID(),
      }),
    ).toThrow("FORBIDDEN");
    expect(documents.documents[document].document.proposals).toHaveLength(1);
  });
});
describe("demo photo adapter uses browser storage only", () => {
  it("routes the existing notebook client to local demo storage without any API or Supabase request", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network allowed"));
    try {
      await resetDemo();
      const businessId = await withDemoState((state) => state.businesses[0].id);
      expect((await listSourceDocuments(businessId)).documents).toEqual([]);
      const docId = crypto.randomUUID(),
        bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      const base = { businessId, documentId: docId };
      const result = await submitDocument({
        ...base,
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        action: "register",
        values: { ...registration, sha256: hash },
      });
      await uploadDocumentImage(
        result.upload!,
        new Blob([bytes], { type: "image/png" }),
      );
      await submitDocument({
        ...base,
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        action: "uploaded",
        values: {},
      });
      expect((await readSourceDocument(businessId, docId)).ocrConfigured).toBe(
        false,
      );
      expect(documentImageUrl(businessId, docId)).toMatch(/^blob:/);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
      vi.unstubAllEnvs();
      clearDemoDocumentImages();
    }
  });
  it("stores the original Blob, accepts reviewed rows, and clears only demo data on reset", async () => {
    await resetDemo();
    clearDemoDocumentImages();
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network allowed"));
    try {
      const scope = await withDemoState((state) => ({
        businessId: state.businesses[0].id,
        userId: state.user.id,
      }));
      const docId = crypto.randomUUID(),
        bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        file = new Blob([bytes], { type: "image/png" });
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      const base = { businessId: scope.businessId, documentId: docId };
      const registered = await mutateDemoDocument({
        ...base,
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        action: "register",
        values: { ...registration, sha256: hash },
      });
      expect(registered.upload?.path).toContain(scope.userId);
      await uploadDemoDocumentImage(registered.upload!, file);
      await mutateDemoDocument({
        ...base,
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        action: "uploaded",
        values: {},
      });
      const row = proposal({
        paymentStatus: "unpaid",
        paymentAmount: undefined,
        paymentDate: undefined,
      });
      await mutateDemoDocument({
        ...base,
        operationId: crypto.randomUUID(),
        expectedRevision: 2,
        action: "review",
        values: { rows: [row] },
      });
      await mutateDemoDocument({
        ...base,
        operationId: crypto.randomUUID(),
        expectedRevision: 3,
        action: "accept",
        values: {
          rowId: row.id,
          reviewConfirmed: true,
          duplicateReviewed: true,
        },
      });
      const detail = await readDemoDocument(scope.businessId, docId);
      expect(detail.ocrConfigured).toBe(false);
      expect(detail.acceptedRows).toHaveLength(1);
      expect(
        (await listDemoDocuments(scope.businessId)).documents,
      ).toHaveLength(1);
      expect(await getDemoImage(registered.upload!.path)).toBeInstanceOf(Blob);
      expect(fetcher).not.toHaveBeenCalled();
      await resetDemo();
      expect(await getDemoImage(registered.upload!.path)).toBeNull();
      await expect(
        readDemoDocument(scope.businessId, docId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      fetcher.mockRestore();
      clearDemoDocumentImages();
    }
  });
});
