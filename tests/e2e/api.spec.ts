import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const password = process.env.E2E_PASSWORD;
test.skip(
  !password || !process.env.E2E_EMAIL_A || !process.env.E2E_EMAIL_B,
  "Requires isolated synthetic accounts in .env.e2e; see README.",
);

async function login(client: APIRequestContext, email: string) {
  const response = await client.post("/api/auth/sign-in", {
    headers: { Origin: origin },
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).ok).toBe(true);
}
async function business(client: APIRequestContext, name: string) {
  const response = await client.post("/api/businesses", {
    headers: { Origin: origin },
    data: { id: randomUUID(), name },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data.business as { id: string; name: string };
}

test("hosted persistence, independent owners, concurrent retries, exact values, and rejected bypasses", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin });
  const b = await playwright.request.newContext({ baseURL: origin });
  const retry = await playwright.request.newContext({ baseURL: origin });
  try {
    await Promise.all([
      login(a, process.env.E2E_EMAIL_A!),
      login(b, process.env.E2E_EMAIL_B!),
      login(retry, process.env.E2E_EMAIL_A!),
    ]);
    const [businessA, businessB, businessA2] = await Promise.all([
      business(a, "Synthetic API owner A"),
      business(b, "Synthetic API owner B"),
      business(a, "Synthetic API second business"),
    ]);
    const command = {
      businessId: businessA.id,
      operationId: randomUUID(),
      payload: {
        version: 1,
        businessDate: "2026-10-23",
        kind: "sale",
        amountCentavos: "12345678901",
        description: "Synthetic exact amount / unpaid sale",
        moneyMovement: "none",
        reviewConfirmed: true,
        expectedRevision: 0,
      },
    };
    const requests = await Promise.all(
      [a, retry, a].map((client) =>
        client.post("/api/transactions", {
          headers: { Origin: origin },
          data: command,
        }),
      ),
    );
    const acknowledgements = [];
    for (const response of requests) {
      expect(response.status()).toBe(200);
      acknowledgements.push((await response.json()).data);
    }
    expect(acknowledgements[0]).toEqual(acknowledgements[1]);
    expect(acknowledgements[0]).toEqual(acknowledgements[2]);
    expect(acknowledgements[0].revision).toBe(1);

    // Read in a separately authenticated request context after the write returned.
    const reopened = await retry.get(
      `/api/transactions?businessId=${businessA.id}`,
    );
    expect(reopened.status()).toBe(200);
    const records = (await reopened.json()).data.records;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: acknowledgements[0].id,
      amountCentavos: "12345678901",
      moneyMovement: "none",
      source: "manual",
      reviewStatus: "confirmed",
      businessDate: "2026-10-23",
    });
    expect(
      (
        await (
          await a.get(`/api/transactions?businessId=${businessA2.id}`)
        ).json()
      ).data.records,
    ).toEqual([]);
    expect(
      (
        await (
          await b.get(`/api/transactions?businessId=${businessB.id}`)
        ).json()
      ).data.records,
    ).toEqual([]);
    expect(
      (await b.get(`/api/transactions?businessId=${businessA.id}`)).status(),
    ).toBe(403);
    expect(
      (
        await b.post("/api/transactions", {
          headers: { Origin: origin },
          data: command,
        })
      ).status(),
    ).toBe(403);
    const conflict = await a.post("/api/transactions", {
      headers: { Origin: origin },
      data: {
        ...command,
        payload: { ...command.payload, amountCentavos: "1" },
      },
    });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).error.code).toBe("CONFLICT");
    const bad = await a.post("/api/transactions", {
      headers: { Origin: origin },
      data: {
        ...command,
        operationId: randomUUID(),
        payload: { ...command.payload, amountCentavos: null },
      },
    });
    expect(bad.status()).toBe(422);
    expect(
      (
        await (
          await a.get(`/api/transactions?businessId=${businessA.id}`)
        ).json()
      ).data.records,
    ).toHaveLength(1);

    // Call Supabase directly with owner B's user token to test database security,
    // independently of the app's ownership check.
    const direct = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signedIn = await direct.auth.signInWithPassword({
      email: process.env.E2E_EMAIL_B!,
      password: password!,
    });
    expect(signedIn.error).toBeNull();
    const foreignRead = await direct
      .from("transactions")
      .select("id")
      .eq("business_id", businessA.id);
    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data).toEqual([]);
    const foreignRpc = await direct.rpc("accept_manual_transaction", {
      p_business_id: businessA.id,
      p_operation_id: randomUUID(),
      p_payload: command.payload,
    });
    expect(foreignRpc.error?.code).toBe("42501");
    const bypass = await direct.from("transactions").insert({
      business_id: businessB.id,
      kind: "sale",
      business_date: "2026-10-23",
      amount_centavos: 100,
      money_movement: "in",
      recorded_by: signedIn.data.user!.id,
    });
    expect(bypass.error?.code).toBe("42501");
    await direct.auth.signOut();
  } finally {
    await Promise.all([a.dispose(), b.dispose(), retry.dispose()]);
  }
});

