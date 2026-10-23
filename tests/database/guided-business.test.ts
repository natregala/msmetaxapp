import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const legacyBusiness = "11111111-1111-4111-8111-111111111111";
const guidedBusiness = "22222222-2222-4222-8222-222222222222";
const otherBusiness = "33333333-3333-4333-8333-333333333333";
type Business = {
  id: string;
  name: string;
  activity: string | null;
  setupCompleted: boolean;
  profileRevision: number;
};
let db: PGlite;
let directory: string;

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

async function create(
  id: string,
  name: string | null,
  activity: string | null,
) {
  const result = await db.query<{ result: Business }>(
    "select public.create_guided_business($1::uuid, $2, $3) as result",
    [id, name, activity],
  );
  return result.rows[0].result;
}

async function rename(
  id: string,
  name: string | null,
  expectedRevision: number | null,
) {
  const result = await db.query<{ result: Business }>(
    "select public.rename_business($1::uuid, $2, $3::integer) as result",
    [id, name, expectedRevision],
  );
  return result.rows[0].result;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "msme-setup-db-"));
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
  expect(files[0]).toContain("manual_transaction_entry");
  await db.exec(await readFile(join(migrationDir, files[0]), "utf8"));
  await asUser(ownerA, () =>
    db.query("select public.create_business($1::uuid, $2)", [
      legacyBusiness,
      "Existing synthetic business",
    ]),
  );
  await db.query(
    "update public.businesses set created_at='2026-10-01T04:05:06Z' where id=$1",
    [legacyBusiness],
  );
  for (const file of files.slice(1))
    await db.exec(await readFile(join(migrationDir, file), "utf8"));
}, 60_000);

