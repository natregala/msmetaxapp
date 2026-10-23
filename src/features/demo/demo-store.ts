import Dexie, { type Table } from "dexie";
import type {
  Business,
  SessionUser,
} from "@/features/transactions/transaction.types";
import { todayInManila } from "@/features/transactions/transaction.rules";
import {
  applyDemoLedgerCommand,
  createDemoLedgerState,
  type DemoLedgerState,
} from "./demo-ledger";
import {
  createDemoDocumentsState,
  type DemoDocumentsState,
} from "./demo-documents";

export type DemoState = {
  version: 1;
  user: SessionUser;
  businesses: Business[];
  businessReceipts: Record<string, string>;
  ledgers: Record<string, DemoLedgerState>;
  documents: DemoDocumentsState;
};

const database = new Dexie("msme-public-demo-v1");
database.version(1).stores({ sessions: "&id", images: "&key" });
const sessions: Table<{ id: string; value: DemoState }, string> =
  database.table("sessions");
const images: Table<{ key: string; blob: Blob }, string> =
  database.table("images");

export function createDemoState(now = new Date().toISOString()): DemoState {
  const user: SessionUser = { id: crypto.randomUUID(), email: null };
  const business: Business = {
    id: crypto.randomUUID(),
    name: "Sample QC Sari-Sari Store",
    activity: "products",
    setupCompleted: true,
    profileRevision: 1,
  };
  const date = todayInManila(new Date(now));
  let ledger = createDemoLedgerState(business.id, user.id);
  const examples = [
    {
      kind: "sale",
      amountCentavos: "85000",
      description: "Sample: morning store sales",
      paymentStatus: "paid",
      paymentAmountCentavos: "85000",
      paymentDate: date,
    },
    {
      kind: "sale",
      amountCentavos: "50000",
      description: "Sample: customer order with balance",
      paymentStatus: "partial",
      paymentAmountCentavos: "20000",
      paymentDate: date,
    },
    {
      kind: "expense",
      amountCentavos: "32000",
      description: "Sample: supplies for the store",
      paymentStatus: "paid",
      paymentAmountCentavos: "32000",
      paymentDate: date,
    },
    {
      kind: "expense",
      amountCentavos: "15000",
      description: "Sample: delivery fee to check",
      paymentStatus: "unknown",
      paymentAmountCentavos: null,
      paymentDate: null,
    },
  ];
  for (const example of examples) {
    ledger = applyDemoLedgerCommand(
      ledger,
      {
        businessId: business.id,
        operationId: crypto.randomUUID(),
        action: "create",
        expectedRevision: 0,
        values: { businessDate: date, ...example },
      },
      { now },
    ).state;
  }
  return {
    version: 1,
    user,
    businesses: [business],
    businessReceipts: {},
    ledgers: { [business.id]: ledger },
    documents: createDemoDocumentsState(),
  };
}

/** One browser-only transaction commits document metadata and simulated records together. */
export async function withDemoState<T>(
  work: (state: DemoState) => T | Promise<T>,
): Promise<T> {
  return database.transaction("rw", sessions, images, async () => {
    const stored = await sessions.get("current");
    const state = stored?.value ?? createDemoState();
    const result = await Dexie.waitFor(Promise.resolve(work(state)));
    await sessions.put({ id: "current", value: state });
    return result;
  });
}

export async function getDemoImage(key: string): Promise<Blob | null> {
  return (await images.get(key))?.blob ?? null;
}
export async function putDemoImage(key: string, blob: Blob): Promise<void> {
  await images.put({ key, blob });
}

/** Only this demo database is reset. A new synthetic owner isolates any older device drafts. */
export async function resetDemo(): Promise<void> {
  await database.transaction("rw", sessions, images, async () => {
    await images.clear();
    await sessions.put({ id: "current", value: createDemoState() });
  });
}
