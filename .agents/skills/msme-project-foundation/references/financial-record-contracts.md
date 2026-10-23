# Financial record contracts

Use these conceptual invariants for schema, services, review, and synchronization. They are not implemented schema or tax rules.

## Core records and ownership

| Concept | Required meaning |
| --- | --- |
| Business membership | Establish which authenticated actor may perform which operation for a business. |
| Source document | Private object reference, business, document kind, upload/processing state, and provenance. |
| Extracted proposal | Suggested fields, original extraction, source locator, uncertainty, and unresolved items. |
| Reviewed record | Owner-approved interpretation with source links, exact amounts, business date, classification, and revision. |
| Settlement link | Relationship between a payment and the earlier obligation or sale it settles. |
| Mutation | Stable operation identity, actor, business, payload identity, expected revision, and server outcome. |
| Report draft | Period, coverage, included record revisions, rule version, input evidence, unresolved items, and generation state. |

Enforce business ownership through database policies, grants, constraints, and server checks. Authentication and repository abstractions alone do not establish access rights.

## Meaning and exactness

- Separate transaction meaning from money movement. A customer settling an existing balance must not automatically create another sale. Keep owner contributions, withdrawals, transfers, and loans distinguishable from ordinary operating income or expenses.
- Distinguish cash received/paid, revenue/expenses, accounting profit, and the tax base. Do not relabel a cash balance or simple cash difference as profit or taxable income. Recognition and tax treatment require the applicable verified rules.
- Preserve exact amounts across database, transport, and calculations using integer centavos or fixed-scale decimals. Define currency, rounding, percentage precision, and bounds. Reject invalid amounts.
- Separate business date from recorded-at timestamp. Use Asia/Manila for periods; language changes must not change stored values.
- Represent unknown, not supplied, not applicable, and verified zero distinctly. Never silently replace missing opening balances, prior-period figures, tax payments, or unreadable amounts with zero.

## Independent state dimensions

Define valid transitions for independent dimensions:

| Dimension | Example states |
| --- | --- |
| Extraction | queued, processing, ready, failed |
| Review | needs-review, confirmed, rejected |
| Synchronization | local, pending, synced, failed, conflict |
| Report freshness | draft, needs-review, superseded |
| External filing | not-submitted; later states require actual external evidence |

In this planning contract, review confirmation means the owner has reviewed the interpretation. It can remain local. Authoritative server acceptance requires a successful server write and acknowledged revision; use accepted server revisions for generated reports. Synced images can still need review. Generated reports remain drafts. Display these distinctions in both languages.

## Sources, revisions, and atomic acceptance

Preserve original extraction and corrections separately. Link accepted records to image/page/row locators. Retain manual provenance for manual entries. Provider confidence does not prove correctness.

Record actor, time, previous revision, and the changed interpretation. Handle corrections, voiding, and supersession intentionally. Invalidate or version dependent report drafts when included records or material inputs change.

Accept a record and its required audit/source changes atomically in the database. Check an expected revision within the write operation so concurrent edits cannot silently overwrite one another. Preserve report inputs or an equivalent reproducible snapshot.

## Retry and offline contract

Generate a stable operation identifier before submission and reuse it for retries. Enforce business-scoped uniqueness server-side. Return the existing result for a replay of the same operation; reject reuse of an identifier with incompatible content. Transport retry protection does not detect two photographs of the same real transaction; that requires separate matching and review.

After current authorization and payload validation, resolve a completed operation before applying a new-operation revision check. Its recorded acknowledgement remains valid if the record was subsequently edited. Do not let an old acknowledgement overwrite a newer cached revision; refresh current state separately. Bind queue workers and late responses to the original account/session generation.

Persist local drafts under the correct account and business. Explain pending submissions, storage failures, and conflicts. Use foreground reconnect/open as a dependable retry path. Treat background synchronization as an enhancement. Do not silently erase unsynced work on logout, expose another account's cache, or present local browser storage as a backup.

Bound initial offline behavior to drafts and explicitly supported commands. Cloud OCR and verified report generation require their online dependencies. Decide conflict semantics before enabling broad offline edits to confirmed history.

## Tax-specific output gate

Before implementing any supported tax path, record the current authoritative source, publication/effective dates, relevant tax year, applicable taxpayer conditions, required evidence, form version, reviewed calculation examples, and a named rules owner. A selected profile or uploaded registration document must not stand in for evidence it does not establish.

Keep unsupported and uncertain cases visible. Compute only from accepted inputs and deterministic, versioned rules. Preserve explanations of included and excluded records. Require actual acknowledgment/payment evidence before showing corresponding external states. If validation is incomplete, deliver bookkeeping and preparation support without manufacturing a tax result.

Technical references: [PostgreSQL exact numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html), [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase private Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals). Recheck current documentation when implementing. Tax legislation and formulas are deliberately not supplied here.

## Completion slice — Quezon City, 23 October 2026

The user authorized lifecycle, retrieval, notebook review, preparation, recovery and offline improvements. Current implementation now includes multiple operation-scoped drafts and persisted short setup; separate full/partial/later payments; revisioned corrections/voids and source history; searchable paginated records; exact period summaries and immutable/stale CSV/print snapshots; private notebook capture/manual source review with a configured Azure adapter; separate revisioned preparation evidence with tax calculation blocked; password recovery integration; and a production public offline shell. Unknown legacy payment dates remain null. New additive migrations were tested and applied only to the separately authorized CSSprint MSME project. See docs/development/IMPLEMENTATION_GAP_AUDIT.md and docs/development/verification.md for actual status/evidence.

Quezon City is the selected target city, without selecting the pilot boundary or business segment. Asia/Manila remains the time zone. Live OCR credentials, actual SMTP delivery, tax rules/practitioner validation, physical phone/fluent Tagalog/owner research and operational restore remain external dependencies. A separate Vercel project is authorized but creation was denied by provider scope access; no deployment URL exists. No Git commit/push or destructive database reset was performed.
