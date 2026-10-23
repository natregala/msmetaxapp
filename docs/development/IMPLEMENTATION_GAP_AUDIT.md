# Implementation gap resolution — Quezon City

Updated 23 October 2026 (Asia/Manila). The user supplied the completion requirements, then explicitly selected **Quezon City** instead of Manila. Exact pilot boundary and first business segment remain research decisions. Asia/Manila remains the business timezone.

No earlier IMPLEMENTATION_GAP_AUDIT.md existed in the inspected project. This records the supplied requirements and actual work rather than inventing an earlier audit.

## Baseline and preservation

Before behavior changes, typecheck, lint, 129 tests/10 files, production build, and 11 browser/API tests passed. Existing feature architecture, original operation identities, accepted records, source snapshots and local credentials were retained. The folder has no Git repository, so tracked/uncommitted status does not yet apply. No Git initialization, commit, push, reset or destructive database operation occurred.

## Resolution matrix

| ID / requirement | Baseline classification | Current resolution and evidence |
| --- | --- | --- |
| S1 Short bilingual setup | Already implemented and verified | Preserved; transaction and setup browser regressions |
| S2 Interrupted setup | Needs implementation | Account-scoped local setup, CAS revisions, frozen create identity, latest-snapshot draining and navigation/visibility flush; setup-drafts unit + completion/recovery browser |
| S3 Task-focused Home | Already implemented, gaps remained | Multiple drafts no longer block new work; Records, summaries, preparation, notebook and secondary owner-money actions mounted |
| S4 Phone/laptop accessibility | Implemented but partially unverified | Viewport/touch/reduced-height/focus/skip-link/print checks and screenshot inspection performed; physical phone and screen-reader review remain external |
| F1 Corrections and voids | Needs implementation | Atomic reasoned revisions, expected-version conflicts, source/history retention, linked-payment safeguards; ledger database + hosted API/browser tests |
| F2 Partial/later payments | Needs implementation | Separate dated events, exact remaining-balance checks, payment correction/void, no duplicate sale/expense; PostgreSQL + concurrent hosted tests |
| F3 Unknown payment follow-up | Needs implementation | Clarification and Needs attention; unknown never silently becomes unpaid/paid. Legacy missing payment dates stay null and excluded from dated totals |
| F4 Owner money/legacy kinds | Needs implementation | Contribution/withdrawal journeys and full movement follow-up; loan/transfer meanings preserved without servicing product |
| F5 Amount/date behavior | Already implemented, extend verification | Exact centavos, client/server validation, raw incomplete draft text, zero/large/future/historical review; financial rules + UI tests; paid-zero correction regression preserves explicit status |
| D1 Multiple parked drafts | Needs implementation | Versioned migration retains v1 entries; operation-scoped list/resume/discard, per-draft CAS and pending immutability; multiple-draft/storage/browser tests |
| D2 Uncertain submissions | Already implemented for v1 | v1/v2 and maintenance reviewed commands persist before send; owner rechecks, acknowledgement validation, foreground resume/reconnect; tests cover loss, replay and account races |
| D3 Readable conflict recovery | Needs implementation | Side-by-side values and explicit safe choices; optional JSON fallback; rejected validation can reopen, uncertain requests remain frozen |
| R1 Full records retrieval | Needs implementation | Business-date/type/payment/status/description filters, details/history/source/payment links and 25-row pagination beyond fifty; hosted/browser tests |
| R2 Period summaries | Needs implementation | Exact accepted sales/expenses, dated received/paid, known balances and unresolved/exclusion counts; period boundaries reconcile in SQL/HTTP tests |
| R3 CSV/print snapshots | Needs implementation | Authorized immutable versioned snapshots, spreadsheet-safe CSV, readable print, profile/source staleness and last-report recovery; database/API/download/print tests |
| N1 Capture/private sources | Needs implementation | JPEG/PNG preview/retake, private immutable Storage, fingerprint/signature checks, scoped Blob/review recovery; actual Storage upload/private denial browser checks |
| N2 Real automatic extraction | Depends on external credentials/evaluation | Server Azure adapter and tests implemented; required credentials absent. No live OCR or accuracy claim. Manual review remains functional |
| N3 Source row review | Needs implementation | Add/correct/remove proposals, duplicate candidates, explicit review, atomic per-row acceptance and immutable source refs; lost upload/acceptance acknowledgements and foreign denial tested |
| N4 Acceptance provenance | Needs implementation | Additive safeguard prevents a notebook row from reusing an older manual acceptance or rewriting its history; SQL regression and hosted notebook check |
| P1 Separate evidence collection | Needs implementation | Revisioned owner-supplied profile, year/period, earlier figures, verified zero versus null, missing list; preparation SQL/unit/browser checks |
| P2 Supported tax calculation | Depends on applicable rules/evidence/review | Tax output is deliberately blocked; no verified rule set or practitioner approval exists. Useful records/preparation package works |
| A1 Confirmation and recovery | Implemented but unverified / needs implementation | Confirmation-required UI, browser-bound code callback, recovery request/update and invalid/expired paths implemented; server unit/UI checks. Actual email transport unverified |
| A2 Sessions/account isolation | Already implemented; broaden checks | Verified identity, immediate cross-tab privacy hide, original-owner memory recovery and per-send queue checks; unit, database and browser evidence |
| O1 Offline reopening | Needs implementation | Production public shell and static-only caching; established workspace reopened offline, raw draft survived reconnection; actual service-worker browser + cache-failure tests |
| O2 Storage failures | Needs implementation | Truthful unsaved status, guarded navigation (including correction/preparation), original-owner memory recovery while open, failed-initialization and queued-write safeguards, best-effort CacheStorage; unit and real browser quota checks |
| Q1 Automated verification | Already implemented; extend | Existing suites retained and expanded; see current verification record for final command counts |
| Q2 External validation | Depends on participants/access | Physical phone, fluent Tagalog, owner usability, representative notebook samples and practitioner review outstanding |
| Q3 Operations | Depends on operator decisions/access | Retention/deletion/support/cost/backup procedures documented; managed DB/Storage restore and live SMTP untested |
| V1 Preview deployment | Depends on provider access | Separate account-free browser demo published and verified on Vercel; four public browser journeys pass. Real authenticated cloud flow is not deployed/verified there. See demo-deployment.md |
| V2 Git and repository | Intentionally deferred to requested publishing step | State inspected; no .git, commit or push. Secrets, synthetic SQL, artifacts and build output ignored |
| X1 Excluded expansion | Intentionally outside agreed scope | No inventory, payroll, invoicing, staff collaboration, broad tax coverage, live filing/payment, subscriptions or invented pricing |

## Evidence locations

- [Current verification](verification.md): actual command runs, environments, screen inspection and remaining limits.
- [Ledger lifecycle](../product/ledger-lifecycle.md): financial meaning, migrations, summary coverage and API contracts.
- [Records/preparation](../product/records-and-preparation.md): owner workflows and evidence package.
- [Notebook review](../product/notebook-review.md): layout/provider bounds, privacy and source acceptance.
- [Migration notes](migration-notes.md) and [operations](operations.md): applied additions and honest readiness limits.

The final verification record supersedes intermediate counts from targeted runs. Fresh synthetic confirmed fixtures do not establish real sign-up email delivery. Mocked provider tests do not establish live extraction or practitioner approval. A successful build alone is not owner validation.
