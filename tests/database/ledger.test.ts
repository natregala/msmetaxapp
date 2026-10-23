import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  LedgerDetail,
  LedgerSnapshot,
  LedgerSummary,
  LedgerList,
} from "@/features/ledger/ledger.types";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const business = "11111111-1111-4111-8111-111111111111",
  foreign = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
let legacy: { id: string; revision: number };
const initial = (extra: Record<string, unknown> = {}) => ({
  businessDate: "2026-10-23",
  kind: "sale",
  amountCentavos: "10000",
  description: "Synthetic ledger record",
  paymentStatus: "unpaid",
  paymentAmountCentavos: null,
  paymentDate: null,
  ...extra,
});
async function asUser<T>(actor: string | null, run: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor ?? "",
  ]);
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc<T>(name: string, args: unknown[], casts: string[]) {
  const r = await db.query<{ result: T }>(
    "select public." +
      name +
      "(" +
      casts.map((c, i) => "$" + (i + 1) + "::" + c).join(",") +
      ") as result",
    args,
  );
  return r.rows[0].result;
}
async function mutate(
  action: string,
  values: unknown,
  recordId: string | null = null,
  revision = 0,
  operation = randomUUID(),
  scope = business,
) {
  return rpc<{ id: string; revision: number }>(
    "ledger_mutate",
    [scope, operation, action, recordId, revision, JSON.stringify(values)],
    ["uuid", "uuid", "text", "uuid", "integer", "jsonb"],
  );
}
const detail = (id: string, scope = business) =>
  rpc<LedgerDetail>("ledger_detail", [scope, id], ["uuid", "uuid"]);
const summary = (from: string, to: string) =>
  rpc<LedgerSummary>(
    "ledger_summary",
    [business, from, to],
    ["uuid", "date", "date"],
  );
