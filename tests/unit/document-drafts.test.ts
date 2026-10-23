import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDocumentDraftStore } from "@/features/documents/client/document-drafts";
import type { DocumentCommand } from "@/features/documents/document.schema";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  business = "11111111-1111-4111-8111-111111111111",
  document = "22222222-2222-4222-8222-222222222222";
describe("document capture and operation recovery", () => {
  it("keeps the selected Blob across reopen and isolates owners/businesses", async () => {
    const name = "synthetic-document-" + crypto.randomUUID();
    let store = createDocumentDraftStore(name);
    await store.saveCapture({
      userId: user,
      businessId: business,
      documentId: document,
      registerOperationId: crypto.randomUUID(),
      sourceType: "sales_notebook",
      name: "synthetic.png",
      file: new Blob(["synthetic"], { type: "image/png" }),
    });
    store.close();
    store = createDocumentDraftStore(name);
    expect((await store.loadCapture(user, business))?.name).toBe(
      "synthetic.png",
    );
    expect(await store.loadCapture(other, business)).toBeNull();
    expect(await (await store.loadCapture(user, business))?.file.text()).toBe(
      "synthetic",
    );
    expect(await store.loadCapture(user, document)).toBeNull();
    store.close();
  });
  it("freezes a specific document command until its acknowledgement", async () => {
    const store = createDocumentDraftStore(
      "synthetic-operations-" + crypto.randomUUID(),
    );
    const command: DocumentCommand = {
      businessId: business,
      documentId: document,
      operationId: crypto.randomUUID(),
      expectedRevision: 3,
      action: "accept",
      values: {
        rowId: crypto.randomUUID(),
        reviewConfirmed: true,
        duplicateReviewed: true,
      },
    };
    await store.freeze(user, command);
    await store.freeze(user, command);
    await expect(
      store.freeze(user, { ...command, operationId: crypto.randomUUID() }),
    ).rejects.toThrow("DOCUMENT_PENDING");
    expect(await store.loadPending(other, business, document)).toBeNull();
    await store.acknowledge(user, command);
    expect(await store.loadPending(user, business, document)).toBeNull();
    store.close();
  });
  it("detects a stale tab instead of overwriting its newer review edits", async () => {
    const store = createDocumentDraftStore(
      "synthetic-review-" + crypto.randomUUID(),
    );
    const initial = {
      userId: user,
      businessId: business,
      documentId: document,
      baseRevision: 2,
      rows: [],
    };
    await store.saveEdits(initial, null);
    await expect(
      store.saveEdits({ ...initial, baseRevision: 3 }, null),
    ).rejects.toThrow("DOCUMENT_LOCAL_CONFLICT");
    expect(await store.loadEdits(user, business, document)).toEqual(initial);
    store.close();
  });
});
