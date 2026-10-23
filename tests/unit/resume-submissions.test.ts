import { beforeEach, expect, it, vi } from "vitest";
import type { SavedDraft } from "@/features/transactions/transaction.types";
import type { PendingLedgerOperation } from "@/features/ledger/client/pending-command-store";
const fixture = vi.hoisted(() => ({
  user: "owner-a" as string | null,
  drafts: [] as SavedDraft[],
  operations: [] as PendingLedgerOperation[],
  ack: vi.fn(),
  operationAck: vi.fn(),
  saveEditor: vi.fn(),
  send: vi.fn(),
  maintenanceSend: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/features/transactions/client/api", () => ({
  getSession: (...args: unknown[]) => fixture.session(...args),
  confirmTransaction: (...args: unknown[]) => fixture.send(...args),
  confirmLedgerTransaction: (...args: unknown[]) => fixture.send(...args),
}));
vi.mock("@/features/transactions/client/drafts", () => ({
  listDrafts: async () => fixture.drafts,
  deleteDraft: (...args: unknown[]) => fixture.ack(...args),
}));
vi.mock("@/features/ledger/client/pending-command-store", () => ({
  pendingLedgerStore: () => ({
    list: async () => fixture.operations,
    acknowledge: (...args: unknown[]) => fixture.operationAck(...args),
    saveEditor: (...args: unknown[]) => fixture.saveEditor(...args),
  }),
}));
vi.mock("@/features/ledger/client/commands", () => ({
  sendReviewedOperation: (...args: unknown[]) =>
    fixture.maintenanceSend(...args),
}));
import { resumeReviewedDrafts } from "@/features/transactions/client/resume-submissions";
function draft(operationId = "operation-a"): SavedDraft {
  return {
    operationId,
    step: "review",
    pendingCommand: {
      operationId,
      businessId: "business-a",
      payload: {
        version: 1,
        businessDate: "2026-10-23",
        kind: "sale",
        amountCentavos: "12345",
        description: null,
        moneyMovement: "in",
        reviewConfirmed: true,
        expectedRevision: 0,
      },
    },
    draft: {
      amount: "123.45",
      businessDate: "2026-10-23",
      kind: "sale",
      description: "",
      moneyMovement: "in",
    },
  };
}
function operation(endpoint = "/api/ledger"): PendingLedgerOperation {
  return {
    userId: "owner-a",
    businessId: "business-a",
    operationId: "maintenance-a",
    createdAt: "2026-10-23",
    command: {
      _endpoint: endpoint,
      businessId: "business-a",
      operationId: "maintenance-a",
      action: "correct",
      recordId: "record-a",
      expectedRevision: 1,
      values: { description: "Reviewed correction" },
    },
  };
}
const resume = (signal = new AbortController().signal) =>
  resumeReviewedDrafts("owner-a", "business-a", signal);
