# Acceptance and demonstration reference

## Current status

This proposed plan establishes no implemented application, deployment, test result, user finding, extraction accuracy, or tax validation. Record actual outcomes during implementation.

Verify changed workflows, financial rules, persistence, authorization, and recovery. Expand testing only for concrete uncertainty or an existing gate.

## Acceptance matrix

| Area | Scenario | Required observable outcome |
| --- | --- | --- |
| Complete owner task | Capture a source, review fields, confirm, reopen the record | Correct persisted values, source linkage, and honest status are visible |
| Language preservation | Switch English / Tagalog during editing and after a field error | Values, attachment, step, and work survive; displayed feedback follows the selected language |
| Responsive use | Perform the same task on representative phone and laptop browsers | Controls remain usable; amounts and source evidence remain readable |
| Extraction review | Process a page containing ambiguous handwriting, multiple rows, and totals | Uncertainty and proposed rows remain reviewable; extraction alone does not confirm records |
| Missing information | Omit a required amount, date, classification, or period input | The app identifies the gap; unknown values do not silently become zero |
| Exact calculations | Run independently established calculation fixtures and rounding boundaries | Results match the documented rule, currency precision, period, and rule version |
| Atomic confirmation | Fail persistence during confirmation or its required history write | Required related changes succeed together or leave no partial confirmed state |
| Account isolation | Account B requests account A's record, document, or cached view | Database, file access, server endpoint, and local view each enforce the intended access model |
| Private uploads | Interrupt upload; request a private document without authorization | Progress and retry are honest; unauthorized document access fails |
| Offline drafts | After setup while connected, disconnect, save a draft, and reopen supported offline screens | The draft remains available on that device; cloud receipt is not claimed |
| Safe retry | Lose the server acknowledgement and retry the same queued operation | The stable operation identifier produces one accepted operation and an understandable result |
| Edit conflict | Submit an edit based on an older record version | The app detects the conflict and offers an explicit resolution; it does not silently overwrite newer financial data |
| Replay after later edit | Retry an already committed operation after another edit advances the record | The original operation is acknowledged once; its older result cannot overwrite the newer revision |
| Account switch in flight | Change accounts while the original queue has an outstanding request | No command is sent with the new account's credentials; late responses cannot contaminate its visible data |
| Stale report | Correct a record included in an existing report | The report is invalidated or clearly marked stale; regeneration uses the intended versions |
| Session and logout | Let a session expire or change accounts with pending local work | Cloud operations reauthorize; pending work is not silently erased or shown to another account |
| Report eligibility | Request a draft with unsupported or incomplete tax-profile evidence | Records remain usable; the unsupported calculation is gated with a precise explanation |

Test transport retries separately from photographing the same real-world entry twice. Operation identifiers solve retry duplication; source matching and owner review address duplicate business records.

Treat background synchronization as an enhancement. The dependable path retries when the application is open and connectivity actually permits requests. Handle local storage failure visibly; never claim a draft was saved when the write failed.

## Test evidence

Record date, build, environment, device/browser, fixture, expected and actual results, and unresolved issues. Distinguish automated checks from manual observations. Avoid logging sensitive identifiers.

Keep rule tests nearby. Use integration checks for authorization, atomic operations, retries, and storage. Exercise a few complete owner tasks. Select tools against the repository; never invent commands or test results.

## Demonstration environment

- Use labeled synthetic businesses and documents with realistic relationships.
- Provide a repeatable reset that affects only the demonstration environment.
- Verify the actual shared URL on an external browser session and a phone. Check deployment protection, application sign-in, redirects, and email delivery if used; use authorized access rather than bypassing protection.
- Separate preview, demo, and real-user resources; verify each deployment's configuration.
- Demonstrate working capture, correction, persistence, language switching, and one recovery case.
- Apply existing authorization to deployment or sharing work. Complete concrete preparation before any genuinely required final approval; do not invent recurring permission gates.

## User validation and hackathon evidence

Measure task completion, entry/correction time, unresolved extraction errors, help requests, and lost work. Define baselines and samples before reporting improvements.

The supplied guidelines require new work, a clearly identified Filipino MSME user and pain point, meaningful problem solving, and a justified role for AI. Public APIs and open-source resources are allowed; previously developed applications or prior entries are excluded. Preserve development history and disclose reused libraries accurately.

The supplied GitHub repository and initial README deadline is **8:00 PM sharp**; verify the event date and timezone before scheduling. Do not impose a three-day architecture constraint. Cover the target problem, demonstrated workflow, setup, limitations, evidence, and AI purpose in the README.

## Primary implementation references

- [Next.js data security](https://nextjs.org/docs/app/guides/data-security)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [Browser storage persistence](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Background Sync compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
