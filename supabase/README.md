# Manual entry database contract

## Guided setup and profile names

The additive `guided_business_setup` migration adds nullable `activity`
(`products`, `services`, `both`, `other`), `setup_completed_at`, and a separate
`profile_revision`. Existing businesses are marked complete at their original
creation time; their activity remains null (not supplied). Legacy
`create_business` keeps its original return shape and creates complete profiles
with unspecified activity. Completion describes app setup, not registration.

`create_guided_business(p_business_id uuid, p_name text, p_activity text)` atomically
creates a completed profile and a private immutable creation receipt. It returns
`{id, name, activity, setupCompleted, profileRevision}`. The caller supplies one
stable business UUID and reuses the original name/activity for retries. Changed
creation content produces `OPERATION_CONFLICT` (P0001). Compatible retries after
a later rename return the current profile, preserving the newer revision/name.
Calling guided setup against a legacy-created ID is a conflict, not an implicit
profile migration.

`rename_business(p_business_id uuid, p_name text, p_expected_revision integer)`
updates only the authorized business name and profile revision. It returns the
same profile shape. A stale expected revision produces `PROFILE_CONFLICT`
(P0001); clients should refresh the current profile before resolving the edit.
An unchanged name with the correct revision is a no-op. A rename response lost
in transit may therefore require refreshing before retrying; rename does not
have its own mutation ID. Financial records/revisions are unaffected.

The new operations retain the existing owner-only read policies, revoked direct
table writes, public invoker wrappers and narrowly authorized private functions.
Setup receipts have RLS enabled and no client table grants. Invalid inputs use
`VALIDATION_FAILED` (22023); missing/foreign identity uses the same 42501 codes
as manual entry. Names remain trimmed, 1–100 characters; guided activity is required.

`tests/database/guided-business.test.ts` exercises migration of an existing
profile, disk reopen, setup replay and conflicts, rollback of incomplete setup,
owner isolation, direct-write denial, concurrent-edit revision rejection, and
preservation of financial records through profile rename. It uses embedded
PostgreSQL under the same hosted/concurrent-connection limitations stated below.

This feature is a create-only, single-owner slice. Each business has an explicit
`owner_id`; shared memberships, corrections, voids and settlement links require
later migrations and application flows. Account creation does not register a
business. A transaction is an owner-reviewed record, not a tax result or filing.

## Public operations

`create_business(p_business_id uuid, p_name text)` creates a business for the
current `auth.uid()`. A retry with the same ID and name returns `{id, name}`;
different content conflicts and a foreign owner is denied. Names are trimmed,
1–100 characters. The client generates and preserves the ID for retries.

`accept_manual_transaction(p_business_id uuid, p_operation_id uuid, p_payload jsonb)`
returns `{id, revision: 1}` after all three writes commit: the accepted record,
the original interpretation/audit revision, and the operation receipt. These
parameters never include a client-selected actor. The exact payload is:

```json
{
  "version": 1,
  "businessDate": "2026-10-23",
  "kind": "sale",
  "amountCentavos": "12345",
  "description": null,
  "moneyMovement": "in",
  "reviewConfirmed": true,
  "expectedRevision": 0
}
```

Amounts are canonical integer strings at the write boundary and bounded to
0–999999999999 centavos (PHP). Zero must be entered explicitly; missing amounts
are rejected. `bigint` storage is exact and this bound also fits a JavaScript
safe integer if a direct PostgREST table read returns a number. Applications
serialize money as strings. No floating-point financial arithmetic is needed.

Dates are exact `YYYY-MM-DD`, 1900-01-01 through 2100-12-31. They are business
dates in the business's Asia/Manila calendar, separately from UTC acceptance
timestamps. Description is null or a trimmed string of 1–500 characters.

Kinds are `sale`, `expense`, `owner_contribution`, `owner_withdrawal`,
`loan_received`, `loan_repayment`, `transfer_in`, `transfer_out`. Money movement
is separate: sale permits `in`, `none`, `unknown`; expense permits `out`, `none`,
`unknown`; other kinds permit their named direction or `unknown`. This allows
an unpaid sale to be recorded without treating it as cash received. Existing
balance settlement is unsupported until an obligation-link workflow exists.

SQL rejects invalid raw RPC inputs, including extra fields. Stable errors are
`VALIDATION_FAILED` (22023), `UNAUTHENTICATED` / `FORBIDDEN` (42501), and
`OPERATION_CONFLICT` (P0001). The application should translate these codes and
never expose SQL diagnostics to owners.

## Access and retries

Public business/transaction reads are limited by grants and owner RLS. Direct
table mutation is revoked. Public functions use `SECURITY INVOKER`, delegating
to narrowly scoped functions in the **unexposed** `app_private` schema. Their
`SECURITY DEFINER` behavior is necessary to write protected tables atomically;
each checks current identity and business ownership, validates input, and uses
an empty search path. Do not add `app_private` to exposed API schemas.

Business-scoped operation IDs are serialized with a transaction advisory lock.
After current authorization and validation, exact replays acknowledge the
original record/revision; incompatible content or another original actor is
rejected. A lost HTTP acknowledgement can therefore be retried safely. The
create-only endpoint rejects an expected revision other than zero. There is
no history edit operation or report generator to invalidate in this slice.

Private audit and mutation tables have RLS enabled and no client table grants.
Only the controlled functions write them. No public Storage buckets or file
workflows are created by this migration.

## Verification scope

`npm run test:database` runs the actual migration and SQL functions in PGlite
(embedded PostgreSQL), with two synthetic auth users and three businesses.
The small `auth.uid()` fixture reads the test's request claim. The suite checks
RLS, grants, exact amounts, malformed RPC input, replay semantics, rollback on
audit failure and persistence after closing/reopening the database on disk.
It does not simulate real GoTrue/PostgREST HTTP behavior or independently
concurrent database connections. Hosted verification must be reported separately.

The migration file was created with Supabase CLI 2.121.0. Relevant primary docs
reviewed for this implementation: [database functions](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and
[PGlite](https://pglite.dev/docs/). The September 2026 PostgreSQL 17.11 changelog
requires no extension repair for these new tables/functions, which use no
`ltree`, `pgcrypto`, `btree_gist`, or custom operators.