test("anonymous access and cross-origin writes are rejected without provider details", async ({
  request,
}) => {
  const anonymousRead = await request.get(
    `/api/transactions?businessId=${randomUUID()}`,
  );
  expect(anonymousRead.status()).toBe(401);
  expect((await anonymousRead.json()).error.code).toBe("UNAUTHENTICATED");
  const foreignOrigin = await request.post("/api/businesses", {
    headers: { Origin: "https://unrelated.invalid" },
    data: { id: randomUUID(), name: "Synthetic rejected" },
  });
  expect(foreignOrigin.status()).toBe(403);
  expect((await foreignOrigin.json()).error).toEqual({
    code: "INVALID_ORIGIN",
  });
  expect(anonymousRead.headers()["cache-control"]).toContain("no-store");
});

test("guided setup is persistent, owner-scoped, and retry-compatible after a profile rename", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin });
  const b = await playwright.request.newContext({ baseURL: origin });
  try {
    await Promise.all([
      login(a, process.env.E2E_EMAIL_A!),
      login(b, process.env.E2E_EMAIL_B!),
    ]);
    const command = {
      id: randomUUID(),
      name: "Synthetic guided service business",
      activity: "services",
    };
    const created = await a.post("/api/businesses", {
      headers: { Origin: origin },
      data: command,
    });
    expect(created.status()).toBe(200);
    expect((await created.json()).data.business).toMatchObject({
      ...command,
      setupCompleted: true,
      profileRevision: 1,
    });
    const changed = await a.patch("/api/businesses", {
      headers: { Origin: origin },
      data: {
        id: command.id,
        name: "Synthetic renamed service business",
        expectedRevision: 1,
      },
    });
    expect(changed.status()).toBe(200);
    expect((await changed.json()).data.business.profileRevision).toBe(2);
    const stale = await a.patch("/api/businesses", {
      headers: { Origin: origin },
      data: {
        id: command.id,
        name: "Synthetic stale edit",
        expectedRevision: 1,
      },
    });
    expect(stale.status()).toBe(409);
    const replay = await a.post("/api/businesses", {
      headers: { Origin: origin },
      data: command,
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.business).toMatchObject({
      name: "Synthetic renamed service business",
      profileRevision: 2,
      activity: "services",
      setupCompleted: true,
    });
    const foreign = await b.patch("/api/businesses", {
      headers: { Origin: origin },
      data: { id: command.id, name: "Synthetic denied", expectedRevision: 2 },
    });
    expect(foreign.status()).toBe(403);
    const ownerB = (await (await b.get("/api/businesses")).json()).data
      .businesses;
    expect(ownerB.some((item: { id: string }) => item.id === command.id)).toBe(
      false,
    );
    const invalid = await a.post("/api/businesses", {
      headers: { Origin: origin },
      data: {
        id: randomUUID(),
        name: "Synthetic invalid",
        activity: "assumed_taxpayer",
      },
    });
    expect(invalid.status()).toBe(422);
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});
