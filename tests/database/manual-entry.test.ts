import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

// PGlite executes PostgreSQL, including real grants, RLS and PL/pgSQL. Only the
// Supabase auth schema is a fixture. This suite does not test GoTrue/PostgREST,
// hosted service behavior, or simultaneous independent Postgres connections.
const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const businessA = "11111111-1111-4111-8111-111111111111";
const businessA2 = "22222222-2222-4222-8222-222222222222";
const businessB = "33333333-3333-4333-8333-333333333333";
const operation = "44444444-4444-4444-8444-444444444444";
const payload = {
  version: 1,
  businessDate: "2026-10-23",
  kind: "sale",
  amountCentavos: "12345",
  description: "Synthetic test sale",
  moneyMovement: "in",
  reviewConfirmed: true,
  expectedRevision: 0,
};
let db: PGlite;
let directory: string;
let accepted: { id: string; revision: number };

async function asUser<T>(
  actor: string | null,
  run: () => Promise<T>,
): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    actor ?? "",
  ]);
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function accept(
  business = businessA,
  op = randomUUID(),
  data: unknown = payload,
) {
  const result = await db.query<{ result: { id: string; revision: number } }>(
    "select public.accept_manual_transaction($1::uuid, $2::uuid, $3::jsonb) as result",
    [business, op, JSON.stringify(data)],
  );
  return result.rows[0].result;
}

