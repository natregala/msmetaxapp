import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const business = "11111111-1111-4111-8111-111111111111",
  foreign = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
async function asUser<T>(user: string | null, run: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}
async function command(
  doc: string,
  revision: number,
  action: string,
  values: unknown,
  op = randomUUID(),
  scope = business,
) {
  const result = await db.query<{
    result: {
      id: string;
      revision: number;
      transaction: { id: string; revision: number } | null;
    };
  }>(
    "select public.document_command($1::uuid,$2::uuid,$3::uuid,$4::integer,$5,$6::jsonb) result",
    [scope, doc, op, revision, action, JSON.stringify(values)],
  );
  return result.rows[0].result;
}
const registration = {
  sourceType: "sales_notebook",
  mimeType: "image/png",
  byteSize: 100,
  sha256: "a".repeat(64),
};
async function uploaded(doc: string, scope = business) {
  await asUser(owner, () =>
    command(doc, 0, "register", registration, randomUUID(), scope),
  );
  await asUser(owner, () =>
    db.query(
      "insert into storage.objects(bucket_id,name) values('notebook-sources',$1)",
      [`${scope}/${doc}/original.png`],
    ),
  );
  return asUser(owner, () =>
    command(doc, 1, "uploaded", {}, randomUUID(), scope),
  );
}
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    page: 1,
    line: 1,
    sourceText: "Synthetic original",
    businessDate: "2026-10-23",
    description: "Synthetic rice",
    amount: "125.50",
    kind: "sale",
    paymentStatus: "unknown",
    uncertainties: [],
    ...overrides,
  };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role anon nologin nosuperuser nobypassrls;create role authenticated nologin nosuperuser nobypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 insert into auth.users(id) values('${owner}'),('${other}');
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
 `);
  const directory = resolve("supabase/migrations");
  for (const file of (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        name <= "20261022195322_document_acceptance_safeguards.sql",
    )
    .sort())
    await db.exec(await readFile(join(directory, file), "utf8"));
  await asUser(owner, () =>
    db.query(
      "select public.create_business($1::uuid,'Synthetic source business')",
      [business],
    ),
  );
  await asUser(other, () =>
    db.query(
      "select public.create_business($1::uuid,'Foreign source business')",
      [foreign],
    ),
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe(
  "private notebook review database workflow",
  { concurrent: false },
  () => {
    it("creates a private limited bucket and authorizes upload/read paths by registered business", async () => {
      expect(
        (
          await db.query(
            "select public,file_size_limit,allowed_mime_types from storage.buckets",
          )
        ).rows,
      ).toEqual([
        {
          public: false,
          file_size_limit: 4194304,
          allowed_mime_types: ["image/jpeg", "image/png"],
        },
      ]);
      const doc = randomUUID();
      await asUser(owner, () => command(doc, 0, "register", registration));
      await expect(
        asUser(other, () =>
          db.query(
            "insert into storage.objects(bucket_id,name) values('notebook-sources',$1)",
            [`${business}/${doc}/original.png`],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asUser(owner, () =>
          db.query(
            "insert into storage.objects(bucket_id,name) values('notebook-sources','unregistered.png')",
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asUser(owner, () => command(doc, 1, "uploaded", {})),
      ).rejects.toMatchObject({ code: "22023", message: "UPLOAD_INCOMPLETE" });
      await asUser(owner, () =>
        db.query(
          "insert into storage.objects(bucket_id,name) values('notebook-sources',$1)",
          [`${business}/${doc}/original.png`],
        ),
      );
      expect(
        (
          await asUser(other, () =>
            db.query("select name from storage.objects"),
          )
        ).rows,
      ).toEqual([]);
      await asUser(owner, () => command(doc, 1, "uploaded", {}));
      await expect(
        asUser(owner, () =>
          db.query("update storage.objects set name='replaced'"),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("retains original extraction separately and never accepts proposed rows automatically", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const proposal = row({ businessDate: "", amount: "" });
      await asUser(owner, () =>
        command(doc, 2, "extracted", {
          rows: [proposal],
          extraction: {
            provider: "synthetic-test-only",
            lines: ["unreadable"],
          },
        }),
      );
      expect(
        (await db.query("select count(*)::int count from public.transactions"))
          .rows,
      ).toEqual([{ count: 0 }]);
      await expect(
        asUser(owner, () =>
          command(doc, 3, "accept", {
            rowId: proposal.id,
            reviewConfirmed: true,
            duplicateReviewed: true,
          }),
        ),
      ).rejects.toMatchObject({ code: "22023" });
      const corrected = {
        ...proposal,
        businessDate: "2026-10-23",
        amount: "12.25",
      };
      await asUser(owner, () =>
        command(doc, 3, "review", { rows: [corrected] }),
      );
      const result = await db.query<{
        original_extraction: unknown;
        proposals: unknown;
      }>(
        "select original_extraction,proposals from public.source_documents where id=$1",
        [doc],
      );
      expect(result.rows[0].original_extraction).toEqual({
        provider: "synthetic-test-only",
        lines: ["unreadable"],
      });
      expect(result.rows[0].proposals).toEqual([corrected]);
    });
    it("atomically accepts explicit reviewed rows, source links, ledger history, and stable replay", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const proposal = row({
        paymentStatus: "paid",
        paymentDate: "2026-10-23",
      });
      await asUser(owner, () =>
        command(doc, 2, "review", { rows: [proposal] }),
      );
      const op = randomUUID(),
        values = {
          rowId: proposal.id,
          reviewConfirmed: true,
          duplicateReviewed: true,
        };
      const accepted = await asUser(owner, () =>
        command(doc, 3, "accept", values, op),
      );
      expect(accepted.transaction).toMatchObject({ revision: 1 });
      const tx = accepted.transaction!.id;
      expect(
        (
          await db.query(
            "select source,amount_centavos::text amount from public.transactions where id=$1",
            [tx],
          )
        ).rows,
      ).toEqual([{ source: "document_review", amount: "12550" }]);
      expect(
        (
          await db.query(
            "select source from app_private.transaction_revisions where transaction_id=$1",
            [tx],
          )
        ).rows,
      ).toEqual([{ source: "document_review" }]);
      expect(
        (
          await db.query(
            "select amount_centavos::text amount from public.transaction_payments where transaction_id=$1",
            [tx],
          )
        ).rows,
      ).toEqual([{ amount: "12550" }]);
      expect(
        (
          await db.query(
            "select document_id::text,row_id::text from public.transaction_sources where transaction_id=$1",
            [tx],
          )
        ).rows,
      ).toEqual([{ document_id: doc, row_id: proposal.id }]);
      await asUser(owner, () =>
        command(doc, 4, "review", { rows: [proposal, row({ line: 2 })] }),
      );
      expect(
        await asUser(owner, () => command(doc, 3, "accept", values, op)),
      ).toEqual(accepted);
      await expect(
        asUser(owner, () => command(doc, 5, "accept", values)),
      ).rejects.toMatchObject({
        code: "P0001",
        message: "ROW_ALREADY_ACCEPTED",
      });
      expect(
        (
          await db.query(
            "select count(*)::int count from public.document_row_acceptances where document_id=$1",
            [doc],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      await expect(
        asUser(owner, () => command(doc, 5, "review", { rows: [] })),
      ).rejects.toMatchObject({
        code: "P0001",
        message: "ACCEPTED_ROW_LOCKED",
      });
    });
    it("keeps partial payments separate and unknown payment genuinely unresolved", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const partial = row({
        paymentStatus: "partial",
        paymentAmount: "25.25",
        paymentDate: "2026-10-24",
      });
      const unknown = row({ line: 2 });
      await asUser(owner, () =>
        command(doc, 2, "review", { rows: [partial, unknown] }),
      );
      const p = await asUser(owner, () =>
        command(doc, 3, "accept", {
          rowId: partial.id,
          reviewConfirmed: true,
          duplicateReviewed: true,
        }),
      );
      const u = await asUser(owner, () =>
        command(doc, 4, "accept", {
          rowId: unknown.id,
          reviewConfirmed: true,
          duplicateReviewed: true,
        }),
      );
      expect(
        (
          await db.query(
            "select amount_centavos::text amount,payment_date::text date from public.transaction_payments where transaction_id=$1",
            [p.transaction!.id],
          )
        ).rows,
      ).toEqual([{ amount: "2525", date: "2026-10-24" }]);
      expect(
        (
          await db.query(
            "select payment_knowledge from public.transactions where id=$1",
            [u.transaction!.id],
          )
        ).rows,
      ).toEqual([{ payment_knowledge: "unknown" }]);
      expect(
        (
          await db.query(
            "select count(*)::int count from public.transaction_payments where transaction_id=$1",
            [u.transaction!.id],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    });
    it("enforces owner/RLS isolation, direct-write denial, and optimistic conflicts", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      await expect(
        asUser(other, () => command(doc, 2, "review", { rows: [] })),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asUser(other, () =>
          db.query("select public.document_read($1::uuid,$2::uuid)", [
            business,
            doc,
          ]),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      expect(
        (
          await asUser(other, () =>
            db.query(
              "select id from public.source_documents where business_id=$1",
              [business],
            ),
          )
        ).rows,
      ).toEqual([]);
      await expect(
        asUser(owner, () =>
          db.query(
            "update public.source_documents set state='review' where id=$1",
            [doc],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asUser(owner, () =>
          db.query("select * from app_private.document_receipts"),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await asUser(owner, () => command(doc, 2, "review", { rows: [row()] }));
      await expect(
        asUser(owner, () => command(doc, 2, "review", { rows: [] })),
      ).rejects.toMatchObject({ code: "P0001", message: "DOCUMENT_CONFLICT" });
      await expect(
        asUser(null, () => command(doc, 3, "review", { rows: [] })),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("rolls back every financial/source write when source acceptance audit fails", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const proposal = row();
      await asUser(owner, () =>
        command(doc, 2, "review", { rows: [proposal] }),
      );
      const before = (
        await db.query("select count(*)::int count from public.transactions")
      ).rows;
      const op = randomUUID();
      await db.exec(
        "create function app_private.test_fail_document_row() returns trigger language plpgsql as $$begin raise exception 'TEST_SOURCE_FAILURE';end$$;create trigger test_fail_document_row before insert on public.document_row_acceptances for each row execute function app_private.test_fail_document_row()",
      );
      try {
        await expect(
          asUser(owner, () =>
            command(
              doc,
              3,
              "accept",
              {
                rowId: proposal.id,
                reviewConfirmed: true,
                duplicateReviewed: true,
              },
              op,
            ),
          ),
        ).rejects.toMatchObject({ message: "TEST_SOURCE_FAILURE" });
        expect(
          (
            await db.query(
              "select count(*)::int count from public.transactions",
            )
          ).rows,
        ).toEqual(before);
        expect(
          (
            await db.query(
              "select operation_id from app_private.ledger_operations where operation_id=$1",
              [op],
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await db.exec(
          "drop trigger test_fail_document_row on public.document_row_acceptances;drop function app_private.test_fail_document_row()",
        );
      }
      expect(
        await asUser(owner, () =>
          command(
            doc,
            3,
            "accept",
            {
              rowId: proposal.id,
              reviewConfirmed: true,
              duplicateReviewed: true,
            },
            op,
          ),
        ),
      ).toMatchObject({ revision: 4 });
    });
    it("surfaces repeated-image and matching-record candidates without deleting legitimate repeats", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const proposal = row({
        paymentStatus: "paid",
        paymentDate: "2026-10-23",
      });
      await asUser(owner, () =>
        command(doc, 2, "review", { rows: [proposal] }),
      );
      const result = await asUser(owner, () =>
        db.query<{
          result: {
            duplicateDocuments: unknown[];
            duplicateRecords: unknown[];
          };
        }>("select public.document_read($1::uuid,$2::uuid) result", [
          business,
          doc,
        ]),
      );
      expect(result.rows[0].result.duplicateDocuments.length).toBeGreaterThan(
        0,
      );
      expect(result.rows[0].result.duplicateRecords.length).toBeGreaterThan(0);
      expect(
        (
          await db.query(
            "select count(*)::int count from public.source_documents where id=$1",
            [doc],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    });
    it("never reuses an earlier raw-ledger create receipt to rewrite existing provenance", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const proposal = row();
      const op = randomUUID();
      const values = {
        businessDate: proposal.businessDate,
        kind: proposal.kind,
        amountCentavos: "12550",
        description: proposal.description,
        paymentStatus: "unknown",
        paymentAmountCentavos: null,
        paymentDate: null,
      };
      const created = await asUser(owner, () =>
        db.query<{ result: { id: string; revision: number } }>(
          "select public.ledger_mutate($1::uuid,$2::uuid,'create',null,0,$3::jsonb) result",
          [business, op, JSON.stringify(values)],
        ),
      );
      const tx = created.rows[0].result.id;
      await asUser(owner, () =>
        db.query(
          "select public.ledger_mutate($1::uuid,$2::uuid,'correct',$3::uuid,1,$4::jsonb)",
          [
            business,
            randomUUID(),
            tx,
            JSON.stringify({
              kind: "sale",
              businessDate: proposal.businessDate,
              amountCentavos: "22550",
              description: proposal.description,
              reason: "Synthetic later correction",
            }),
          ],
        ),
      );
      await asUser(owner, () =>
        command(doc, 2, "review", { rows: [proposal] }),
      );
      await expect(
        asUser(owner, () =>
          command(
            doc,
            3,
            "accept",
            {
              rowId: proposal.id,
              reviewConfirmed: true,
              duplicateReviewed: true,
            },
            op,
          ),
        ),
      ).rejects.toMatchObject({ code: "P0001", message: "OPERATION_CONFLICT" });
      expect(
        (
          await db.query(
            "select source,revision,amount_centavos::text amount from public.transactions where id=$1",
            [tx],
          )
        ).rows,
      ).toEqual([{ source: "manual", revision: 2, amount: "22550" }]);
      expect(
        (
          await db.query(
            "select source from app_private.transaction_revisions where transaction_id=$1 and revision=1",
            [tx],
          )
        ).rows,
      ).toEqual([{ source: "manual" }]);
      expect(
        (
          await db.query(
            "select transaction_id from public.transaction_sources where transaction_id=$1",
            [tx],
          )
        ).rows,
      ).toEqual([]);
    });
    it("requires an explicit full-payment date instead of assuming the business date", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      const proposal = row({ paymentStatus: "paid" });
      await asUser(owner, () =>
        command(doc, 2, "review", { rows: [proposal] }),
      );
      await expect(
        asUser(owner, () =>
          command(doc, 3, "accept", {
            rowId: proposal.id,
            reviewConfirmed: true,
            duplicateReviewed: true,
          }),
        ),
      ).rejects.toMatchObject({ code: "22023" });
      await asUser(owner, () =>
        command(doc, 3, "review", {
          rows: [{ ...proposal, paymentDate: "2026-10-24" }],
        }),
      );
      const result = await asUser(owner, () =>
        command(doc, 4, "accept", {
          rowId: proposal.id,
          reviewConfirmed: true,
          duplicateReviewed: true,
        }),
      );
      expect(
        (
          await db.query(
            "select payment_date::text date from public.transaction_payments where transaction_id=$1",
            [result.transaction!.id],
          )
        ).rows,
      ).toEqual([{ date: "2026-10-24" }]);
    });
    it("rejects invalid source-line locators and preserves a received provider job until explicitly cleared", async () => {
      const doc = randomUUID();
      await uploaded(doc);
      await expect(
        asUser(owner, () =>
          command(doc, 2, "review", { rows: [row({ line: 0 })] }),
        ),
      ).rejects.toMatchObject({ code: "23514" });
      const getJob = (url: string | null) =>
        db.query<{ job: string | null }>(
          "select public.document_provider_job($1::uuid,$2::uuid,$3) job",
          [business, doc, url],
        );
      expect(
        (
          await asUser(owner, () =>
            getJob("https://synthetic.example/job/first"),
          )
        ).rows,
      ).toEqual([{ job: "https://synthetic.example/job/first" }]);
      expect(
        (
          await asUser(owner, () =>
            getJob("https://synthetic.example/job/second"),
          )
        ).rows,
      ).toEqual([{ job: "https://synthetic.example/job/first" }]);
      await expect(asUser(other, () => getJob(""))).rejects.toMatchObject({
        code: "42501",
      });
      expect((await asUser(owner, () => getJob(""))).rows).toEqual([
        { job: null },
      ]);
    });
  },
);