const snapshot = (op = randomUUID(), from = "2026-10-01", to = "2026-10-31") =>
  rpc<LedgerSnapshot>(
    "ledger_snapshot",
    [business, op, from, to, null],
    ["uuid", "uuid", "date", "date", "jsonb"],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin nosuperuser nobypassrls;create role authenticated nologin nosuperuser nobypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${owner}'),('${other}');`);
  const path = resolve("supabase/migrations"),
    files = (await readdir(path)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter(
    (f) => f.includes("manual_transaction") || f.includes("guided_business"),
  ))
    await db.exec(await readFile(join(path, file), "utf8"));
  await asUser(owner, () =>
    rpc(
      "create_business",
      [business, "Synthetic ledger business"],
      ["uuid", "text"],
    ),
  );
  await asUser(other, () =>
    rpc(
      "create_business",
      [foreign, "Synthetic foreign business"],
      ["uuid", "text"],
    ),
  );
  legacy = await asUser(owner, () =>
    rpc(
      "accept_manual_transaction",
      [
        business,
        randomUUID(),
        JSON.stringify({
          version: 1,
          businessDate: "2025-01-01",
          kind: "sale",
          amountCentavos: "12345",
          description: null,
          moneyMovement: "in",
          reviewConfirmed: true,
          expectedRevision: 0,
        }),
      ],
      ["uuid", "uuid", "jsonb"],
    ),
  );
  for (const file of files.filter((f) => f.includes("ledger_")))
    await db.exec(await readFile(join(path, file), "utf8"));
  for (const file of files.filter((f) => f.includes("preparation_profiles")))
    await db.exec(await readFile(join(path, file), "utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("ledger lifecycle in PostgreSQL", () => {
  it("clarifies an unknown owner movement only with full amount and date, idempotently", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({ kind: "owner_contribution", paymentStatus: "unknown" }),
      );
      await expect(
        mutate(
          "resolve_payment",
          { paymentKnowledge: "known", reason: "No actual date supplied" },
          c.id,
          1,
        ),
      ).rejects.toThrow("CLARIFICATION_REQUIRED");
      await expect(
        mutate(
          "add_payment",
          { amountCentavos: "100", paymentDate: "2026-10-23" },
          c.id,
          1,
        ),
      ).rejects.toThrow("INVALID_PAYMENT");
      const op = randomUUID(),
        values = { amountCentavos: "10000", paymentDate: "2026-10-24" };
      const movement = await mutate("add_payment", values, c.id, 1, op);
      expect(await mutate("add_payment", values, c.id, 1, op)).toEqual(
        movement,
      );
      const d = await detail(c.id);
      expect(d.record.kind).toBe("owner_contribution");
      expect(d.record.paymentKnowledge).toBe("known");
      expect(d.record.paymentStatus).toBe("paid");
      expect(d.record.remainingCentavos).toBe("0");
      expect(d.payments).toHaveLength(1);
    }));
  it("preserves explicit zero, unpaid and unknown without inventing payment events", async () =>
    asUser(owner, async () => {
      for (const paymentStatus of ["paid", "unpaid", "unknown"]) {
        const c = await mutate(
          "create",
          initial({
            amountCentavos: "0",
            paymentStatus,
            paymentAmountCentavos: paymentStatus === "paid" ? "0" : null,
            paymentDate: paymentStatus === "paid" ? "2026-10-23" : null,
          }),
        );
        const d = await detail(c.id);
        expect(d.payments).toHaveLength(0);
        expect(d.record.paymentStatus).toBe(paymentStatus);
        expect(d.record.paidCentavos).toBe("0");
      }
    }));
  it("preserves an explicitly paid zero sale or expense through corrections and kind-derived direction", async () =>
    asUser(owner, async () => {
      for (const kind of ["sale", "expense"]) {
        const c = await mutate(
          "create",
          initial({
            kind,
            amountCentavos: "0",
            paymentStatus: "paid",
            paymentAmountCentavos: "0",
            paymentDate: "2026-10-23",
          }),
        );
        await mutate(
          "correct",
          {
            kind,
            amountCentavos: "0",
            businessDate: "2026-10-24",
            description: "Clarified zero-value record",
            reason: "Owner corrected the date and description",
          },
          c.id,
          1,
        );
        const corrected = await detail(c.id);
        expect(corrected.record.paymentStatus).toBe("paid");
        expect(corrected.record.moneyMovement).toBe(
          kind === "sale" ? "in" : "out",
        );
        expect(corrected.record.businessDate).toBe("2026-10-24");
        expect(corrected.record.description).toBe(
          "Clarified zero-value record",
        );
        const changedKind = kind === "sale" ? "expense" : "sale";
        await mutate(
          "correct",
          {
            kind: changedKind,
            amountCentavos: "0",
            businessDate: "2026-10-24",
            description: "Corrected zero-value category",
            reason: "Owner corrected the transaction category",
          },
          c.id,
          2,
        );
        const d = await detail(c.id);
        expect(d.record.paymentStatus).toBe("paid");
        expect(d.record.moneyMovement).toBe(
          changedKind === "sale" ? "in" : "out",
        );
        expect(d.record.paidCentavos).toBe("0");
        expect(d.record.remainingCentavos).toBe("0");
        expect(d.record.revision).toBe(3);
        expect(d.history).toHaveLength(3);
        expect(d.payments).toHaveLength(0);
        expect(d.paymentHistory).toHaveLength(0);
      }
    }));
  it("keeps unpaid and unknown zero meaning through description and date corrections", async () =>
    asUser(owner, async () => {
      for (const kind of ["sale", "expense"])
        for (const paymentStatus of ["unpaid", "unknown"]) {
          const c = await mutate(
            "create",
            initial({ kind, amountCentavos: "0", paymentStatus }),
          );
          await mutate(
            "correct",
            {
              kind,
              amountCentavos: "0",
              businessDate: "2026-10-24",
              description: "Corrected zero record",
              reason: "Owner checked the description and date",
            },
            c.id,
            1,
          );
          const d = await detail(c.id);
          expect(d.record.paymentStatus).toBe(paymentStatus);
          expect(d.record.moneyMovement).toBe(
            paymentStatus === "unknown" ? "unknown" : "none",
          );
          expect(d.record.remainingCentavos).toBe(
            paymentStatus === "unknown" ? null : "0",
          );
          expect(d.record.revision).toBe(2);
          expect(d.payments).toHaveLength(0);
        }
    }));
  it("rejects changing a partially paid sale or expense to zero without losing its linked payment", async () =>
    asUser(owner, async () => {
      for (const kind of ["sale", "expense"]) {
        const c = await mutate(
          "create",
          initial({
            kind,
            paymentStatus: "partial",
            paymentAmountCentavos: "2500",
            paymentDate: "2026-10-23",
          }),
        );
        await expect(
          mutate(
            "correct",
            {
              kind,
              amountCentavos: "0",
              businessDate: "2026-10-23",
              description: "Cannot discard a linked payment",
              reason: "Attempted zero correction",
            },
            c.id,
            1,
          ),
        ).rejects.toThrow("LINKED_PAYMENT_CONFLICT");
        const d = await detail(c.id);
        expect(d.record.amountCentavos).toBe("10000");
        expect(d.record.paymentStatus).toBe("partial");
        expect(d.record.paidCentavos).toBe("2500");
        expect(d.record.remainingCentavos).toBe("7500");
        expect(d.record.revision).toBe(1);
        expect(d.history).toHaveLength(1);
        expect(d.payments).toHaveLength(1);
        expect(d.payments[0].amountCentavos).toBe("2500");
        expect(d.payments[0].status).toBe("active");
      }
    }));
  it("backfills known legacy movement without inventing a separate payment date", async () =>
    asUser(owner, async () => {
      const d = await detail(legacy.id);
      expect(d.record.paidCentavos).toBe("12345");
      expect(d.payments).toHaveLength(1);
      expect(d.paymentHistory[0].interpretation.provenance).toBe(
        "legacy_date_unknown",
      );
      expect(d.payments[0].paymentDate).toBeNull();
      expect(d.record.revision).toBe(1);
    }));
  it("excludes undated legacy money from period cash and allows owner-confirmed date correction", async () =>
    asUser(owner, async () => {
      const before = await summary("2025-01-01", "2025-01-31");
      expect(before.totals.salesCentavos).toBe("12345");
      expect(before.totals.receivedCentavos).toBe("0");
      expect(before.totals.receivableCentavos).toBe("0");
      expect(before.totals.undatedPaymentCount).toBeGreaterThan(0);
      const found = await rpc<LedgerList>(
        "ledger_list",
        [business, JSON.stringify({ payment: "needs_attention", page: 1 })],
        ["uuid", "jsonb"],
      );
      expect(found.records.map((r) => r.id)).toContain(legacy.id);
      const payment = (await detail(legacy.id)).payments[0];
      await mutate(
        "correct_payment",
        {
          paymentId: payment.id,
          expectedPaymentRevision: 1,
          amountCentavos: "12345",
          paymentDate: "2025-01-02",
          reason: "Owner checked the original payment date",
        },
        legacy.id,
        1,
      );
      const after = await summary("2025-01-01", "2025-01-31");
      expect(after.totals.receivedCentavos).toBe("12345");
      const updated = await detail(legacy.id);
      expect(updated.paymentHistory).toHaveLength(2);
      expect(updated.payments[0].paymentDate).toBe("2025-01-02");
    }));
  it("accepts partial payment and later settlement without another sale; replays before revision check", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({
          paymentStatus: "partial",
          paymentAmountCentavos: "2500",
          paymentDate: "2026-10-23",
        }),
      );
      expect((await detail(c.id)).record.remainingCentavos).toBe("7500");
      const op = randomUUID(),
        values = { amountCentavos: "7500", paymentDate: "2026-10-24" };
      const p = await mutate("add_payment", values, c.id, 1, op);
      expect(p.revision).toBe(2);
      await mutate(
        "correct",
        {
          kind: "sale",
          businessDate: "2026-10-23",
          amountCentavos: "10000",
          description: "Corrected description",
          reason: "Clarification",
        },
        c.id,
        2,
      );
      expect(await mutate("add_payment", values, c.id, 1, op)).toEqual(p);
      const d = await detail(c.id);
      expect(d.record.revision).toBe(3);
      expect(d.record.paymentStatus).toBe("paid");
      expect(d.payments).toHaveLength(2);
      expect(d.history).toHaveLength(3);
    }));
  it("rejects overpayment, zero payments, and payment dates before the record", async () =>
    asUser(owner, async () => {
      const c = await mutate("create", initial());
      for (const values of [
        { amountCentavos: "10001", paymentDate: "2026-10-23" },
        { amountCentavos: "0", paymentDate: "2026-10-23" },
        { amountCentavos: "100", paymentDate: "2026-10-22" },
      ])
        await expect(mutate("add_payment", values, c.id, 1)).rejects.toThrow();
      expect((await detail(c.id)).record.revision).toBe(1);
      await expect(
        mutate(
          "create",
          initial({
            paymentStatus: "partial",
            paymentAmountCentavos: "100",
            paymentDate: "2026-10-22",
          }),
        ),
      ).rejects.toThrow("PAYMENT_BEFORE_RECORD");
    }));
  it("retains unknown separately, requires clarification before payment, and records that resolution", async () =>
    asUser(owner, async () => {
      const c = await mutate("create", initial({ paymentStatus: "unknown" }));
      expect((await detail(c.id)).record.remainingCentavos).toBeNull();
      await expect(
        mutate(
          "add_payment",
          { amountCentavos: "100", paymentDate: "2026-10-23" },
          c.id,
          1,
        ),
      ).rejects.toThrow("CLARIFICATION_REQUIRED");
      await mutate(
        "resolve_payment",
        {
          paymentKnowledge: "known",
          reason: "Owner checked records: no earlier payment",
        },
        c.id,
        1,
      );
      await mutate(
        "add_payment",
        { amountCentavos: "100", paymentDate: "2026-10-23" },
        c.id,
        2,
      );
      expect((await detail(c.id)).record.remainingCentavos).toBe("9900");
    }));
  it("prevents record correction/void conflicts with linked payments; retains payment void history", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({
          paymentStatus: "paid",
          paymentAmountCentavos: "10000",
          paymentDate: "2026-10-23",
        }),
      );
      await expect(
        mutate(
          "correct",
          {
            kind: "sale",
            businessDate: "2026-10-23",
            amountCentavos: "5000",
            description: null,
            reason: "Mistake",
          },
          c.id,
          1,
        ),
      ).rejects.toThrow("LINKED_PAYMENT_CONFLICT");
      await expect(
        mutate("void", { reason: "Duplicate" }, c.id, 1),
      ).rejects.toThrow("LINKED_PAYMENT_CONFLICT");
      const payment = (await detail(c.id)).payments[0];
      await mutate(
        "void_payment",
        {
          paymentId: payment.id,
          expectedPaymentRevision: 1,
          reason: "Payment entered in error",
        },
        c.id,
        1,
      );
      await mutate("void", { reason: "Duplicate entry" }, c.id, 2);
      const d = await detail(c.id);
      expect(d.record.status).toBe("void");
      expect(d.record.revision).toBe(3);
      expect(d.payments[0].status).toBe("void");
      expect(d.paymentHistory).toHaveLength(2);
    }));
  it("corrects payment amounts with independent payment/record revisions", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({
          paymentStatus: "partial",
          paymentAmountCentavos: "100",
          paymentDate: "2026-10-23",
        }),
      );
      const payment = (await detail(c.id)).payments[0];
      await mutate(
        "correct_payment",
        {
          paymentId: payment.id,
          expectedPaymentRevision: 1,
          amountCentavos: "2500",
          paymentDate: "2026-10-24",
          reason: "Corrected receipt",
        },
        c.id,
        1,
      );
      const d = await detail(c.id);
      expect(d.record.remainingCentavos).toBe("7500");
      expect(d.payments[0].revision).toBe(2);
      expect(d.paymentHistory).toHaveLength(2);
      await expect(
        mutate(
          "correct_payment",
          {
            paymentId: payment.id,
            expectedPaymentRevision: 1,
            amountCentavos: "2600",
            paymentDate: "2026-10-24",
            reason: "Stale",
          },
          c.id,
          2,
        ),
      ).rejects.toThrow("REVISION_CONFLICT");
    }));
  it("uses event dates independently and excludes future settlements from earlier period balances", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({ businessDate: "2024-12-20", amountCentavos: "70000" }),
      );
      await mutate(
        "add_payment",
        { amountCentavos: "30000", paymentDate: "2025-02-01" },
        c.id,
        1,
      );
      const dec = await summary("2024-12-01", "2024-12-31");
      expect(dec.totals.salesCentavos).toBe("70000");
      expect(dec.totals.receivedCentavos).toBe("0");
      expect(dec.totals.receivableCentavos).toBe("70000");
      const feb = await summary("2025-02-01", "2025-02-28");
      expect(feb.totals.salesCentavos).toBe("0");
      expect(feb.totals.receivedCentavos).toBe("30000");
      expect(feb.records.map((r) => r.id)).toContain(c.id);
    }));
  it("keeps immutable snapshots and flags them stale after relevant ledger mutations", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({ businessDate: "2023-05-01", amountCentavos: "111" }),
      );
      const op = randomUUID(),
        s = await snapshot(op, "2023-05-01", "2023-05-31");
      expect(s.totals.salesCentavos).toBe("111");
      expect(s.stale).toBe(false);
      await mutate(
        "correct",
        {
          kind: "sale",
          businessDate: "2023-05-01",
          amountCentavos: "222",
          description: null,
          reason: "Corrected original",
        },
        c.id,
        1,
      );
      const old = await rpc<LedgerSnapshot>(
        "ledger_read_snapshot",
        [business, op],
        ["uuid", "uuid"],
      );
      expect(old.stale).toBe(true);
      expect(old.totals.salesCentavos).toBe("111");
      const retry = await snapshot(op, "2023-05-01", "2023-05-31");
      expect(retry.stale).toBe(true);
      expect(retry.manifest[0].revision).toBe(1);
    }));
  it("finds older records with search and paginates past Home's fifty-record boundary", async () =>
    asUser(owner, async () => {
      for (let i = 0; i < 56; i++)
        await mutate(
          "create",
          initial({
            businessDate: "2022-01-01",
            description: "Search fixture " + i,
          }),
        );
      const read = (page: number) =>
        rpc<LedgerList>(
          "ledger_list",
          [
            business,
            JSON.stringify({
              from: "2022-01-01",
              to: "2022-01-31",
              search: "Search fixture",
              page,
            }),
          ],
          ["uuid", "jsonb"],
        );
      const first = await read(1),
        third = await read(3);
      expect(first.total).toBe(56);
      expect(first.records).toHaveLength(25);
      expect(third.records).toHaveLength(6);
    }));
  it("rejects incompatible replay and direct write/foreign/anonymous access", async () => {
    const operation = randomUUID();
    const c = await asUser(owner, () =>
      mutate("create", initial(), null, 0, operation),
    );
    await asUser(owner, () =>
      expect(
        mutate("create", initial({ amountCentavos: "9" }), null, 0, operation),
      ).rejects.toThrow("OPERATION_CONFLICT"),
    );
    await asUser(other, () =>
      expect(detail(c.id)).rejects.toThrow("FORBIDDEN"),
    );
    await asUser(null, () =>
      expect(detail(c.id)).rejects.toThrow("UNAUTHENTICATED"),
    );
    await asUser(other, async () => {
      const rows = await db.query(
        "select * from public.transaction_payments where business_id=$1",
        [business],
      );
      expect(rows.rows).toHaveLength(0);
    });
    await asUser(owner, () =>
      expect(
        db.query(
          "update public.transactions set amount_centavos=1 where id=$1",
          [c.id],
        ),
      ).rejects.toThrow("permission denied"),
    );
    await asUser(owner, () =>
      expect(
        db.query(
          "insert into public.transaction_payments(business_id,transaction_id,amount_centavos,payment_date,recorded_by) values($1,$2,1,'2026-10-23',$3)",
          [business, c.id, owner],
        ),
      ).rejects.toThrow("permission denied"),
    );
  });
  it("rolls the entire correction back if its receipt cannot persist", async () => {
    const c = await asUser(owner, () => mutate("create", initial()));
    await db.exec(
      "create function app_private.reject_ledger_receipt() returns trigger language plpgsql as $$begin raise exception 'synthetic receipt failure';end$$;create trigger reject_ledger_receipt before insert on app_private.ledger_operations for each row execute function app_private.reject_ledger_receipt();",
    );
    await asUser(owner, () =>
      expect(
        mutate(
          "correct",
          {
            kind: "sale",
            businessDate: "2026-10-23",
            amountCentavos: "2",
            description: null,
            reason: "Rollback fixture",
          },
          c.id,
          1,
        ),
      ).rejects.toThrow("synthetic receipt failure"),
    );
    await db.exec(
      "drop trigger reject_ledger_receipt on app_private.ledger_operations;drop function app_private.reject_ledger_receipt();",
    );
    const d = await asUser(owner, () => detail(c.id));
    expect(d.record.amountCentavos).toBe("10000");
    expect(d.record.revision).toBe(1);
    expect(d.history).toHaveLength(1);
  });
  it("retains immutable preparation evidence and makes changed profile inputs stale without breaking replay", async () =>
    asUser(owner, async () => {
      const values = {
        year: 2026,
        registration: "unknown",
        taxTreatment: "unknown",
        evidence: "",
        priorIncomeCentavos: null,
        priorTaxPaymentsCentavos: null,
        otherCreditsCentavos: null,
        coverage: "unknown",
        notes: "",
      };
      const saved = await rpc<{ revision: number }>(
        "save_preparation_profile",
        [business, randomUUID(), 0, JSON.stringify(values)],
        ["uuid", "uuid", "integer", "jsonb"],
      );
      const op = randomUUID(),
        preparation = { profileRevision: saved.revision, profile: values };
      const take = () =>
        rpc<LedgerSnapshot>(
          "ledger_snapshot",
          [
            business,
            op,
            "2026-10-01",
            "2026-10-31",
            JSON.stringify(preparation),
          ],
          ["uuid", "uuid", "date", "date", "jsonb"],
        );
      expect((await take()).stale).toBe(false);
      await rpc(
        "save_preparation_profile",
        [
          business,
          randomUUID(),
          saved.revision,
          JSON.stringify({ ...values, notes: "New evidence" }),
        ],
        ["uuid", "uuid", "integer", "jsonb"],
      );
      const replay = await take();
      expect(replay.stale).toBe(true);
      expect(replay.preparation).toEqual(preparation);
      const old = await rpc<LedgerSnapshot>(
        "ledger_read_snapshot",
        [business, op],
        ["uuid", "uuid"],
      );
      expect(old.stale).toBe(true);
      await expect(
        rpc(
          "ledger_snapshot",
          [
            business,
            randomUUID(),
            "2026-10-01",
            "2026-10-31",
            JSON.stringify(preparation),
          ],
          ["uuid", "uuid", "date", "date", "jsonb"],
        ),
      ).rejects.toThrow("REVISION_CONFLICT");
    }));
  it("keeps ownership checks on snapshot and private-history RPCs", async () => {
    const s = await asUser(owner, () => snapshot());
    await asUser(other, () =>
      expect(
        rpc("ledger_read_snapshot", [business, s.id], ["uuid", "uuid"]),
      ).rejects.toThrow("FORBIDDEN"),
    );
    await asUser(owner, () =>
      expect(
        db.query("select * from app_private.payment_revisions"),
      ).rejects.toThrow("permission denied"),
    );
    await asUser(owner, () =>
      expect(
        db.query("select app_private.ledger_record_json($1::uuid)", [
          legacy.id,
        ]),
      ).rejects.toThrow("permission denied"),
    );
  });
  it("supports correcting and voiding a contribution's mistaken initial movement without adding a sale", async () =>
    asUser(owner, async () => {
      const c = await mutate(
        "create",
        initial({
          kind: "owner_contribution",
          paymentStatus: "paid",
          paymentAmountCentavos: "10000",
          paymentDate: "2026-10-23",
        }),
      );
      const p = (await detail(c.id)).payments[0];
      await mutate(
        "void_payment",
        {
          paymentId: p.id,
          expectedPaymentRevision: 1,
          reason: "Erroneous movement",
        },
        c.id,
        1,
      );
      await mutate("void", { reason: "Duplicate contribution" }, c.id, 2);
      expect((await detail(c.id)).record.kind).toBe("owner_contribution");
    }));
});
