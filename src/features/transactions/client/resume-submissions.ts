import {
  getSession,
  confirmTransaction,
  confirmLedgerTransaction,
} from "./api";
import { listDrafts, deleteDraft } from "./drafts";
import { pendingLedgerStore } from "@/features/ledger/client/pending-command-store";
import { sendReviewedOperation } from "@/features/ledger/client/commands";

/** Only immutable, explicitly reviewed submissions are eligible. */
export async function resumeReviewedDrafts(
  userId: string,
  businessId: string,
  signal: AbortSignal,
): Promise<number> {
  async function originalAccount(): Promise<boolean> {
    if (signal.aborted) return false;
    try {
      const session = await getSession(signal);
      return !signal.aborted && session.user?.id === userId;
    } catch {
      return false;
    }
  }
  if (!(await originalAccount())) return 0;
  // Separate stores can fail independently. Keep their commands untouched and
  // continue eligible work in the other store; their screens report failures.
  const drafts = await listDrafts(userId, businessId).catch(() => []);
  const operations = await pendingLedgerStore()
    .list(userId, businessId)
    .catch(() => []);
  let accepted = 0;
  for (const draft of drafts) {
    if (signal.aborted) break;
    if (
      draft.step !== "review" ||
      (!draft.pendingCommand && !draft.pendingLedgerCommand)
    )
      continue;
    // Recheck after every asynchronous operation; another tab can change cookies
    // while the preceding request is in flight.
    if (!(await originalAccount())) return accepted;
    try {
      if (draft.pendingLedgerCommand)
        await confirmLedgerTransaction(draft.pendingLedgerCommand, signal);
      else if (draft.pendingCommand)
        await confirmTransaction(draft.pendingCommand, signal);
      if (!(await originalAccount())) return accepted;
      await deleteDraft(userId, businessId, draft.operationId);
      if (signal.aborted) return accepted;
      accepted++;
    } catch {
      // Auth, validation, conflicts and temporary failures remain available
      // for explicit recovery; an uncertain command keeps its original identity.
      if (signal.aborted) return accepted;
    }
  }
  for (const operation of operations) {
    if (signal.aborted) break;
    if (
      operation.userId !== userId ||
      operation.businessId !== businessId ||
      operation.command.businessId !== businessId ||
      operation.command.operationId !== operation.operationId
    )
      continue;
    if (!(await originalAccount())) return accepted;
    try {
      const result = await sendReviewedOperation(operation.command, signal);
      if (!(await originalAccount())) return accepted;
      if (operation.command._endpoint === "/api/ledger/snapshots") {
        // sendReviewedOperation validates the entire authoritative snapshot.
        // Keep its reference before removing the durable pending command.
        await pendingLedgerStore().saveEditor(
          userId,
          businessId,
          "last-report",
          { id: String(result.id) },
        );
      }
      if (signal.aborted) return accepted;
      await pendingLedgerStore().acknowledge(
        userId,
        businessId,
        operation.operationId,
      );
      if (signal.aborted) return accepted;
      accepted++;
    } catch {
      if (signal.aborted) return accepted;
    }
  }
  return accepted;
}
