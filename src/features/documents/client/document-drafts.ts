import Dexie, { type Table } from "dexie";
import type { DocumentCommand, DocumentProposal } from "../document.schema";
export type CaptureDraft = {
  userId: string;
  businessId: string;
  documentId: string;
  registerOperationId: string;
  sourceType: "sales_notebook" | "expense_notebook";
  file: Blob;
  name: string;
};
type Pending = {
  userId: string;
  businessId: string;
  documentId: string;
  command: DocumentCommand;
};
export type DocumentEdits = {
  userId: string;
  businessId: string;
  documentId: string;
  baseRevision: number;
  rows: DocumentProposal[];
};
export function createDocumentDraftStore(name = "msme-document-work-v1") {
  const db = new Dexie(name);
  db.version(1).stores({
    captures: "[userId+businessId]",
    pending: "[userId+businessId+documentId]",
    edits: "[userId+businessId+documentId]",
  });
  const captures: Table<CaptureDraft, [string, string]> = db.table("captures");
  const pending: Table<Pending, [string, string, string]> = db.table("pending");
  const edits: Table<DocumentEdits, [string, string, string]> =
    db.table("edits");
  return {
    async loadCapture(userId: string, businessId: string) {
      return (await captures.get([userId, businessId])) ?? null;
    },
    async saveCapture(draft: CaptureDraft) {
      await captures.put(draft);
    },
    async removeCapture(userId: string, businessId: string) {
      await captures.delete([userId, businessId]);
    },
    async loadPending(userId: string, businessId: string, documentId: string) {
      return (
        (await pending.get([userId, businessId, documentId]))?.command ?? null
      );
    },
    async loadEdits(userId: string, businessId: string, documentId: string) {
      return (await edits.get([userId, businessId, documentId])) ?? null;
    },
    async saveEdits(value: DocumentEdits, expected: DocumentEdits | null) {
      await db.transaction("rw", edits, async () => {
        const key: [string, string, string] = [
          value.userId,
          value.businessId,
          value.documentId,
        ];
        const previous = (await edits.get(key)) ?? null;
        if (JSON.stringify(previous) !== JSON.stringify(expected))
          throw new Error("DOCUMENT_LOCAL_CONFLICT");
        await edits.put(value);
      });
    },
    async removeEdits(
      userId: string,
      businessId: string,
      documentId: string,
      expected?: DocumentEdits | null,
    ) {
      await db.transaction("rw", edits, async () => {
        const key: [string, string, string] = [userId, businessId, documentId];
        if (
          expected !== undefined &&
          JSON.stringify((await edits.get(key)) ?? null) !==
            JSON.stringify(expected)
        )
          throw new Error("DOCUMENT_LOCAL_CONFLICT");
        await edits.delete(key);
      });
    },
    async freeze(userId: string, command: DocumentCommand) {
      await db.transaction("rw", pending, async () => {
        const key: [string, string, string] = [
          userId,
          command.businessId,
          command.documentId,
        ];
        const previous = await pending.get(key);
        if (
          previous &&
          JSON.stringify(previous.command) !== JSON.stringify(command)
        )
          throw new Error("DOCUMENT_PENDING");
        await pending.put({
          userId,
          businessId: command.businessId,
          documentId: command.documentId,
          command,
        });
      });
    },
    async acknowledge(userId: string, command: DocumentCommand) {
      await db.transaction("rw", pending, async () => {
        const key: [string, string, string] = [
          userId,
          command.businessId,
          command.documentId,
        ];
        const existing = await pending.get(key);
        if (
          existing &&
          JSON.stringify(existing.command) !== JSON.stringify(command)
        )
          throw new Error("DOCUMENT_PENDING");
        await pending.delete(key);
      });
    },
    close() {
      db.close();
    },
  };
}
let store: ReturnType<typeof createDocumentDraftStore> | undefined;
export function documentDrafts() {
  return (store ??= createDocumentDraftStore());
}
