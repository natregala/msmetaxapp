import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  business = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
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
async function asUser<T>(actor: string | null, action: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor ?? "",
  ]);
  await db.exec("set role authenticated");
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
async function save(id: string, revision: number, payload = values) {
  const result = await db.query<{
    result: { revision: number; values: typeof values };
  }>(
    "select public.save_preparation_profile($1::uuid,$2::uuid,$3::integer,$4::jsonb) as result",
    [business, id, revision, JSON.stringify(payload)],
  );
  return result.rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create schema auth; create schema app_private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.businesses(id uuid primary key,owner_id uuid not null);
    grant usage on schema public,auth,app_private to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    grant select on public.businesses to authenticated;
    insert into auth.users values('${owner}'),('${other}');
    insert into public.businesses values('${business}','${owner}');
  `);
  await db.exec(
    await readFile(
      resolve("supabase/migrations/20261022193930_preparation_profiles.sql"),
      "utf8",
    ),
  );
});
afterAll(async () => {
  await db?.close();
});
describe(
  "versioned preparation profile persistence",
  { concurrent: false },
  () => {
    const first = "22222222-2222-4222-8222-222222222222",
      second = "33333333-3333-4333-8333-333333333333";
    it("preserves unknown monetary evidence and accepts an identical replay once", async () => {
      const accepted = await asUser(owner, () => save(first, 0));
      expect(accepted.values.priorTaxPaymentsCentavos).toBeNull();
      expect(accepted.revision).toBe(1);
      expect(await asUser(owner, () => save(first, 0))).toEqual(accepted);
      expect(
        (
          await db.query(
            "select * from app_private.preparation_profile_revisions",
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("rejects stale writes and incompatible operation reuse; older replay stays original", async () => {
      await expect(
        asUser(owner, () => save(first, 0, { ...values, notes: "different" })),
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(asUser(owner, () => save(second, 0))).rejects.toMatchObject({
        code: "P0001",
      });
      expect(
        (
          await asUser(owner, () =>
            save(second, 1, { ...values, notes: "new evidence reference" }),
          )
        ).revision,
      ).toBe(2);
      expect((await asUser(owner, () => save(first, 0))).revision).toBe(1);
      expect(
        (
          await db.query<{ revision: number }>(
            "select revision from public.preparation_profiles",
          )
        ).rows[0].revision,
      ).toBe(2);
    });
    it("enforces foreign/anonymous authorization and denies direct writes/history reads", async () => {
      for (const actor of [other, null]) {
        expect(
          (
            await asUser(actor, () =>
              db.query("select * from public.preparation_profiles"),
            )
          ).rows,
        ).toEqual([]);
        await expect(asUser(actor, () => save(first, 0))).rejects.toMatchObject(
          { code: "42501" },
        );
      }
      await expect(
        asUser(owner, () =>
          db.query("update public.preparation_profiles set revision=99"),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asUser(owner, () =>
          db.query("select * from app_private.preparation_profile_revisions"),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("rolls back the profile when its required revision cannot be persisted", async () => {
      await db.exec(
        "create function app_private.fail_preparation_revision() returns trigger language plpgsql as $$ begin raise exception 'Synthetic failure'; end $$; create trigger synthetic_failure before insert on app_private.preparation_profile_revisions for each row execute function app_private.fail_preparation_revision();",
      );
      await expect(
        asUser(owner, () => save(crypto.randomUUID(), 2)),
      ).rejects.toThrow("Synthetic failure");
      expect(
        (
          await db.query<{ revision: number }>(
            "select revision from public.preparation_profiles",
          )
        ).rows[0].revision,
      ).toBe(2);
      expect(
        (
          await db.query(
            "select * from app_private.preparation_profile_receipts",
          )
        ).rows,
      ).toHaveLength(2);
      await db.exec(
        "drop trigger synthetic_failure on app_private.preparation_profile_revisions; drop function app_private.fail_preparation_revision();",
      );
    });
    it("rejects raw malformed data without silently substituting zero", async () => {
      for (const payload of [
        { ...values, priorIncomeCentavos: "" },
        { ...values, priorTaxPaymentsCentavos: "001" },
        { ...values, extra: "unsupported" },
        { ...values, year: null },
      ]) {
        await expect(
          asUser(owner, () =>
            save(crypto.randomUUID(), 2, payload as typeof values),
          ),
        ).rejects.toMatchObject({ code: "22023" });
      }
    });
  },
);
