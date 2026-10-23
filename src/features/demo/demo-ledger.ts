import { z } from "zod";
import {
  ledgerCommandSchema,
  ledgerFilterSchema,
  ledgerPeriodSchema,
  snapshotSchema,
} from "@/features/ledger/ledger.schema";
import type {
  LedgerDetail,
  LedgerHistory,
  LedgerList,
  LedgerPayment,
  LedgerRecord,
  LedgerSnapshot,
  LedgerSummary,
} from "@/features/ledger/ledger.types";
import { csvCell, snapshotCSV } from "@/features/ledger/ledger.rules";
import {
  preparationCommandSchema,
  type PreparationProfile,
} from "@/features/preparation/preparation.schema";

/** Browser-only synthetic simulation. Never import this module into server routes. */
export type DemoLedgerState = {
  version: 1;
  businessId: string;
  actorId: string;
  ledgerVersion: string;
  details: LedgerDetail[];
  snapshots: LedgerSnapshot[];
  profile: PreparationProfile | null;
  receipts: {
    operationId: string;
    endpoint: string;
    command: string;
    result: unknown;
  }[];
};

export class DemoLedgerError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "DemoLedgerError";
  }
}

export type DemoLedgerResponse = {
  state: DemoLedgerState;
  status: number;
  body:
    | { ok: true; data: unknown }
    | { ok: false; error: { code: string } }
    | string;
  headers?: Record<string, string>;
};

const incoming = new Set([
  "sale",
  "owner_contribution",
  "loan_received",
  "transfer_in",
]);
const sourceReferenceSchema = z
  .strictObject({
    documentId: z.uuid(),
    rowId: z.uuid(),
    sourceType: z.string().min(1),
  })
  .nullable();
const demoCoverage =
  "DEMO: synthetic records stored only in this browser; no cloud acceptance. Sales and expenses use business dates; known cash uses payment dates. Period balances use dated payments through the period end. Unknown payments and undated movements are excluded from period balances and dated cash. Voids remain visible but are excluded from totals. No local drafts, opening balances, accounting profit or tax calculation included.";

function fail(code: string, status = 409): never {
  throw new DemoLedgerError(code, status);
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
      .join(",") +
    "}"
  );
}
function scope(state: DemoLedgerState, businessId: string) {
  if (businessId !== state.businessId) fail("FORBIDDEN", 403);
}
function receipt(
  state: DemoLedgerState,
  operationId: string,
  endpoint: string,
  command: unknown,
) {
  const found = state.receipts.find((r) => r.operationId === operationId);
  if (!found) return null;
  if (found.endpoint !== endpoint || found.command !== canonical(command))
    fail("CONFLICT");
  return found;
}
function remember(
  state: DemoLedgerState,
  operationId: string,
  endpoint: string,
  command: unknown,
  result: unknown,
) {
  state.receipts.push({
    operationId,
    endpoint,
    command: canonical(command),
    result: clone(result),
  });
}
function activePayments(detail: LedgerDetail) {
  return detail.payments.filter((payment) => payment.status === "active");
}
function paidAmount(detail: LedgerDetail) {
  return activePayments(detail).reduce(
    (total, payment) => total + BigInt(payment.amountCentavos),
    0n,
  );
}
function record(detail: LedgerDetail): LedgerRecord {
  const result = clone(detail.record),
    paid = paidAmount(detail),
    amount = BigInt(result.amountCentavos);
  result.paidCentavos = paid.toString();
  result.remainingCentavos =
    result.paymentKnowledge === "unknown" ? null : (amount - paid).toString();
  result.paymentStatus =
    result.paymentKnowledge === "unknown"
      ? "unknown"
      : amount === 0n && result.moneyMovement === "none"
        ? "unpaid"
        : paid === amount
          ? "paid"
          : paid > 0n
            ? "partial"
            : "unpaid";
  return result;
}
function history(
  state: DemoLedgerState,
  revision: number,
  now: string,
  interpretation: Record<string, unknown>,
): LedgerHistory {
  return {
    revision,
    previousRevision: revision - 1,
    actorId: state.actorId,
    recordedAt: now,
    interpretation: clone(interpretation),
  };
}
function direction(kind: string) {
  return incoming.has(kind) ? ("in" as const) : ("out" as const);
}
function validMovement(kind: string, movement: LedgerRecord["moneyMovement"]) {
  return (
    movement === "unknown" ||
    (kind === "sale" || kind === "expense"
      ? movement === "none" || movement === direction(kind)
      : movement === direction(kind))
  );
}

