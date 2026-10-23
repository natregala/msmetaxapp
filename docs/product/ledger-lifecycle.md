# Record maintenance, linked payments, and period snapshots

Implemented as an additive extension to the original manual-entry contract. The pilot target is Quezon City; Asia/Manila remains the business-date time zone. This is record organization and reviewable preparation support, not a tax calculation or filing system.

## Financial records and revisions

Accepted records have independent active/void status, revision, and payment knowledge. Corrections preserve the original revision, actor, time, source reference, subsequent interpretations, and a required reason. No accepted record is hard-deleted.

Every mutation includes a business, stable operation UUID, action, expected record revision, and action-specific values. The database checks the current owner, serializes the business operation, resolves an identical completed receipt before checking the current revision, and commits the record/payment changes, revisions, and receipt together. Incompatible operation reuse and new stale changes conflict.

Voiding a record with active linked payments is blocked. The owner must first correct or void those payment events with their own reasons. Reducing the record below active payments, changing its kind while active payments exist, or moving its date after a linked payment is also blocked. Unsupported refunds, credits, and overpayments are not invented.

## Linked payments

A sale or expense remains one original record. Full, partial, and later payments are separate events with exact amount, payment date, actor, revision, and status. Adding a settlement does not create another sale/expense.

Partial initial payments require a positive amount less than the record amount. Later payments cannot exceed the remaining balance. Payment dates cannot precede the original business date. Payment corrections and voids update the parent record revision and retain payment history.

Unknown payment knowledge is distinct from known zero paid. An owner must explicitly clarify unknown prior payment information before adding a later payment. The explanation is recorded in history. Known current balances include active payment events; they are never inferred from unknown payment answers.

Explicit zero records are allowed. A zero paid/unpaid/unknown answer is preserved and no zero-value payment event is invented. Individual amounts remain bounded to 999999999999 centavos. Aggregate totals are unbounded exact integer strings within the database query's record limit, formatted without floating-point conversion.

Contributions and withdrawals retain their separate meanings. An unknown contribution/withdrawal can be clarified by confirming its full movement amount and date; this atomically records that movement and marks its payment knowledge known. It does not add partial owner funding or an owner receivable. Existing loans and transfers remain readable without adding a loan-servicing or transfer-management workflow. Mistaken existing payment events can be corrected/voided; new later partial settlement entry is limited to sales and expenses.

## Legacy payment dates

Version-one entries recorded the business date and movement meaning, but no separate payment date. Known received/paid amounts are migrated into linked events with **payment date unknown**, retaining `legacy_date_unknown` provenance. The original business date is not silently reused as a payment date.

These events remain part of known current paid balances. They are excluded from dated cash totals and from period outstanding-balance calculations until the owner supplies a date through an audited payment correction. The report includes an undated-payment warning/count. The Needs attention filter finds both unknown-payment records and records with active undated payments.

## Retrieval

The records API supports business-event date range, type, payment/attention, active/void status, literal description search, and 25-row pages. It is independent of Home's latest-record limit. Business dates are separate from recording timestamps. Details expose record revision history, linked payments and their history, and available document/row source references.

Home's existing recent-record endpoint excludes voided records and returns the current record revisions. The original version-one create command and its immutable receipt remain replay-compatible.

## Period totals and exports

Summaries use accepted server records only:

- Recorded sales/expenses use business-event dates.
- Known money received/paid uses confirmed payment-event dates, including settlements of records from an earlier period.
- Receivable/payable totals cover known-payment sales/expenses dated in the selected period, with payments through the period end. Records with undated payments are excluded from these period balances.
- Unknown information and voided items are counted or explicitly excluded, rather than converted into complete financial information.
- Contributions, withdrawals, loans, and transfers affect known money movement where appropriate but are not counted as sales/expenses.

These totals are not accounting profit, taxable income, or tax due. Report coverage explains missing opening balances, date uncertainty, current record balances versus period-end calculations, and other exclusions.

A report operation preserves an immutable snapshot of included records/revisions, payment events/revisions, exact totals, coverage, generation time, and optional saved preparation evidence. A later financial change marks the saved snapshot stale; changes to included preparation profile evidence also make it stale. A stale snapshot retains its original contents and requires regeneration/review.

CSV output is authorized, private, uncached, exact, and quotes every cell. Formula-like text (including leading whitespace before spreadsheet formula markers) is neutralized. The CSV contains period information, totals, versioned record references, payment dates, source links, limitations, and freshness. Printable presentation uses that same immutable snapshot.

Snapshots currently cap a single report at 10,000 relevant records and reject larger periods instead of silently truncating. Staleness conservatively tracks any financial/source change in that business, including changes outside the report period. An already downloaded file cannot notify its reader about future changes; reopen its snapshot in the app to check freshness.

## Boundary operations

| Endpoint | Operation |
| --- | --- |
| GET /api/ledger | Search/filter/paginate accepted records |
| POST /api/ledger | Reviewed create, correction, void, payment mutation, or payment clarification |
| GET /api/ledger/records/:id | Authorized detail, payments, history, source reference |
| GET /api/ledger/summary | Deterministic selected-period summary |
| POST /api/ledger/snapshots | Idempotent immutable report/preparation snapshot |
| GET /api/ledger/snapshots/:id | Snapshot with current freshness |
| GET /api/ledger/export | CSV from a specified authorized snapshot |

Mutations require same-origin JSON and authenticated ownership. Direct financial/payment writes remain revoked. Private audit tables and helper functions remain unavailable to client roles. Public invoker wrappers delegate only to narrowly authorized private operations with empty search paths.

## Verification scope

The focused PostgreSQL suite executes the migration, actual controlled functions, grants and RLS through PGlite. It covers legacy migration/date uncertainty, explicit zero, partial/later settlement, overpayment/date rejection, unknown clarification, correction/void/history, expected-revision conflicts, replay after later revisions, period date boundaries, immutable/stale snapshots, preparation-evidence changes, search past fifty records, foreign/anonymous/direct-write denial, private-helper denial, and rollback after a forced receipt failure.

Pure/schema tests cover exact aggregate formatting, malformed amount rejection, CSV quoting/formula neutralization, and snapshot/payment export details. These embedded tests are not a substitute for hosted HTTP/concurrency or browser verification; those results must be recorded separately.

During implementation, 32 focused tests passed across the ledger PostgreSQL suite (17), exact export/schema suite (4), and existing transaction service suite (11). TypeScript and scoped ESLint checks also passed. A separate hosted API Playwright test passed against localhost:3000 and the isolated CSSprint MSME project: partial/later payments, three concurrent identical retries, independent-session persistence, competing corrections, replay after a later revision, immutable/stale reports, formula-safe CSV, foreign-owner endpoint and direct-database denial, payment voids, record void, and recalculated totals. It retained one clearly labeled synthetic business with a voided synthetic record as evidence. This API check is not physical-device or owner usability testing.

The implementation follows current official [Supabase database-function security](https://supabase.com/docs/guides/database/functions) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), consulted during implementation.