afterAll(async () => {
  if (db) await db.close();
  if (
    directory &&
    dirname(resolve(directory)) === resolve(tmpdir()) &&
    basename(directory).startsWith("msme-setup-db-")
  ) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe(
  "guided business setup database boundary",
  { concurrent: false },
  () => {
    it("keeps existing businesses complete without inventing activity", async () => {
      const result = await asUser(ownerA, () =>
        db.query(
          `
      select name, activity, setup_completed_at = created_at as preserved_date,
        setup_completed_at is not null as complete, profile_revision
      from public.businesses where id=$1
    `,
          [legacyBusiness],
        ),
      );
      expect(result.rows).toEqual([
        {
          name: "Existing synthetic business",
          activity: null,
          preserved_date: true,
          complete: true,
          profile_revision: 1,
        },
      ]);
    });

    it("creates a completed profile and compatible replay receipt atomically", async () => {
      const expected: Business = {
        id: guidedBusiness,
        name: "Synthetic guided business",
        activity: "products",
        setupCompleted: true,
        profileRevision: 1,
      };
      expect(
        await asUser(ownerA, () =>
          create(guidedBusiness, expected.name, "products"),
        ),
      ).toEqual(expected);
      expect(
        await asUser(ownerA, () =>
          create(guidedBusiness, expected.name, "products"),
        ),
      ).toEqual(expected);
      const receipts = await db.query(
        "select count(*)::integer as count from app_private.business_setup_receipts where business_id=$1",
        [guidedBusiness],
      );
      expect(receipts.rows).toEqual([{ count: 1 }]);
    });

    it("retains setup completion after closing and reopening the database", async () => {
      await db.close();
      db = new PGlite(directory);
      expect(
        await asUser(ownerA, () =>
          create(guidedBusiness, "Synthetic guided business", "products"),
        ),
      ).toEqual({
        id: guidedBusiness,
        name: "Synthetic guided business",
        activity: "products",
        setupCompleted: true,
        profileRevision: 1,
      });
    });

    it("rejects incompatible setup retries and does not silently upgrade legacy businesses", async () => {
      for (const [name, activity] of [
        ["Different name", "products"],
        ["Synthetic guided business", "services"],
      ]) {
        await expect(
          asUser(ownerA, () => create(guidedBusiness, name, activity)),
        ).rejects.toMatchObject({
          code: "P0001",
          message: "OPERATION_CONFLICT",
        });
      }
      await expect(
        asUser(ownerA, () =>
          create(legacyBusiness, "Existing synthetic business", "products"),
        ),
      ).rejects.toMatchObject({ code: "P0001", message: "OPERATION_CONFLICT" });
    });

    it("permits an authorized rename and rejects a stale profile revision", async () => {
      expect(
        await asUser(ownerA, () =>
          rename(guidedBusiness, "Renamed synthetic business", 1),
        ),
      ).toEqual({
        id: guidedBusiness,
        name: "Renamed synthetic business",
        activity: "products",
        setupCompleted: true,
        profileRevision: 2,
      });
      await expect(
        asUser(ownerA, () => rename(guidedBusiness, "Stale edit", 1)),
      ).rejects.toMatchObject({ code: "P0001", message: "PROFILE_CONFLICT" });
      expect(
        await asUser(ownerA, () =>
          rename(guidedBusiness, "Renamed synthetic business", 2),
        ),
      ).toMatchObject({
        name: "Renamed synthetic business",
        profileRevision: 2,
      });
    });

    it("recognizes the original setup retry after rename without reverting the current profile", async () => {
      expect(
        await asUser(ownerA, () =>
          create(guidedBusiness, "Synthetic guided business", "products"),
        ),
      ).toEqual({
        id: guidedBusiness,
        name: "Renamed synthetic business",
        activity: "products",
        setupCompleted: true,
        profileRevision: 2,
      });
      await expect(
        asUser(ownerA, () =>
          create(guidedBusiness, "Renamed synthetic business", "products"),
        ),
      ).rejects.toMatchObject({ code: "P0001", message: "OPERATION_CONFLICT" });
    });

    it("enforces owner isolation for profile reads, setup replay and rename", async () => {
      await asUser(ownerB, () =>
        create(otherBusiness, "Other synthetic business", "services"),
      );
      const visible = await asUser(ownerB, () =>
        db.query("select id::text, activity from public.businesses"),
      );
      expect(visible.rows).toEqual([
        { id: otherBusiness, activity: "services" },
      ]);
      await expect(
        asUser(ownerB, () =>
          create(guidedBusiness, "Synthetic guided business", "products"),
        ),
      ).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
      await expect(
        asUser(ownerB, () => rename(guidedBusiness, "Unauthorized rename", 2)),
      ).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
      await expect(
        asUser(ownerA, () => rename(otherBusiness, "Unauthorized rename", 1)),
      ).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
    });

    it("denies anonymous calls and direct profile or receipt mutation", async () => {
      await expect(
        asUser(null, () => create(randomUUID(), "No actor", "other")),
      ).rejects.toMatchObject({ code: "42501", message: "UNAUTHENTICATED" });
      await expect(
        asUser(null, () => rename(guidedBusiness, "No actor", 2)),
      ).rejects.toMatchObject({ code: "42501", message: "UNAUTHENTICATED" });
      await asUser(ownerA, async () => {
        await expect(
          db.query(
            "update public.businesses set name='Direct bypass' where id=$1",
            [guidedBusiness],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          db.query(
            "update public.businesses set profile_revision=42 where id=$1",
            [guidedBusiness],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          db.query("select * from app_private.business_setup_receipts"),
        ).rejects.toMatchObject({ code: "42501" });
      });
      await db.exec("set role anon");
      try {
        await expect(
          create(randomUUID(), "Anonymous business", "other"),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          rename(guidedBusiness, "Anonymous rename", 2),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await db.exec("reset role");
      }
    });

    it("validates raw profile inputs without relying on the UI or HTTP service", async () => {
      for (const activity of [null, "", "retail", "Products"]) {
        await expect(
          asUser(ownerA, () => create(randomUUID(), "Valid name", activity)),
        ).rejects.toMatchObject({
          code: "22023",
          message: "VALIDATION_FAILED",
        });
      }
      for (const name of [
        null,
        "",
        " ",
        " Leading",
        "Trailing ",
        "a".repeat(101),
      ]) {
        await expect(
          asUser(ownerA, () => create(randomUUID(), name, "both")),
        ).rejects.toMatchObject({
          code: "22023",
          message: "VALIDATION_FAILED",
        });
        await expect(
          asUser(ownerA, () => rename(guidedBusiness, name, 2)),
        ).rejects.toMatchObject({
          code: "22023",
          message: "VALIDATION_FAILED",
        });
      }
      for (const revision of [null, 0, -1]) {
        await expect(
          asUser(ownerA, () => rename(guidedBusiness, "Valid name", revision)),
        ).rejects.toMatchObject({
          code: "22023",
          message: "VALIDATION_FAILED",
        });
      }
    });

    it("leaves no incomplete business if setup receipt persistence fails", async () => {
      const id = randomUUID();
      await db.exec(`
      create function app_private.test_fail_setup_receipt() returns trigger language plpgsql as $$
      begin raise exception 'TEST_SETUP_FAILURE'; end; $$;
      create trigger test_fail_setup_receipt before insert on app_private.business_setup_receipts
        for each row execute function app_private.test_fail_setup_receipt();
    `);
      try {
        await expect(
          asUser(ownerA, () => create(id, "Atomic setup", "both")),
        ).rejects.toMatchObject({ message: "TEST_SETUP_FAILURE" });
        expect(
          (await db.query("select id from public.businesses where id=$1", [id]))
            .rows,
        ).toEqual([]);
        expect(
          (
            await db.query(
              "select business_id from app_private.business_setup_receipts where business_id=$1",
              [id],
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await db.exec(
          "drop trigger test_fail_setup_receipt on app_private.business_setup_receipts; drop function app_private.test_fail_setup_receipt();",
        );
      }
      expect(
        await asUser(ownerA, () => create(id, "Atomic setup", "both")),
      ).toMatchObject({ setupCompleted: true, profileRevision: 1 });
    });

    it("keeps the legacy create operation compatible and complete with unspecified activity", async () => {
      const id = randomUUID();
      const result = await asUser(ownerA, () =>
        db.query("select public.create_business($1::uuid,$2) as result", [
          id,
          "Legacy client business",
        ]),
      );
      expect(result.rows).toEqual([
        { result: { id, name: "Legacy client business" } },
      ]);
      const profile = await asUser(ownerA, () =>
        db.query(
          "select activity, setup_completed_at is not null as complete, profile_revision from public.businesses where id=$1",
          [id],
        ),
      );
      expect(profile.rows).toEqual([
        { activity: null, complete: true, profile_revision: 1 },
      ]);
    });

    it("changes profile only and preserves financial acceptance and replay identity", async () => {
      const operationId = randomUUID();
      const payload = {
        version: 1,
        businessDate: "2026-10-23",
        kind: "expense",
        amountCentavos: "2580",
        description: null,
        moneyMovement: "out",
        reviewConfirmed: true,
        expectedRevision: 0,
      };
      const accept = () =>
        db.query(
          "select public.accept_manual_transaction($1::uuid,$2::uuid,$3::jsonb) as result",
          [guidedBusiness, operationId, JSON.stringify(payload)],
        );
      const accepted = await asUser(ownerA, accept);
      const before = await asUser(ownerA, () =>
        db.query(
          "select row_to_json(t) as record from public.transactions t where business_id=$1",
          [guidedBusiness],
        ),
      );
      expect(
        await asUser(ownerA, () =>
          rename(guidedBusiness, "Final synthetic name", 2),
        ),
      ).toMatchObject({
        name: "Final synthetic name",
        profileRevision: 3,
        activity: "products",
      });
      const after = await asUser(ownerA, () =>
        db.query(
          "select row_to_json(t) as record from public.transactions t where business_id=$1",
          [guidedBusiness],
        ),
      );
      expect(after.rows).toEqual(before.rows);
      expect((await asUser(ownerA, accept)).rows).toEqual(accepted.rows);
    });
  },
);