export function createDemoLedgerState(
  businessId: string,
  actorId: string,
): DemoLedgerState {
  z.uuid().parse(businessId);
  z.uuid().parse(actorId);
  return {
    version: 1,
    businessId,
    actorId,
    ledgerVersion: "0",
    details: [],
    snapshots: [],
    profile: null,
    receipts: [],
  };
}

/** Atomic in-memory transition; the demo transport persists the returned clone. */
export function applyDemoLedgerCommand(
  original: DemoLedgerState,
  input: unknown,
  options: {
    now?: string;
    sourceReference?: LedgerRecord["sourceReference"];
  } = {},
): { state: DemoLedgerState; result: { id: string; revision: number } } {
  const command = ledgerCommandSchema.parse(input),
    sourceReference = sourceReferenceSchema.parse(
      options.sourceReference ?? null,
    ),
    commandIdentity = { command, sourceReference };
  scope(original, command.businessId);
  if (sourceReference && command.action !== "create")
    fail("VALIDATION_ERROR", 422);
  const existing = receipt(
    original,
    command.operationId,
    "/api/ledger",
    commandIdentity,
  );
  if (existing)
    return {
      state: original,
      result: clone(existing.result) as { id: string; revision: number },
    };
  const state = clone(original),
    now = options.now ?? new Date().toISOString();
  let detail: LedgerDetail;
  if (command.action === "create") {
    const values = command.values,
      id = crypto.randomUUID(),
      paid = BigInt(values.paymentAmountCentavos ?? "0"),
      known = values.paymentStatus !== "unknown";
    detail = {
      record: {
        id,
        businessId: state.businessId,
        kind: values.kind,
        businessDate: values.businessDate,
        amountCentavos: values.amountCentavos,
        description: values.description,
        moneyMovement: !known
          ? "unknown"
          : values.paymentStatus === "paid" ||
              paid > 0n ||
              !["sale", "expense"].includes(values.kind)
            ? direction(values.kind)
            : "none",
        revision: 1,
        status: "active",
        paymentKnowledge: known ? "known" : "unknown",
        paidCentavos: paid.toString(),
        remainingCentavos: known
          ? (BigInt(values.amountCentavos) - paid).toString()
          : null,
        paymentStatus: values.paymentStatus,
        recordedAt: now,
        source: sourceReference ? "document_review" : "manual",
        sourceReference,
      },
      payments: [],
      history: [
        history(state, 1, now, {
          action: "create",
          values,
          ...(sourceReference ? { sourceReference } : {}),
        }),
      ],
      paymentHistory: [],
    };
    if (paid > 0n) {
      const payment: LedgerPayment = {
        id: crypto.randomUUID(),
        transactionId: id,
        amountCentavos: paid.toString(),
        paymentDate: values.paymentDate,
        status: "active",
        revision: 1,
        recordedAt: now,
      };
      detail.payments.push(payment);
      detail.paymentHistory.push({
        ...history(state, 1, now, {
          action: "initial_payment",
          amountCentavos: paid.toString(),
          paymentDate: values.paymentDate,
        }),
        paymentId: payment.id,
      });
    }
    state.details.push(detail);
  } else {
    const found = state.details.find((d) => d.record.id === command.recordId);
    if (!found) fail("FORBIDDEN", 403);
    detail = found;
    if (
      detail.record.revision !== command.expectedRevision ||
      detail.record.status === "void"
    )
      fail("CONFLICT");
    const before = clone(detail.record),
      total = paidAmount(detail);
    if (command.action === "correct") {
      const values = command.values;
      if (
        total > BigInt(values.amountCentavos) ||
        (values.kind !== before.kind && activePayments(detail).length)
      )
        fail("LINKED_PAYMENT_CONFLICT");
      if (
        activePayments(detail).some(
          (p) => p.paymentDate !== null && p.paymentDate < values.businessDate,
        )
      )
        fail("PAYMENT_BEFORE_RECORD", 422);
      const paidZero =
        before.amountCentavos === "0" &&
        values.amountCentavos === "0" &&
        before.paymentKnowledge === "known" &&
        ["in", "out"].includes(before.moneyMovement);
      const correctedMovement = paidZero
        ? direction(values.kind)
        : before.moneyMovement;
      if (!validMovement(values.kind, correctedMovement))
        fail("VALIDATION_ERROR", 422);
      Object.assign(detail.record, {
        kind: values.kind,
        businessDate: values.businessDate,
        amountCentavos: values.amountCentavos,
        description: values.description,
        moneyMovement: correctedMovement,
      });
    } else if (command.action === "void") {
      if (activePayments(detail).length) fail("LINKED_PAYMENT_CONFLICT");
      detail.record.status = "void";
    } else if (command.action === "resolve_payment") {
      if (command.values.paymentKnowledge === "unknown" && total > 0n)
        fail("LINKED_PAYMENT_CONFLICT");
      if (
        command.values.paymentKnowledge === "known" &&
        !["sale", "expense"].includes(before.kind) &&
        total !== BigInt(before.amountCentavos)
      )
        fail("CLARIFICATION_REQUIRED");
      detail.record.paymentKnowledge = command.values.paymentKnowledge;
    } else {
      const adding = command.action === "add_payment",
        ownerMovement = ["owner_contribution", "owner_withdrawal"].includes(
          before.kind,
        );
      if (
        adding &&
        !["sale", "expense", "owner_contribution", "owner_withdrawal"].includes(
          before.kind,
        )
      )
        fail("UNSUPPORTED_SETTLEMENT", 422);
      if (before.paymentKnowledge === "unknown" && !(adding && ownerMovement))
        fail("CLARIFICATION_REQUIRED");
      let payment: LedgerPayment | undefined;
      if (command.action !== "add_payment") {
        payment = detail.payments.find(
          (p) => p.id === command.values.paymentId,
        );
        if (!payment) fail("FORBIDDEN", 403);
        if (
          payment.status === "void" ||
          payment.revision !== command.values.expectedPaymentRevision
        )
          fail("CONFLICT");
      }
      if (command.action === "void_payment") {
        payment!.status = "void";
        payment!.revision += 1;
      } else {
        const amount = BigInt(command.values.amountCentavos),
          resultingTotal =
            total - BigInt(payment?.amountCentavos ?? "0") + amount;
        if (
          amount <= 0n ||
          resultingTotal > BigInt(before.amountCentavos) ||
          (adding &&
            ownerMovement &&
            resultingTotal !== BigInt(before.amountCentavos))
        )
          fail("INVALID_PAYMENT", 422);
        if (command.values.paymentDate < before.businessDate)
          fail("PAYMENT_BEFORE_RECORD", 422);
        if (adding) {
          payment = {
            id: crypto.randomUUID(),
            transactionId: before.id,
            amountCentavos: amount.toString(),
            paymentDate: command.values.paymentDate,
            status: "active",
            revision: 1,
            recordedAt: now,
          };
          detail.payments.push(payment);
          if (ownerMovement) detail.record.paymentKnowledge = "known";
        } else {
          payment!.amountCentavos = amount.toString();
          payment!.paymentDate = command.values.paymentDate;
          payment!.revision += 1;
        }
      }
      detail.paymentHistory.push({
        ...history(state, payment!.revision, now, {
          action: command.action,
          values: command.values,
        }),
        paymentId: payment!.id,
      });
    }
    const preservePaidZero =
      before.amountCentavos === "0" &&
      detail.record.amountCentavos === "0" &&
      ["in", "out"].includes(before.moneyMovement);
    detail.record.moneyMovement =
      detail.record.paymentKnowledge === "unknown"
        ? "unknown"
        : paidAmount(detail) > 0n ||
            !["sale", "expense"].includes(detail.record.kind) ||
            preservePaidZero
          ? direction(detail.record.kind)
          : "none";
    detail.record.revision += 1;
    detail.record = record(detail);
    detail.history.push(
      history(state, detail.record.revision, now, {
        action: command.action,
        values: command.values,
        record: detail.record,
        knownPaidCentavos: detail.record.paidCentavos,
      }),
    );
  }
  state.ledgerVersion = (BigInt(state.ledgerVersion) + 1n).toString();
  const result = { id: detail.record.id, revision: detail.record.revision };
  remember(state, command.operationId, "/api/ledger", commandIdentity, result);
  return { state, result };
}

