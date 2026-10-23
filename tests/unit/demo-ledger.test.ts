import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  applyDemoLedgerCommand,
  createDemoLedgerState,
  handleDemoLedgerRequest,
  type DemoLedgerState,
} from "@/features/demo/demo-ledger";
import {
  ledgerDetailSchema,
  ledgerListSchema,
  ledgerSnapshotSchema,
  ledgerSummarySchema,
} from "@/features/ledger/ledger.schema";
import type {
  LedgerSnapshot,
  LedgerSummary,
} from "@/features/ledger/ledger.types";
import type { PreparationValues } from "@/features/preparation/preparation.schema";

const businessId = "11111111-1111-4111-8111-111111111111";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreignId = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-23T04:30:00.000Z";
const fresh = () => createDemoLedgerState(businessId, actorId);
const create = (
  values: Record<string, unknown> = {},
  operationId = randomUUID(),
) => ({
  businessId,
  operationId,
  action: "create",
  expectedRevision: 0,
  values: {
    kind: "sale",
    businessDate: "2026-10-23",
    amountCentavos: "10000",
    description: "Synthetic Quezon City demo sale",
    paymentStatus: "unpaid",
    paymentAmountCentavos: null,
    paymentDate: null,
    ...values,
  },
});
const edit = (
  id: string,
  action: string,
  values: Record<string, unknown>,
  expectedRevision = 1,
  operationId = randomUUID(),
) => ({
  businessId,
  operationId,
  recordId: id,
  action,
  expectedRevision,
  values,
});
function request(
  state: DemoLedgerState,
  path: string,
  body: unknown = null,
  method = body === null ? "GET" : "POST",
) {
  const result = handleDemoLedgerRequest(
    state,
    { url: new URL(path, "https://demo.invalid"), method, body },
    now,
  );
  if (!result) throw new Error("Unexpected unhandled path");
  return result;
}
function success<T>(result: ReturnType<typeof request>): T {
  expect(result.status).toBe(200);
  if (typeof result.body === "string" || !result.body.ok)
    throw new Error("Expected successful JSON");
  return result.body.data as T;
}
function readSummary(
  state: DemoLedgerState,
  from = "2026-10-01",
  to = "2026-10-31",
) {
  const result = success<LedgerSummary>(
    request(
      state,
      `/api/ledger/summary?businessId=${businessId}&from=${from}&to=${to}`,
    ),
  );
  return ledgerSummarySchema.parse(result);
}
const profileValues: PreparationValues = {
  year: 2026,
  registration: "unknown",
  taxTreatment: "unknown",
  evidence: "Synthetic sample evidence only",
  priorIncomeCentavos: null,
  priorTaxPaymentsCentavos: "0",
  otherCreditsCentavos: null,
  coverage: "partial",
  notes: "Demo, never a verified tax assessment",
};