async function counts() {
  const result = await db.query<{
    records: number;
    revisions: number;
    mutations: number;
  }>(`
    select (select count(*)::integer from public.transactions) as records,
      (select count(*)::integer from app_private.transaction_revisions) as revisions,
      (select count(*)::integer from app_private.transaction_mutations) as mutations
  `);
  return result.rows[0];
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "msme-db-"));
  db = new PGlite(directory);
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users (id) values ('${ownerA}'), ('${ownerB}');
  `);
  const migrationDir = resolve("supabase/migrations");
  const files = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files)
    await db.exec(await readFile(join(migrationDir, file), "utf8"));
  await asUser(ownerA, async () => {
    await db.query("select public.create_business($1::uuid,$2)", [
      businessA,
      "Synthetic business A",
    ]);
    await db.query("select public.create_business($1::uuid,$2)", [
      businessA2,
      "Synthetic business A2",
    ]);
  });
  await asUser(ownerB, () =>
    db.query("select public.create_business($1::uuid,$2)", [
      businessB,
      "Synthetic business B",
    ]),
  );
}, 60_000);

afterAll(async () => {
  if (db) await db.close();
  if (
    directory &&
    dirname(resolve(directory)) === resolve(tmpdir()) &&
    basename(directory).startsWith("msme-db-")
  ) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("manual transaction database boundary", { concurrent: false }, () => {
  it("accepts an exact record with manual provenance, audit and replay receipt atomically", async () => {
    accepted = await asUser(ownerA, () => accept(businessA, operation));
    expect(accepted).toEqual({ id: expect.any(String), revision: 1 });
    const result = await asUser(ownerA, () =>
      db.query(
        `
      select amount_centavos::text as amount, business_date::text as date, source,
        review_status, revision, recorded_by::text as actor, currency, money_movement
      from public.transactions where id = $1::uuid
    `,
        [accepted.id],
      ),
    );
    expect(result.rows).toEqual([
      {
        amount: "12345",
        date: "2026-10-23",
        source: "manual",
        review_status: "confirmed",
        revision: 1,
        actor: ownerA,
        currency: "PHP",
        money_movement: "in",
      },
    ]);
    expect(await counts()).toEqual({ records: 1, revisions: 1, mutations: 1 });
    const audit = await db.query(
      "select interpretation, previous_revision from app_private.transaction_revisions where transaction_id=$1",
      [accepted.id],
    );
    expect(audit.rows).toEqual([
      { interpretation: payload, previous_revision: 0 },
    ]);
  });

  it("persists committed data and replay receipts across database close and reopen", async () => {
    await db.close();
    db = new PGlite(directory);
    const result = await asUser(ownerA, () =>
      db.query("select id::text from public.transactions where id=$1", [
        accepted.id,
      ]),
    );
    expect(result.rows).toEqual([{ id: accepted.id }]);
    expect(await asUser(ownerA, () => accept(businessA, operation))).toEqual(
      accepted,
    );
    expect(await counts()).toEqual({ records: 1, revisions: 1, mutations: 1 });
  });

  it("replays an identical command without duplicating any accepted state", async () => {
    const before = await counts();
    for (let retry = 0; retry < 4; retry++) {
      expect(await asUser(ownerA, () => accept(businessA, operation))).toEqual(
        accepted,
      );
    }
    expect(await counts()).toEqual(before);
  });

  it("rejects incompatible reuse of an operation identifier", async () => {
    const before = await counts();
    await expect(
      asUser(ownerA, () =>
        accept(businessA, operation, { ...payload, amountCentavos: "12346" }),
      ),
    ).rejects.toMatchObject({ code: "P0001", message: "OPERATION_CONFLICT" });
    expect(await counts()).toEqual(before);
  });

  it("scopes operation identities to the business", async () => {
    const other = await asUser(ownerA, () => accept(businessA2, operation));
    expect(other.id).not.toBe(accepted.id);
    expect(await asUser(ownerA, () => accept(businessA2, operation))).toEqual(
      other,
    );
  });

  it("enforces two-account business and transaction isolation even without a business filter", async () => {
    await asUser(ownerB, () => accept(businessB));
    const visibleA = await asUser(ownerA, () =>
      db.query(
        "select distinct business_id::text from public.transactions order by business_id",
      ),
    );
    const visibleB = await asUser(ownerB, () =>
      db.query("select distinct business_id::text from public.transactions"),
    );
    expect(visibleA.rows).toEqual([
      { business_id: businessA },
      { business_id: businessA2 },
    ]);
    expect(visibleB.rows).toEqual([{ business_id: businessB }]);
    const businesses = await asUser(ownerB, () =>
      db.query("select id::text from public.businesses"),
    );
    expect(businesses.rows).toEqual([{ id: businessB }]);
    expect(
      (
        await asUser(ownerB, () =>
          db.query("select id from public.transactions where id=$1", [
            accepted.id,
          ]),
        )
      ).rows,
    ).toEqual([]);
  });

  it("rejects foreign-business creation and replay before revealing an accepted result", async () => {
    await expect(asUser(ownerB, () => accept(businessA))).rejects.toMatchObject(
      { code: "42501", message: "FORBIDDEN" },
    );
    await expect(
      asUser(ownerB, () => accept(businessA, operation)),
    ).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
    await expect(
      asUser(ownerB, () =>
        db.query("select public.create_business($1::uuid,$2)", [
          businessA,
          "Synthetic business A",
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
  });

  it("denies absent identity and the anonymous role", async () => {
    await expect(asUser(null, () => accept())).rejects.toMatchObject({
      code: "42501",
      message: "UNAUTHENTICATED",
    });
    expect(
      (await asUser(null, () => db.query("select id from public.transactions")))
        .rows,
    ).toEqual([]);
    await db.exec("set role anon");
    try {
      await expect(accept()).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("select id from public.transactions"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("reset role");
    }
  });

  it("blocks direct financial writes, ownership reassignment and private receipt access", async () => {
    await asUser(ownerA, async () => {
      await expect(
        db.query(
          "insert into public.transactions (business_id, kind, business_date, amount_centavos, money_movement, recorded_by) values ($1,'sale','2026-10-23',100,'in',$2)",
          [businessA, ownerA],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query(
          "update public.transactions set amount_centavos=1 where id=$1",
          [accepted.id],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("delete from public.transactions where id=$1", [accepted.id]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("update public.businesses set owner_id=$1 where id=$2", [
          ownerB,
          businessA,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("select * from app_private.transaction_mutations"),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("accepts explicit zero and the exact upper bound while retaining unknown movement", async () => {
    for (const amount of ["0", "999999999999"]) {
      const result = await asUser(ownerA, () =>
        accept(businessA, randomUUID(), {
          ...payload,
          amountCentavos: amount,
          moneyMovement: "unknown",
          description: null,
        }),
      );
      const row = await asUser(ownerA, () =>
        db.query(
          "select amount_centavos::text as amount, money_movement, description from public.transactions where id=$1",
          [result.id],
        ),
      );
      expect(row.rows).toEqual([
        { amount, money_movement: "unknown", description: null },
      ]);
    }
  });

  it("validates raw RPC payloads independently of browser or endpoint checks", async () => {
    const before = await counts();
    const { amountCentavos: omitted, ...missingAmount } = payload;
    expect(omitted).toBe("12345");
    const invalid = [
      null,
      [],
      missingAmount,
      { ...payload, extra: "ignored?" },
      ...[null, 100, "", "00", "01", "-1", "1.5", "1e2", "1000000000000"].map(
        (amountCentavos) => ({ ...payload, amountCentavos }),
      ),
      { ...payload, kind: "settlement" },
      { ...payload, kind: null },
      { ...payload, businessDate: "2026-02-30" },
      { ...payload, businessDate: "2026-2-3" },
      { ...payload, businessDate: "1899-12-31" },
      { ...payload, reviewConfirmed: false },
      { ...payload, reviewConfirmed: "true" },
      { ...payload, expectedRevision: 1 },
      { ...payload, version: 2 },
      { ...payload, moneyMovement: "out" },
      { ...payload, kind: "owner_contribution", moneyMovement: "none" },
      { ...payload, description: " " },
      { ...payload, description: "a".repeat(501) },
    ];
    for (const data of invalid) {
      await expect(
        asUser(ownerA, () => accept(businessA, randomUUID(), data)),
      ).rejects.toMatchObject({ code: "22023", message: "VALIDATION_FAILED" });
    }
    expect(await counts()).toEqual(before);
  });

  it("rolls back the record and mutation when audit persistence fails", async () => {
    const before = await counts();
    await db.exec(`
      create function app_private.test_fail_audit() returns trigger language plpgsql as $$
      begin raise exception 'TEST_AUDIT_FAILURE'; end; $$;
      create trigger test_fail_audit before insert on app_private.transaction_revisions
        for each row execute function app_private.test_fail_audit();
    `);
    const op = randomUUID();
    try {
      await expect(
        asUser(ownerA, () => accept(businessA, op)),
      ).rejects.toMatchObject({ message: "TEST_AUDIT_FAILURE" });
      expect(await counts()).toEqual(before);
    } finally {
      await db.exec(
        "drop trigger test_fail_audit on app_private.transaction_revisions; drop function app_private.test_fail_audit();",
      );
    }
    await asUser(ownerA, () => accept(businessA, op));
    expect(await counts()).toEqual({
      records: before.records + 1,
      revisions: before.revisions + 1,
      mutations: before.mutations + 1,
    });
  });

  it("rechecks current ownership when an old accepted command is replayed", async () => {
    await db.query("update public.businesses set owner_id=$1 where id=$2", [
      ownerB,
      businessA2,
    ]);
    await expect(
      asUser(ownerA, () => accept(businessA2, operation)),
    ).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
    await expect(
      asUser(ownerB, () => accept(businessA2, operation)),
    ).rejects.toMatchObject({ code: "P0001", message: "OPERATION_CONFLICT" });
    expect(
      (
        await asUser(ownerA, () =>
          db.query("select id from public.transactions where business_id=$1", [
            businessA2,
          ]),
        )
      ).rows,
    ).toEqual([]);
  });
});