function orderedDetails(state: DemoLedgerState) {
  return [...state.details].sort(
    (a, b) =>
      b.record.businessDate.localeCompare(a.record.businessDate) ||
      b.record.recordedAt.localeCompare(a.record.recordedAt) ||
      a.record.id.localeCompare(b.record.id),
  );
}
function list(state: DemoLedgerState, input: unknown): LedgerList {
  const filters = ledgerFilterSchema.parse(input);
  scope(state, filters.businessId);
  const records = orderedDetails(state)
    .filter((detail) => {
      const r = record(detail);
      return (
        (!filters.from || r.businessDate >= filters.from) &&
        (!filters.to || r.businessDate <= filters.to) &&
        (!filters.kind || r.kind === filters.kind) &&
        (!filters.status || r.status === filters.status) &&
        (!filters.search ||
          (r.description ?? "")
            .toLowerCase()
            .includes(filters.search.toLowerCase())) &&
        (!filters.payment ||
          r.paymentStatus === filters.payment ||
          (filters.payment === "needs_attention" &&
            (r.paymentKnowledge === "unknown" ||
              activePayments(detail).some((p) => p.paymentDate === null))))
      );
    })
    .map(record);
  return {
    records: records.slice((filters.page - 1) * 25, filters.page * 25),
    total: records.length,
    page: filters.page,
    pageSize: 25,
  };
}
function inPeriod(date: string | null, from: string, to: string) {
  return date !== null && date >= from && date <= to;
}
function summary(state: DemoLedgerState, input: unknown): LedgerSummary {
  const { businessId, from, to } = ledgerPeriodSchema.parse(input);
  scope(state, businessId);
  const related = state.details.filter(
    (d) =>
      inPeriod(d.record.businessDate, from, to) ||
      d.payments.some((p) => inPeriod(p.paymentDate, from, to)),
  );
  if (related.length > 10000) fail("PERIOD_TOO_LARGE", 422);
  let sales = 0n,
    expenses = 0n,
    received = 0n,
    paid = 0n,
    receivable = 0n,
    payable = 0n,
    unknownCount = 0,
    recordCount = 0,
    voidCount = 0,
    undatedPaymentCount = 0;
  for (const detail of state.details) {
    const r = detail.record,
      active = activePayments(detail);
    if (r.status === "active") {
      undatedPaymentCount += active.filter(
        (p) => p.paymentDate === null,
      ).length;
      for (const payment of active)
        if (inPeriod(payment.paymentDate, from, to)) {
          if (incoming.has(r.kind)) received += BigInt(payment.amountCentavos);
          else paid += BigInt(payment.amountCentavos);
        }
    }
    if (!inPeriod(r.businessDate, from, to)) continue;
    if (r.status === "void") {
      voidCount++;
      continue;
    }
    recordCount++;
    const amount = BigInt(r.amountCentavos),
      undated = active.some((p) => p.paymentDate === null),
      settled = active
        .filter((p) => p.paymentDate !== null && p.paymentDate <= to)
        .reduce((total, p) => total + BigInt(p.amountCentavos), 0n);
    if (r.kind === "sale") sales += amount;
    if (r.kind === "expense") expenses += amount;
    if (r.paymentKnowledge === "unknown" || undated) unknownCount++;
    else if (r.kind === "sale") receivable += amount - settled;
    else if (r.kind === "expense") payable += amount - settled;
  }
  const records = related
    .map(record)
    .sort(
      (a, b) =>
        a.businessDate.localeCompare(b.businessDate) ||
        a.recordedAt.localeCompare(b.recordedAt) ||
        a.id.localeCompare(b.id),
    );
  const payments = state.details
    .flatMap((d) =>
      d.payments.filter(
        (p) =>
          inPeriod(p.paymentDate, from, to) ||
          (p.paymentDate === null && inPeriod(d.record.businessDate, from, to)),
      ),
    )
    .sort(
      (a, b) =>
        (a.paymentDate ?? "9999").localeCompare(b.paymentDate ?? "9999") ||
        a.recordedAt.localeCompare(b.recordedAt) ||
        a.id.localeCompare(b.id),
    );
  return {
    from,
    to,
    records: clone(records),
    payments: clone(payments),
    coverage: demoCoverage,
    totals: {
      salesCentavos: sales.toString(),
      expensesCentavos: expenses.toString(),
      receivedCentavos: received.toString(),
      paidCentavos: paid.toString(),
      receivableCentavos: receivable.toString(),
      payableCentavos: payable.toString(),
      unknownCount,
      recordCount,
      voidCount,
      undatedPaymentCount,
    },
  };
}
function currentSnapshot(
  state: DemoLedgerState,
  stored: LedgerSnapshot,
): LedgerSnapshot {
  return {
    ...clone(stored),
    stale:
      stored.ledgerVersion !== state.ledgerVersion ||
      (stored.preparation !== null &&
        stored.preparation.profileRevision !== state.profile?.revision),
  };
}
function readSnapshot(state: DemoLedgerState, id: string) {
  z.uuid().parse(id);
  const found = state.snapshots.find((s) => s.id === id);
  if (!found) fail("FORBIDDEN", 403);
  return currentSnapshot(state, found);
}
function takeSnapshot(original: DemoLedgerState, input: unknown, now: string) {
  const command = snapshotSchema.parse(input);
  scope(original, command.businessId);
  const existing = receipt(
    original,
    command.operationId,
    "/api/ledger/snapshots",
    command,
  );
  if (existing)
    return {
      state: original,
      result: readSnapshot(original, command.operationId),
    };
  if (command.preparation) {
    if (
      command.preparation.profileRevision !== original.profile?.revision ||
      canonical(command.preparation.profile) !==
        canonical(original.profile?.values)
    )
      fail("CONFLICT");
    if (
      String(command.preparation.profile.year) !== command.from.slice(0, 4) ||
      command.from.slice(0, 4) !== command.to.slice(0, 4)
    )
      fail("PROFILE_PERIOD_MISMATCH", 422);
  }
  const state = clone(original),
    values = summary(state, {
      businessId: command.businessId,
      from: command.from,
      to: command.to,
    });
  const result: LedgerSnapshot = {
    ...values,
    id: command.operationId,
    businessId: state.businessId,
    createdAt: now,
    ledgerVersion: state.ledgerVersion,
    stale: false,
    preparation: command.preparation ?? null,
    manifest: values.records.map((r) => ({
      recordId: r.id,
      revision: r.revision,
    })),
  };
  state.snapshots.push(clone(result));
  remember(
    state,
    command.operationId,
    "/api/ledger/snapshots",
    command,
    result,
  );
  return { state, result };
}
function saveProfile(original: DemoLedgerState, input: unknown, now: string) {
  const command = preparationCommandSchema.parse(input);
  scope(original, command.businessId);
  const existing = receipt(
    original,
    command.operationId,
    "/api/preparation/profile",
    command,
  );
  if (existing) return { state: original, result: clone(existing.result) };
  if (command.expectedRevision !== (original.profile?.revision ?? 0))
    fail("CONFLICT");
  const state = clone(original);
  state.profile = {
    revision: command.expectedRevision + 1,
    values: command.values,
    updatedAt: now,
  };
  const result = { profile: clone(state.profile) };
  remember(
    state,
    command.operationId,
    "/api/preparation/profile",
    command,
    result,
  );
  return { state, result };
}

