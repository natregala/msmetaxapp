# Business records verification

This file preserves dated verification runs. Latest: [account-free Vercel demo](demo-deployment.md), with 248 local tests and four published-demo browser journeys passed. The [completion run](#completion-run--23-october-2026) below records the full authenticated application verification before the demo addition.

## Original guided-workflow environment (historical)

- Windows, Node 24.21.0, npm 11.19.0.
- Next.js 16.4.2, React 19.3.1, TypeScript 6.0.3; exact versions in the lockfile.
- Separate user-authorized Supabase project **CSSprint MSME**, Singapore, `ffrrwnoctodgfuravmvg`; public schema inspected empty before migration.
- Both the original record migration and additive guided-business setup migration applied successfully. Generated database types saved under `src/lib/supabase/database.types.ts`.
- Local app at `http://localhost:3000`; no Vercel deployment.
- Two original synthetic confirmed Auth fixtures, plus fresh first-use fixtures for guided setup. Passwords remain in ignored `.env.e2e`; fresh owner IDs/emails are in `.env.guided-e2e`. No email was sent. Clearly named synthetic businesses/records remain in this isolated project.

## Original guided-workflow results

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 129 tests passed across 10 files |
| `npm run build` | Optimized production build passed; all listed app/API routes generated |
| `npm run test:e2e` | 11 Playwright tests passed against the local app and hosted Supabase |
| `npm audit --omit=dev --json` | 0 production dependency vulnerabilities reported |
| Hosted integrity query | At inspection: 18 accepted synthetic records, 18 revisions, 18 receipts; 0 missing revisions; 0 owner/actor mismatches |

The 129-test suite contains 25 embedded PostgreSQL integration tests and 104 rules/storage/client/service tests. Services use an explicitly mocked provider in their unit tests. PostgreSQL transactions and RLS are executed through PGlite with Supabase Auth schema/role fixtures; this is not a full local Supabase stack. PGlite has one connection, so concurrent acceptance was separately tested against hosted Supabase.

The database tests verified close/reopen persistence, exact zero and maximum values, malformed input rejection, two-account/three-business isolation, anonymous/foreign denial, direct-write denial, identical replay, incompatible replay, current authorization before replay, and complete rollback when audit persistence was deliberately failed. The forced failure was confined to the embedded test database.

The additional profile tests verified atomic guided creation, durable setup completion, unspecified legacy activity, owner isolation, forbidden direct mutation, profile revision conflicts, rollback on failed setup receipts, and setup retry after a later rename without reverting it. Financial acceptance was preserved. An initial root test attempt inside the restricted filesystem sandbox aborted PGlite during on-disk reopen; the unchanged complete suite passed outside that sandbox. Assertions were not skipped or weakened.

The hosted HTTP tests verified sign-in with real Supabase Auth, business creation, a record reopened from a separately authenticated session, exact string-centavo values, and concurrent identical requests yielding one record. Cross-business reads and writes were denied at the app endpoint; direct Supabase REST/RPC access independently confirmed RLS and write grants. Malformed amounts, incompatible operation reuse, anonymous requests, and cross-origin writes were rejected.

The eight browser tests verified:

1. A fresh owner at 320×740 followed business name → activity → task, retained answers through back navigation and English/Tagalog changes, chose Later, and returned after reload without repeating setup.
2. At 390×844, sale-entry validation translated, values survived back navigation, the payment question restored automatically after reload, and a reviewed paid sale persisted with exact amount and received-money meaning.
3. Expense wording differed from sale wording, an unpaid expense saved with no movement, and simply opening then leaving a pristine sale form did not block choosing Expense.
4. At 320×740 in Tagalog, partial payment remained a device draft while offline, could not advance or post, and restored after reconnecting. Choosing explicit unknown later saved unknown payment without inventing money movement.
5. At 1440×1000, an actual accepted sale response was dropped. Home resumed the frozen command after reload, and its retry produced one record.
6. Another-tab sign-out preserved unfinished raw amount `12.`; a different account could not see the original owner's business; the original account could resume it.
7. A previously accepted, pending legacy owner-contribution command retained its original kind, amount, and operation ID through the new UI and acknowledged exactly one existing record.
8. A touch-enabled 360px phone context with viewport height reduced to 390px retained reachable controls with at least 44px primary action height and 16px input text. The focused skip link occupied space above the header. Deliberate unsent-draft discard released the task choices, and renaming persisted with profile revision 2.

The third hosted API test independently verified guided setup persistence, owner-isolated profile reads/renames, stale rename rejection, activity validation, and replay-compatible creation after a profile rename. There are three hosted API tests plus eight browser tests in the eleven-test suite.

Screenshots were visually inspected at phone/laptop widths. An initially cramped phone business selector was adjusted into two rows. A fixed skip-link artifact in a full-page capture was corrected. Screenshots are in ignored `test-results/`. These are Chromium viewport tests, not physical-device checks or accessibility certification.

An initial browser run had two test-helper timeouts because it inspected the business controls before their loading completed. The helper was fixed to await the loaded UI, and the complete seven-test suite subsequently passed. No failed check is represented as a success.

## Advisory results and limits

- Supabase security advisor reported no application table exposed without RLS. It reported three informational “RLS enabled, no policy” notices for the private transaction audit/receipt and business-setup receipt tables. These tables intentionally deny client reads/writes and are accessed by controlled private operations.
- Supabase reports **leaked-password protection disabled**, an Auth configuration warning. It was not silently enabled or upgraded. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- The full npm audit reported five high-severity **development-only** entries along the `eslint-config-next → fast-glob → micromatch → braces` dependency chain. `braces` 3.0.3 remains the registry's latest available version checked during this task. The suggested audit fix would downgrade Next's lint configuration to a different major version, so it was not applied. See [the reported braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Production audit reported zero.
- Supabase performance notices listed unused indexes in the newly created database; no production workload conclusions were drawn from them.
- Email confirmation delivery, SMTP, password recovery, real mobile devices, screen readers, owner translation review, and final design approval have not been tested.
- Full offline page reopening has not been implemented. Device draft persistence was tested in a loaded page and after online reload, not as a PWA/offline shell.
- Single-owner business access and create-only financial records are supported. Corrections, voiding, cross-device/offline history merging, linked settlements, documents/OCR, reports, and tax calculations remain outside this slice. Multiple tabs safely retry frozen commands; conflicting unsent-draft writes/discards are rejected by snapshot checks. There is no automatic merge; the owner may keep/export their current draft or deliberately restore the stored draft.

## Implementation documentation consulted

Installed Next.js docs were read for Route Handlers, async cookies, and server data boundaries. Current official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) were checked. Supabase documentation search and its changelog were consulted. The current [TLS cipher change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) affects legacy clients; [Postgres 17.11 notes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) do not require migration work for this new schema's ordinary types/indexes. No tax-specific authority or formula was inferred from these technical sources.

## Folder organization check — 23 October 2026

A separate cleanup grouped current product, design, and development documentation, moved original artwork to assets/brand/, and preserved the original planning pack in a dated archive. Root configuration, application paths, and runtime asset URLs remain unchanged.

During this cleanup, `npm run typecheck` and `npm run lint` passed. The archived installer in `--check` mode verified all 25 bundled file checksums without extracting files. SHA-256 comparisons confirmed that 62 application, test, configuration, runtime-asset, and local credential files were unchanged. The 11 original design, artwork, and archived planning files also retained their bytes; implementation documents were updated for their new paths.

The documentation audit inspected 35 Markdown files outside fenced examples and bundled snapshot payloads: all 95 relative file links resolved, with no stale active references to moved files. Applying the actual .gitignore produced 107 candidate files. Local environment files, synthetic fixtures, dependencies, build output, and test artifacts were excluded; the blank .env.example was included. A literal credential/private-key/JWT marker scan across those candidates found no secrets; two broader password matches were translation labels. This is a bounded scan, not a security certification.

The financial/database/browser suites and hosted checks described above were not rerun for this documentation and folder change. Clean-checkout type generation was not tested. No Git repository was initialized, no commit or push was made, and no hosted database change occurred.

## Completion run — 23 October 2026

Target: Quezon City. Windows, Node v24.21.0 and npm 11.19.0 verified. Existing dependency versions were retained. Baseline checks before behavior changes passed: typecheck, lint, 129 tests/10 files, production build and 11 browser/API tests.

| Final check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 220 tests passed across 27 files |
| `npm run build` | Passed; app/API routes built, including the public offline shell |
| Alternate production build | Passed in ignored .next-offline-check without interrupting the development server |
| Complete production Playwright suite | 21 tests passed, one serial worker, 2.4 minutes, localhost:3001 and actual isolated hosted Supabase |
| `npm audit --omit=dev --json` | Zero production dependency vulnerabilities reported |
| Documentation/source audit | 116 relative links resolved; all inspected text valid UTF-8; 192 candidate files; no literal secret/private-key/JWT markers found |
| Local exclusion audit | All four populated local env files, synthetic SQL, build/dependency/test outputs excluded; blank .env.example included |
| Original archived pack `--check` | All 25 bundled file checksums verified |

The final browser/API suite contains the three original hosted API checks, eight updated original workflow regressions, three setup/recovery/offline checks, one real notebook/Storage journey, one browser quota/navigation check, one hosted lifecycle/concurrency test, and four records/preparation checks. Fixtures remain explicitly synthetic in the separate CSSprint MSME project. A new ignored completion fixture was provisioned without sending email. No real owner documents were used.

Executed coverage includes:

- Interrupted setup and bilingual answer preservation; completed setup not repeated; duplicate-safe business creation.
- Multiple parked drafts, exact unfinished text, a separate new transaction, operation-scoped recovery and deliberate unsent discard.
- Paid/unpaid/partial/unknown entry, later linked payment, remaining-balance validation, correction/void history, linked-payment conflicts and preserved legacy contribution replay.
- Lost real acceptance responses, identical concurrent retries, independent-session persistence, incompatible/stale changes and owner/anonymous/cross-origin/direct-write denial.
- Search past fifty records with 25-row pagination, period reconciliation, snapshot immutability/staleness, actual CSV download and formula neutralization.
- Owner-supplied preparation evidence, unknown versus verified zero, profile revisions, useful printable package and blocked unsupported tax output.
- Actual private JPEG/PNG upload; capture Blob restored after reload; bilingual source/raw-amount preservation; manual row review and partial acceptance; lost upload-finalization and financial-acceptance acknowledgements; one accepted sourced record/payment; foreign authenticated image/review and direct Storage download denied.
- Actual production service-worker offline reopening for an established workspace, device draft creation/reconnection, and no API/recovery responses in CacheStorage.
- Unit/integration checks for unavailable storage, CacheStorage failure preserving online assets, owner changes during queued operations, malformed acknowledgement rejection, rejected-versus-uncertain commands, CAS conflicts, atomic rollback and original-draft migration.

Phone screens at 320/360/390px, touch/reduced-height behavior, laptop screens at 1280/1440px and print layout were exercised. Actual screenshots of setup, resumed entry, multiple drafts, offline Home, recovery, record/payment/history details, notebook review/source and preparation/print were visually inspected. Images remain ignored test artifacts. These are Chromium viewport checks, not physical-phone or screen-reader certification.

After the final runs, a hosted integrity query returned 483 synthetic records, 547 record revisions, 64 payment events, 80 payment revisions, ten source pages and seventeen snapshots. It found zero missing current record revisions, zero missing current payment revisions, zero owner/actor mismatches, zero invalid financial source links and zero overpaid active records. These are inspection-time counts, not user/adoption metrics.

Six additive migrations were tested and applied to ffrrwnoctodgfuravmvg: ledger lifecycle, document review, preparation profiles, owner-movement resolution, document acceptance safeguards and paid-zero preservation. Existing v1 operations remain compatible. Old separately unrecorded payment dates remain null and are excluded from dated cash/period balances until corrected. No database reset or accepted-record hard deletion occurred.

## Failures corrected during this run

The first full production browser run passed 19/20: a legacy helper sent localhost:3000 as Origin while testing localhost:3001. The app correctly returned 403. The helper now uses the configured origin; all twenty tests passed on the complete rerun without weakening authorization.

Initial root edits produced invalid single-byte punctuation in three files; the encoding issue was repaired and all source text passed the final UTF-8 check. An alternate build folder initially entered ESLint's scan; generated build directories are now explicitly excluded, and final lint passed. Independent Playwright processes initially raced over the shared output directory; isolated runs used distinct output paths, and the final complete run was serial.

The restricted filesystem sandbox denied a default Next.js prerender output directory with EPERM. The unchanged default production build passed outside that sandbox. A later complete local test run again hit the known on-disk embedded PostgreSQL reopen restriction; the final unchanged suite passed outside that sandbox (220 tests). No route or assertion was disabled.

A new regression first reproduced paid-zero records changing to unpaid after a description/date correction. An additive function replacement preserves the explicit answer and derives the direction from the corrected kind without inventing a payment event. Tests also confirm that unknown/unpaid zero values remain distinct and linked payments still block an inconsistent reduction to zero.

Final raw-editor checks cover actual IndexedDB quota failure, exact incomplete correction text and preparation evidence, blocked Home/tab/business navigation, restoration after writes resume, scoped memory recovery, late acknowledgements and newer queued-write failure. Both editors avoid autosaving default values after failed initialization.

The first attempt to run the expanded 21-test production suite could not reach a preview server started inside the Windows network sandbox. All failures occurred during initial HTTP connections. The server was restarted outside that sandbox and a real 200 session response was checked before rerunning the unchanged tests. The complete expanded suite passed.

Rendered phone inspection then exposed a history-label issue: a revision containing both dates displayed the business date under the payment-date label. Both dates now render separately with their existing translations. New lifecycle assertions verify business date 2026-10-20 and payment date 2026-10-21; the updated screenshot was inspected. Both production builds, typecheck, lint, all 220 local tests, and the complete 21-test production suite passed again on the final source. The final run is recorded in ignored test-results/final-release-verification.

## Current external dependencies and operational limits

- Live Azure reading was not performed: both required server variables are absent. Provider HTTP tests are mocked; real notebook tests use manual transcription and actual private Storage.
- Confirmation-required/request-success browser branches mock Auth responses. Invalid-link callbacks and server capability validation are tested, but actual signup/recovery email transport, SMTP and recipient delivery are unverified.
- No tax calculation/rule path is validated and no practitioner approval is claimed. The records/preparation package works while tax-specific outputs remain blocked.
- The security advisor reports ten informational no-policy notices on intentionally private RLS-protected audit/receipt tables and the existing leaked-password-protection warning. No exposed application table without RLS was reported. The earlier full development dependency advisory remains documented; only production audit was rerun in this completion pass.
- Physical phone, fluent Tagalog/owner usability, practitioner review, production retention/deletion policy, operator support and managed database/Storage disaster recovery remain outstanding.
- Creating the authorized separate Vercel project returned scope-access 403. No team-authorization action is exposed by the tools, no preview project was created and no deployment URL exists. No production deployment or unrelated-site change occurred.
- No .git repository, commit, push or commit identifier exists. A local production preview was tested at localhost:3001; this is not a hosted deployment.

## Account-free Vercel demo — 23 October 2026

The separate public demo is [cssprint-msme-demo.vercel.app](https://cssprint-msme-demo.vercel.app), deployment dpl_5ZYi2C6qERfAncEL3KmhhgfHp7Gt (READY). It opens without app/Vercel authentication and uses synthetic browser-only state; no real account/data access is bypassed.

Final checks: 248 tests/30 files, typecheck, lint, ordinary build and demo build passed. Three local demo entry/report/reset browser tests and one notebook browser test passed; all four passed again against the public alias in 18.6 seconds. API/Supabase network attempts were blocked and asserted absent throughout those journeys. Anonymous app HTTPS returned 200; direct ledger API returned 503 NOT_CONFIGURED without data. Published phone Home and laptop notebook screenshots were visually inspected.

The full authenticated 21-test hosted/API suite above was not rerun for the client-only demo addition; its server session/business service tests and ordinary HTTP transport are included in the complete local suite, and the normal build passed. No Supabase migration, Git commit/push, real-email delivery, live OCR run, tax filing or real-data release occurred. Full identity, source-bundle hash, limits and failure notes are in [demo deployment](demo-deployment.md).
