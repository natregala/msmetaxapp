import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type {
  LedgerDetail,
  LedgerSnapshot,
  LedgerSummary,
} from "@/features/ledger/ledger.types";

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
test.skip(
  !process.env.E2E_PASSWORD ||
    !process.env.E2E_EMAIL_A ||
    !process.env.E2E_EMAIL_B,
  "Requires the existing isolated synthetic accounts; see development/testing.md.",
);
async function login(client: APIRequestContext, email: string) {
  const response = await client.post("/api/auth/sign-in", {
    headers: { Origin: origin },
    data: { email, password: process.env.E2E_PASSWORD },
  });
  expect(response.status()).toBe(200);
}
async function mutation(
  client: APIRequestContext,
  command: Record<string, unknown>,
) {
  return client.post("/api/ledger", {
    headers: { Origin: origin },
    data: command,
  });
}

test("hosted ledger lifecycle: partial settlement, concurrent retry, revisions, immutable reports and owner isolation", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin });
  const again = await playwright.request.newContext({ baseURL: origin });
  const b = await playwright.request.newContext({ baseURL: origin });
  try {
    await Promise.all([
      login(a, process.env.E2E_EMAIL_A!),
      login(again, process.env.E2E_EMAIL_A!),
      login(b, process.env.E2E_EMAIL_B!),
    ]);
    const businessId = randomUUID();
    const created = await a.post("/api/businesses", {
      headers: { Origin: origin },
      data: {
        id: businessId,
        name: "Synthetic hosted ledger lifecycle",
        activity: "products",
      },
    });
    expect(created.status()).toBe(200);
    const entry = {
      businessId,
      operationId: randomUUID(),
      action: "create",
      expectedRevision: 0,
      values: {
        businessDate: "2026-10-23",
        kind: "sale",
        amountCentavos: "10000",
        description: "=Synthetic formula safety fixture",
        paymentStatus: "partial",
        paymentAmountCentavos: "2500",
        paymentDate: "2026-10-23",
      },
    };
    const response = await mutation(a, entry);
    expect(response.status()).toBe(200);
    const record = (await response.json()).data as {
      id: string;
      revision: number;
    };
    const detail = async (client = a) => {
      const result = await client.get(
        "/api/ledger/records/" + record.id + "?businessId=" + businessId,
      );
      expect(result.status()).toBe(200);
      return (await result.json()).data as LedgerDetail;
    };
    let current = await detail(again);
    expect(current.record.remainingCentavos).toBe("7500");
    expect(current.record.paymentStatus).toBe("partial");
    expect(current.payments).toHaveLength(1);
    const payment = {
      businessId,
      operationId: randomUUID(),
      action: "add_payment",
      recordId: record.id,
      expectedRevision: 1,
      values: { amountCentavos: "7500", paymentDate: "2026-10-24" },
    };
    const retries = await Promise.all([
      mutation(a, payment),
      mutation(again, payment),
      mutation(a, payment),
    ]);
    const results = [];
    for (const retry of retries) {
      expect(retry.status()).toBe(200);
      results.push((await retry.json()).data);
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual(results[2]);
    current = await detail(again);
    expect(current.record.revision).toBe(2);
    expect(current.record.paidCentavos).toBe("10000");
    expect(current.payments).toHaveLength(2);
    const period = new URLSearchParams({
      businessId,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    const summaryResponse = await a.get("/api/ledger/summary?" + period);
    expect(summaryResponse.status()).toBe(200);
    const summary = (await summaryResponse.json()).data as LedgerSummary;
    expect(summary.totals.salesCentavos).toBe("10000");
    expect(summary.totals.receivedCentavos).toBe("10000");
    expect(summary.totals.receivableCentavos).toBe("0");
    const snapshotId = randomUUID();
    const snapshotResponse = await a.post("/api/ledger/snapshots", {
      headers: { Origin: origin },
      data: {
        businessId,
        operationId: snapshotId,
        from: "2026-10-01",
        to: "2026-10-31",
      },
    });
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = (await snapshotResponse.json()).data as LedgerSnapshot;
    expect(snapshot.stale).toBe(false);
    expect(snapshot.manifest).toContainEqual({
      recordId: record.id,
      revision: 2,
    });
    const correction = {
      businessId,
      operationId: randomUUID(),
      action: "correct",
      recordId: record.id,
      expectedRevision: 2,
      values: {
        kind: "sale",
        businessDate: "2026-10-23",
        amountCentavos: "10000",
        description: "Synthetic corrected description",
        reason: "Hosted revision fixture",
      },
    };
    expect((await mutation(a, correction)).status()).toBe(200);
    const oldReplay = await mutation(again, payment);
    expect(oldReplay.status()).toBe(200);
    expect((await oldReplay.json()).data.revision).toBe(2);
    expect((await detail()).record.revision).toBe(3);
    const competing = await Promise.all(
      ["A", "B"].map((suffix) =>
        mutation(a, {
          ...correction,
          operationId: randomUUID(),
          expectedRevision: 3,
          values: {
            ...correction.values,
            description: "Synthetic conflicting change " + suffix,
          },
        }),
      ),
    );
    expect(competing.map((r) => r.status()).sort()).toEqual([200, 409]);
    current = await detail();
    expect(current.record.revision).toBe(4);
    const staleResponse = await a.get(
      "/api/ledger/snapshots/" + snapshotId + "?businessId=" + businessId,
    );
    const stale = (await staleResponse.json()).data as LedgerSnapshot;
    expect(stale.stale).toBe(true);
    expect(stale.totals.salesCentavos).toBe("10000");
    expect(stale.manifest[0].revision).toBe(2);
    const csvResponse = await a.get(
      "/api/ledger/export?" + new URLSearchParams({ businessId, snapshotId }),
    );
    expect(csvResponse.status()).toBe(200);
    const csv = await csvResponse.text();
    expect(csv).toContain("STALE");
    expect(csv).toContain('"\'=Synthetic formula safety fixture"');
    expect(csv).toContain('"100.00"');
    for (const url of [
      "/api/ledger/records/" + record.id + "?businessId=" + businessId,
      "/api/ledger/snapshots/" + snapshotId + "?businessId=" + businessId,
      "/api/ledger/export?" + new URLSearchParams({ businessId, snapshotId }),
    ])
      expect((await b.get(url)).status()).toBe(403);
    expect(
      (
        await mutation(b, {
          ...correction,
          operationId: randomUUID(),
          expectedRevision: 4,
        })
      ).status(),
    ).toBe(403);
    const direct = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (
        await direct.auth.signInWithPassword({
          email: process.env.E2E_EMAIL_B!,
          password: process.env.E2E_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    const denied = await direct
      .from("transaction_payments")
      .select("id")
      .eq("business_id", businessId);
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);
    expect(
      (
        await direct.rpc("ledger_detail", {
          p_business_id: businessId,
          p_record_id: record.id,
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await direct.from("transaction_payments").insert({
          business_id: businessId,
          transaction_id: record.id,
          amount_centavos: 1,
          payment_date: "2026-10-24",
          recorded_by: process.env.E2E_USER_B!,
        })
      ).error,
    ).not.toBeNull();
    let revision = 4;
    for (const event of current.payments) {
      const voided = await mutation(a, {
        businessId,
        operationId: randomUUID(),
        action: "void_payment",
        recordId: record.id,
        expectedRevision: revision,
        values: {
          paymentId: event.id,
          expectedPaymentRevision: event.revision,
          reason: "Synthetic void fixture",
        },
      });
      expect(voided.status()).toBe(200);
      revision = (await voided.json()).data.revision;
    }
    expect(
      (
        await mutation(a, {
          businessId,
          operationId: randomUUID(),
          action: "void",
          recordId: record.id,
          expectedRevision: revision,
          values: { reason: "Synthetic lifecycle complete" },
        })
      ).status(),
    ).toBe(200);
    current = await detail(again);
    expect(current.record.status).toBe("void");
    expect(current.history).toHaveLength(7);
    expect(current.paymentHistory).toHaveLength(4);
    const after = (await (await a.get("/api/ledger/summary?" + period)).json())
      .data as LedgerSummary;
    expect(after.totals.salesCentavos).toBe("0");
    expect(after.totals.receivedCentavos).toBe("0");
    expect(after.totals.voidCount).toBe(1);
    const recent = (
      await (await a.get("/api/transactions?businessId=" + businessId)).json()
    ).data.records;
    expect(recent).toHaveLength(0);
  } finally {
    await Promise.all([a.dispose(), again.dispose(), b.dispose()]);
  }
});