/** A URL router for the demo transport; it performs no fetch, Auth or database IO. */
export function handleDemoLedgerRequest(
  original: DemoLedgerState,
  request: { url: URL; method: string; body: unknown },
  now = new Date().toISOString(),
): DemoLedgerResponse | null {
  const { url, body } = request,
    method = request.method.toUpperCase(),
    path = url.pathname;
  if (!(
    path === "/api/ledger" ||
    path.startsWith("/api/ledger/") ||
    path === "/api/preparation/profile"
  ))
    return null;
  try {
    let state = original,
      data: unknown;
    if (method === "POST" && path === "/api/ledger") {
      const result = applyDemoLedgerCommand(state, body, { now });
      state = result.state;
      data = result.result;
    } else if (method === "POST" && path === "/api/ledger/snapshots") {
      const result = takeSnapshot(state, body, now);
      state = result.state;
      data = result.result;
    } else if (method === "POST" && path === "/api/preparation/profile") {
      const result = saveProfile(state, body, now);
      state = result.state;
      data = result.result;
    } else if (method === "GET") {
      if (path === "/api/ledger")
        data = list(state, Object.fromEntries(url.searchParams));
      else {
        const businessId = z.uuid().parse(url.searchParams.get("businessId"));
        scope(state, businessId);
        if (path === "/api/ledger/summary")
          data = summary(state, Object.fromEntries(url.searchParams));
        else if (path === "/api/preparation/profile")
          data = { profile: clone(state.profile) };
        else if (path.startsWith("/api/ledger/records/")) {
          const id = z.uuid().parse(path.slice("/api/ledger/records/".length));
          const found = state.details.find((d) => d.record.id === id);
          if (!found) fail("FORBIDDEN", 403);
          data = { ...clone(found), record: record(found) };
        } else if (path.startsWith("/api/ledger/snapshots/"))
          data = readSnapshot(
            state,
            path.slice("/api/ledger/snapshots/".length),
          );
        else if (path === "/api/ledger/export") {
          const id = z.uuid().parse(url.searchParams.get("snapshotId")),
            snapshot = readSnapshot(state, id);
          return {
            state,
            status: 200,
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition":
                'attachment; filename="DEMO-synthetic-business-records.csv"',
            },
            body:
              "\uFEFF" +
              csvCell(
                "DEMO — Synthetic browser-only records; not cloud accepted or filed",
              ) +
              "\r\n" +
              snapshotCSV(snapshot).replace(/^\uFEFF/, ""),
          };
        } else fail("NOT_FOUND", 404);
      }
    } else fail("INVALID_REQUEST", 405);
    return { state, status: 200, body: { ok: true, data: clone(data) } };
  } catch (error) {
    const known =
      error instanceof DemoLedgerError
        ? error
        : error instanceof z.ZodError
          ? new DemoLedgerError("VALIDATION_ERROR", 422)
          : new DemoLedgerError("SERVER_ERROR", 503);
    return {
      state: original,
      status: known.status,
      body: { ok: false, error: { code: known.code } },
    };
  }
}