describe("browser-only synthetic demo ledger", () => {
  it("does not mutate its input and survives a JSON persistence round trip", () => {
    const original = fresh(),
      command = create();
    const created = applyDemoLedgerCommand(original, command, { now });
    expect(original).toEqual(fresh());
    expect(created.state.details).toHaveLength(1);
    const persisted = JSON.parse(
      JSON.stringify(created.state),
    ) as DemoLedgerState;
    const result = request(
      persisted,
      `/api/ledger/records/${created.result.id}?businessId=${businessId}`,
    );
    const detail = ledgerDetailSchema.parse(success(result));
    expect(detail.record.description).toBe("Synthetic Quezon City demo sale");
    expect(detail.record.paymentStatus).toBe("unpaid");
    expect(detail.history[0].actorId).toBe(actorId);
  });
  it("enforces its synthetic business scope and never claims unrelated API paths", () => {
    const state = applyDemoLedgerCommand(fresh(), create(), { now }).state;
    for (const path of [
      `/api/ledger?businessId=${foreignId}`,
      `/api/ledger/summary?businessId=${foreignId}&from=2026-10-01&to=2026-10-31`,
      `/api/preparation/profile?businessId=${foreignId}`,
    ]) {
      const result = request(state, path);
      expect(result.status).toBe(403);
      expect(result.state).toBe(state);
    }
    const invalid = request(state, "/api/ledger", {
      ...create(),
      businessId: foreignId,
    });
    expect(invalid.status).toBe(403);
    expect(invalid.state).toBe(state);
    expect(
      handleDemoLedgerRequest(state, {
        url: new URL("https://demo.invalid/api/session"),
        method: "GET",
        body: null,
      }),
    ).toBeNull();
  });
  it("replays the original result before revision checks and rejects incompatible operation reuse", () => {
    const command = create({
      paymentStatus: "partial",
      paymentAmountCentavos: "2500",
      paymentDate: "2026-10-23",
    });
    const initial = applyDemoLedgerCommand(fresh(), command, { now });
    const settlement = edit(initial.result.id, "add_payment", {
      amountCentavos: "7500",
      paymentDate: "2026-10-24",
    });
    const paid = applyDemoLedgerCommand(initial.state, settlement, { now });
    const corrected = applyDemoLedgerCommand(
      paid.state,
      edit(
        initial.result.id,
        "correct",
        {
          kind: "sale",
          businessDate: "2026-10-23",
          amountCentavos: "10000",
          description: "Reviewed demo description",
          reason: "Synthetic correction",
        },
        2,
      ),
      { now },
    );
    const replay = applyDemoLedgerCommand(corrected.state, settlement, { now });
    expect(replay.result).toEqual(paid.result);
    expect(replay.state).toBe(corrected.state);
    expect(replay.state.details[0].record.revision).toBe(3);
    expect(replay.state.details[0].payments).toHaveLength(2);
    const conflict = request(replay.state, "/api/ledger", {
      ...settlement,
      values: { amountCentavos: "7000", paymentDate: "2026-10-24" },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.state).toBe(replay.state);
  });
  it("keeps later payments distinct from sales and calculates period balances as of the period end", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({ businessDate: "2026-09-30" }),
      { now },
    );
    const paid = applyDemoLedgerCommand(
      initial.state,
      edit(initial.result.id, "add_payment", {
        amountCentavos: "3500",
        paymentDate: "2026-10-01",
      }),
      { now },
    );
    const september = readSummary(paid.state, "2026-09-01", "2026-09-30"),
      october = readSummary(paid.state);
    expect(september.totals.salesCentavos).toBe("10000");
    expect(september.totals.receivableCentavos).toBe("10000");
    expect(september.totals.receivedCentavos).toBe("0");
    expect(october.totals.salesCentavos).toBe("0");
    expect(october.totals.receivedCentavos).toBe("3500");
    expect(october.records[0].remainingCentavos).toBe("6500");
    expect(october.coverage).toContain("DEMO");
    expect(october.coverage).toContain("no cloud acceptance");
  });
  it("rejects overpayment, zero payments, early dates and record reductions below active payments atomically", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({
        paymentStatus: "partial",
        paymentAmountCentavos: "2500",
        paymentDate: "2026-10-23",
      }),
      { now },
    );
    for (const values of [
      { amountCentavos: "7501", paymentDate: "2026-10-24" },
      { amountCentavos: "0", paymentDate: "2026-10-24" },
      { amountCentavos: "100", paymentDate: "2026-10-22" },
    ]) {
      const result = request(
        initial.state,
        "/api/ledger",
        edit(initial.result.id, "add_payment", values),
      );
      expect(result.status).toBe(422);
      expect(result.state).toBe(initial.state);
    }
    const result = request(
      initial.state,
      "/api/ledger",
      edit(initial.result.id, "correct", {
        kind: "sale",
        businessDate: "2026-10-23",
        amountCentavos: "0",
        description: null,
        reason: "Synthetic invalid reduction",
      }),
    );
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      ok: false,
      error: { code: "LINKED_PAYMENT_CONFLICT" },
    });
    expect(result.state.details[0].record.revision).toBe(1);
    expect(result.state.details[0].payments[0].amountCentavos).toBe("2500");
  });
  it("preserves paid, unpaid and unknown zero meanings and derives corrected kind direction", () => {
    for (const kind of ["sale", "expense"])
      for (const paymentStatus of ["paid", "unpaid", "unknown"]) {
        const initial = applyDemoLedgerCommand(
          fresh(),
          create({
            kind,
            amountCentavos: "0",
            paymentStatus,
            paymentAmountCentavos: paymentStatus === "paid" ? "0" : null,
            paymentDate: paymentStatus === "paid" ? "2026-10-23" : null,
          }),
          { now },
        );
        const changedKind = kind === "sale" ? "expense" : "sale";
        const corrected = applyDemoLedgerCommand(
          initial.state,
          edit(initial.result.id, "correct", {
            kind: changedKind,
            amountCentavos: "0",
            businessDate: "2026-10-24",
            description: "Corrected zero demo",
            reason: "Zero meaning retained",
          }),
          { now },
        );
        const detail = corrected.state.details[0];
        expect(detail.record.paymentStatus).toBe(paymentStatus);
        expect(detail.record.moneyMovement).toBe(
          paymentStatus === "unknown"
            ? "unknown"
            : paymentStatus === "unpaid"
              ? "none"
              : changedKind === "sale"
                ? "in"
                : "out",
        );
        expect(detail.payments).toHaveLength(0);
        expect(detail.record.remainingCentavos).toBe(
          paymentStatus === "unknown" ? null : "0",
        );
      }
  });
  it("requires explicit unknown-payment clarification and full dated owner movements", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({ paymentStatus: "unknown" }),
      { now },
    );
    expect(
      request(
        initial.state,
        "/api/ledger",
        edit(initial.result.id, "add_payment", {
          amountCentavos: "100",
          paymentDate: "2026-10-23",
        }),
      ).status,
    ).toBe(409);
    const clarified = applyDemoLedgerCommand(
      initial.state,
      edit(initial.result.id, "resolve_payment", {
        paymentKnowledge: "known",
        reason: "Owner confirms no earlier settlement",
      }),
      { now },
    );
    const paid = applyDemoLedgerCommand(
      clarified.state,
      edit(
        initial.result.id,
        "add_payment",
        { amountCentavos: "100", paymentDate: "2026-10-23" },
        2,
      ),
      { now },
    );
    expect(paid.state.details[0].record.remainingCentavos).toBe("9900");
    const contribution = applyDemoLedgerCommand(
      fresh(),
      create({ kind: "owner_contribution", paymentStatus: "unknown" }),
      { now },
    );
    expect(
      request(
        contribution.state,
        "/api/ledger",
        edit(contribution.result.id, "add_payment", {
          amountCentavos: "100",
          paymentDate: "2026-10-23",
        }),
      ).status,
    ).toBe(422);
    const confirmed = applyDemoLedgerCommand(
      contribution.state,
      edit(contribution.result.id, "add_payment", {
        amountCentavos: "10000",
        paymentDate: "2026-10-24",
      }),
      { now },
    );
    expect(confirmed.state.details[0].record.paymentStatus).toBe("paid");
    expect(readSummary(confirmed.state).totals.salesCentavos).toBe("0");
    expect(readSummary(confirmed.state).totals.receivedCentavos).toBe("10000");
  });
  it("preserves payment correction/void history and requires voiding active payments before the record", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({
        paymentStatus: "paid",
        paymentAmountCentavos: "10000",
        paymentDate: "2026-10-23",
      }),
      { now },
    );
    const payment = initial.state.details[0].payments[0];
    expect(
      request(
        initial.state,
        "/api/ledger",
        edit(initial.result.id, "void", { reason: "Duplicate demo" }),
      ).status,
    ).toBe(409);
    const corrected = applyDemoLedgerCommand(
      initial.state,
      edit(initial.result.id, "correct_payment", {
        paymentId: payment.id,
        expectedPaymentRevision: 1,
        amountCentavos: "9000",
        paymentDate: "2026-10-24",
        reason: "Corrected synthetic receipt",
      }),
      { now },
    );
    expect(corrected.state.details[0].record.remainingCentavos).toBe("1000");
    expect(
      request(
        corrected.state,
        "/api/ledger",
        edit(
          initial.result.id,
          "void_payment",
          {
            paymentId: payment.id,
            expectedPaymentRevision: 1,
            reason: "Stale edit",
          },
          2,
        ),
      ).status,
    ).toBe(409);
    const voidPayment = applyDemoLedgerCommand(
      corrected.state,
      edit(
        initial.result.id,
        "void_payment",
        {
          paymentId: payment.id,
          expectedPaymentRevision: 2,
          reason: "Duplicate payment",
        },
        2,
      ),
      { now },
    );
    const voidRecord = applyDemoLedgerCommand(
      voidPayment.state,
      edit(initial.result.id, "void", { reason: "Duplicate record" }, 3),
      { now },
    );
    expect(voidRecord.state.details[0].history).toHaveLength(4);
    expect(voidRecord.state.details[0].paymentHistory).toHaveLength(3);
    expect(readSummary(voidRecord.state).totals).toMatchObject({
      salesCentavos: "0",
      receivedCentavos: "0",
      voidCount: 1,
    });
  });
  it("includes source references in replay identity and retains them through corrections", () => {
    const command = create(),
      sourceReference = {
        documentId: randomUUID(),
        rowId: randomUUID(),
        sourceType: "notebook",
      };
    const initial = applyDemoLedgerCommand(fresh(), command, {
      now,
      sourceReference,
    });
    const corrected = applyDemoLedgerCommand(
      initial.state,
      edit(initial.result.id, "correct", {
        kind: "sale",
        businessDate: "2026-10-23",
        amountCentavos: "9000",
        description: "Reviewed source",
        reason: "Synthetic human correction",
      }),
      { now },
    );
    expect(corrected.state.details[0].record.source).toBe("document_review");
    expect(corrected.state.details[0].record.sourceReference).toEqual(
      sourceReference,
    );
    expect(
      applyDemoLedgerCommand(corrected.state, command, { now, sourceReference })
        .result,
    ).toEqual(initial.result);
    expect(() =>
      applyDemoLedgerCommand(corrected.state, command, { now }),
    ).toThrow("CONFLICT");
    expect(() =>
      applyDemoLedgerCommand(corrected.state, command, {
        now,
        sourceReference: { ...sourceReference, rowId: randomUUID() },
      }),
    ).toThrow("CONFLICT");
  });
  it("filters, searches and paginates synthetic records beyond the recent Home list", () => {
    let state = fresh();
    for (let i = 0; i < 56; i++)
      state = applyDemoLedgerCommand(
        state,
        create({
          businessDate: "2026-09-01",
          description: "Older synthetic notebook " + i,
          kind: i % 2 ? "sale" : "expense",
        }),
        { now },
      ).state;
    const all = ledgerListSchema.parse(
      success(
        request(
          state,
          `/api/ledger?businessId=${businessId}&from=2026-09-01&to=2026-09-30&search=NOTEBOOK&page=3`,
        ),
      ),
    );
    expect(all.total).toBe(56);
    expect(all.records).toHaveLength(6);
    const sale = ledgerListSchema.parse(
      success(
        request(
          state,
          `/api/ledger?businessId=${businessId}&kind=sale&payment=unpaid&page=1`,
        ),
      ),
    );
    expect(sale.total).toBe(28);
    expect(sale.records).toHaveLength(25);
  });
  it("computes exact aggregate strings beyond Number safe integer range", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({ amountCentavos: "999999999999" }),
      { now },
    );
    const template = initial.state.details[0];
    const state = {
      ...initial.state,
      details: Array.from({ length: 10000 }, () => ({
        ...template,
        record: { ...template.record, id: randomUUID() },
      })),
    };
    expect(readSummary(state).totals.salesCentavos).toBe("9999999999990000");
    expect(readSummary(state).totals.receivableCentavos).toBe(
      "9999999999990000",
    );
    expect(() =>
      readSummary({ ...state, details: [...state.details, template] }),
    ).toThrow();
  });
  it("excludes undated synthetic legacy movements from dated cash and marks them for attention", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({
        paymentStatus: "paid",
        paymentAmountCentavos: "10000",
        paymentDate: "2026-10-23",
      }),
      { now },
    );
    initial.state.details[0].payments[0].paymentDate = null;
    const summary = readSummary(initial.state);
    expect(summary.totals).toMatchObject({
      salesCentavos: "10000",
      receivedCentavos: "0",
      receivableCentavos: "0",
      unknownCount: 1,
      undatedPaymentCount: 1,
    });
    const attention = ledgerListSchema.parse(
      success(
        request(
          initial.state,
          `/api/ledger?businessId=${businessId}&payment=needs_attention`,
        ),
      ),
    );
    expect(attention.total).toBe(1);
  });
  it("keeps snapshot contents immutable and marks them stale after later financial edits", () => {
    const initial = applyDemoLedgerCommand(
      fresh(),
      create({ description: "=HYPERLINK(unsafe)" }),
      { now },
    );
    const command = {
      businessId,
      operationId: randomUUID(),
      from: "2026-10-01",
      to: "2026-10-31",
    };
    const taken = request(initial.state, "/api/ledger/snapshots", command),
      snapshot = ledgerSnapshotSchema.parse(success(taken));
    expect(snapshot.stale).toBe(false);
    const corrected = applyDemoLedgerCommand(
      taken.state,
      edit(initial.result.id, "correct", {
        kind: "sale",
        businessDate: "2026-10-23",
        amountCentavos: "10001",
        description: "Changed demo",
        reason: "Synthetic correction",
      }),
      { now },
    );
    const stale = ledgerSnapshotSchema.parse(
      success(
        request(
          corrected.state,
          `/api/ledger/snapshots/${snapshot.id}?businessId=${businessId}`,
        ),
      ),
    );
    expect(stale.stale).toBe(true);
    expect(stale.totals.salesCentavos).toBe("10000");
    expect(stale.records[0].description).toBe("=HYPERLINK(unsafe)");
    expect(
      success<LedgerSnapshot>(
        request(corrected.state, "/api/ledger/snapshots", command),
      ).stale,
    ).toBe(true);
    const csv = request(
      corrected.state,
      `/api/ledger/export?businessId=${businessId}&snapshotId=${snapshot.id}`,
    );
    expect(csv.headers?.["Content-Type"]).toContain("text/csv");
    expect(csv.body).toContain("DEMO — Synthetic browser-only");
    expect(csv.body).toContain('"\'=HYPERLINK(unsafe)"');
    expect(csv.body).toContain("STALE - regenerate and review");
  });
  it("persists unknown versus zero preparation inputs and stales snapshots when profile evidence changes", () => {
    const command = {
      businessId,
      operationId: randomUUID(),
      expectedRevision: 0,
      values: profileValues,
    };
    const saved = request(fresh(), "/api/preparation/profile", command);
    const prepare = {
      businessId,
      operationId: randomUUID(),
      from: "2026-10-01",
      to: "2026-10-31",
      preparation: { profileRevision: 1, profile: profileValues },
    };
    const snapshot = request(saved.state, "/api/ledger/snapshots", prepare),
      id = success<LedgerSnapshot>(snapshot).id;
    const changed = request(snapshot.state, "/api/preparation/profile", {
      ...command,
      operationId: randomUUID(),
      expectedRevision: 1,
      values: { ...profileValues, evidence: "Later synthetic evidence" },
    });
    expect(
      success<LedgerSnapshot>(
        request(
          changed.state,
          `/api/ledger/snapshots/${id}?businessId=${businessId}`,
        ),
      ).stale,
    ).toBe(true);
    expect(
      success<LedgerSnapshot>(
        request(changed.state, "/api/ledger/snapshots", prepare),
      ).stale,
    ).toBe(true);
    expect(
      request(changed.state, "/api/ledger/snapshots", {
        ...prepare,
        operationId: randomUUID(),
      }).status,
    ).toBe(409);
    const replay = success<{ profile: { revision: number } }>(
      request(changed.state, "/api/preparation/profile", command),
    );
    expect(replay.profile.revision).toBe(1);
    const csv = request(
      changed.state,
      `/api/ledger/export?businessId=${businessId}&snapshotId=${id}`,
    );
    expect(csv.body).toContain(
      '"Earlier-period income PHP","Unknown / not supplied"',
    );
    expect(csv.body).toContain('"Actual prior tax payments PHP","0.00"');
    expect(csv.body).toContain("Blocked: no applicable rule set");
  });
  it("validates snapshot profile/year correspondence and malformed mutation payloads", () => {
    const saved = request(fresh(), "/api/preparation/profile", {
      businessId,
      operationId: randomUUID(),
      expectedRevision: 0,
      values: profileValues,
    });
    expect(
      request(saved.state, "/api/ledger/snapshots", {
        businessId,
        operationId: randomUUID(),
        from: "2025-01-01",
        to: "2025-12-31",
        preparation: { profileRevision: 1, profile: profileValues },
      }).status,
    ).toBe(422);
    expect(
      request(saved.state, "/api/ledger", create({ amountCentavos: "1.10" }))
        .status,
    ).toBe(422);
    expect(
      request(
        saved.state,
        "/api/ledger",
        create({
          paymentStatus: "paid",
          paymentAmountCentavos: "10000",
          paymentDate: null,
        }),
      ).status,
    ).toBe(422);
    expect(request(saved.state, "/api/ledger", {}, "DELETE").status).toBe(405);
    expect(saved.state.details).toHaveLength(0);
  });
});