beforeEach(() => {
  fixture.user = "owner-a";
  fixture.drafts = [];
  fixture.operations = [];
  fixture.ack.mockReset().mockResolvedValue(undefined);
  fixture.operationAck.mockReset().mockResolvedValue(undefined);
  fixture.saveEditor.mockReset().mockResolvedValue(undefined);
  fixture.send.mockReset().mockResolvedValue({ id: "record-a", revision: 1 });
  fixture.maintenanceSend
    .mockReset()
    .mockResolvedValue({ id: "record-a", revision: 2 });
  fixture.session.mockReset().mockImplementation(async () => ({
    user: fixture.user ? { id: fixture.user } : null,
  }));
});
it("never submits an unreviewed draft", async () => {
  fixture.drafts = [{ ...draft(), step: "edit", pendingCommand: null }];
  expect(await resume()).toBe(0);
  expect(fixture.send).not.toHaveBeenCalled();
  expect(fixture.maintenanceSend).not.toHaveBeenCalled();
});
it("replays the original frozen payload then removes only its acknowledged scoped draft", async () => {
  const pending = draft();
  fixture.drafts = [pending];
  expect(await resume()).toBe(1);
  expect(fixture.send.mock.calls[0][0]).toBe(pending.pendingCommand);
  expect(fixture.ack).toHaveBeenCalledWith(
    "owner-a",
    "business-a",
    "operation-a",
  );
});
it("retains an uncertain transaction but can reconcile an unrelated reviewed maintenance operation", async () => {
  fixture.drafts = [draft()];
  fixture.operations = [operation()];
  fixture.send.mockRejectedValue(Error("lost response"));
  expect(await resume()).toBe(1);
  expect(fixture.ack).not.toHaveBeenCalled();
  expect(fixture.operationAck).toHaveBeenCalledWith(
    "owner-a",
    "business-a",
    "maintenance-a",
  );
});
it("refuses both stores when another account or no account is authenticated", async () => {
  fixture.drafts = [draft()];
  fixture.operations = [operation()];
  for (const user of ["owner-b", null]) {
    fixture.user = user;
    expect(await resume()).toBe(0);
  }
  expect(fixture.send).not.toHaveBeenCalled();
  expect(fixture.maintenanceSend).not.toHaveBeenCalled();
});
it("reverifies identity after a late response and never forwards the remaining owner's commands", async () => {
  fixture.drafts = [draft(), draft("operation-b")];
  fixture.operations = [operation()];
  fixture.send.mockImplementation(async () => {
    fixture.user = "owner-b";
    return { id: "record-a", revision: 1 };
  });
  expect(await resume()).toBe(0);
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(fixture.ack).not.toHaveBeenCalled();
  expect(fixture.maintenanceSend).not.toHaveBeenCalled();
});
it("rechecks identity before each subsequent send after the first command's cleanup", async () => {
  fixture.drafts = [draft(), draft("operation-b")];
  fixture.operations = [operation()];
  fixture.ack.mockImplementation(async () => {
    fixture.user = "owner-b";
  });
  expect(await resume()).toBe(1);
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(fixture.maintenanceSend).not.toHaveBeenCalled();
});
it("ignores a late acknowledgement after its account-scoped worker was aborted", async () => {
  fixture.drafts = [draft()];
  const controller = new AbortController();
  fixture.send.mockImplementation(async () => {
    controller.abort();
    return { id: "record-a", revision: 1 };
  });
  expect(await resume(controller.signal)).toBe(0);
  expect(fixture.ack).not.toHaveBeenCalled();
});
it("retries reviewed maintenance with its original command and cancellation signal", async () => {
  const pending = operation();
  fixture.operations = [pending];
  const controller = new AbortController();
  expect(await resume(controller.signal)).toBe(1);
  expect(fixture.maintenanceSend).toHaveBeenCalledWith(
    pending.command,
    controller.signal,
  );
  expect(fixture.operationAck).toHaveBeenCalledWith(
    "owner-a",
    "business-a",
    "maintenance-a",
  );
});
it("saves an authoritative snapshot reference before acknowledging the reviewed report", async () => {
  fixture.operations = [operation("/api/ledger/snapshots")];
  fixture.maintenanceSend.mockResolvedValue({ id: "snapshot-a" });
  expect(await resume()).toBe(1);
  expect(fixture.saveEditor).toHaveBeenCalledWith(
    "owner-a",
    "business-a",
    "last-report",
    { id: "snapshot-a" },
  );
  expect(fixture.saveEditor.mock.invocationCallOrder[0]).toBeLessThan(
    fixture.operationAck.mock.invocationCallOrder[0],
  );
});
it("retains a confirmed snapshot command if its device reference could not be persisted", async () => {
  fixture.operations = [operation("/api/ledger/snapshots")];
  fixture.maintenanceSend.mockResolvedValue({ id: "snapshot-a" });
  fixture.saveEditor.mockRejectedValue(Error("storage full"));
  expect(await resume()).toBe(0);
  expect(fixture.operationAck).not.toHaveBeenCalled();
});
it("retains failed maintenance requests and ignores aborted late maintenance acknowledgements", async () => {
  fixture.operations = [operation()];
  fixture.maintenanceSend.mockRejectedValue(Error("lost acknowledgement"));
  expect(await resume()).toBe(0);
  expect(fixture.operationAck).not.toHaveBeenCalled();
  const controller = new AbortController();
  fixture.maintenanceSend.mockImplementation(async () => {
    controller.abort();
    return { id: "record-a", revision: 2 };
  });
  expect(await resume(controller.signal)).toBe(0);
  expect(fixture.operationAck).not.toHaveBeenCalled();
});
it("does not forward corrupted or differently scoped maintenance commands", async () => {
  fixture.operations = [
    {
      ...operation(),
      command: { ...operation().command, businessId: "business-b" },
    },
  ];
  expect(await resume()).toBe(0);
  expect(fixture.maintenanceSend).not.toHaveBeenCalled();
});
