# Architecture and code conventions

Status: working architecture recommendation, 22 October 2026. Verify actual repository implementation before asserting conformance.

Implementation update, 23 October 2026: `src/features/{auth,businesses,transactions}` now implement a create-only manual-entry slice. Thin HTTP routes compose named server services and a user-scoped Supabase client. Versioned SQL controls atomic acceptance; client table mutation grants are revoked. Dexie stores one current draft per account/business. Native controls, typed English/Tagalog dictionaries, and React state are deliberately used for this small form; the broader UI/query-library recommendations are not installed yet. See `docs/product/manual-entry.md` for the actual contract and limits, and `docs/development/verification.md` for executed evidence.

## Architecture

Use one maintainable Next.js application organized by business feature. Separate presentation, application workflows, domain rules, and external data/integration details. Keep boundaries lightweight; a small feature need not have four empty folders.

Supabase and Vercel are selected by the user. The working frontend is React, TypeScript, Tailwind, shadcn/ui, next-intl, React Hook Form, and Zod. Use TanStack Query for interactive cloud state when useful, Dexie for durable local drafts, and a tested service worker/PWA setup for explicitly supported offline screens.

Choose installed compatible versions deliberately. Use the existing component family consistently; check current shadcn defaults when creating a new project. Do not switch a working component library solely to match a newer default.

## Feature map

| Module | Owns |
| --- | --- |
| onboarding | Minimum profile, progressive collection, unknown answers, setup state |
| transactions | Record interpretation, manual entry, confirmation, corrections, revisions |
| documents | Private sources, upload/extraction state, proposals, source-linked review |
| reports | Period coverage, summaries, evidence links, reproducible exports |
| tax | Verified profile/rules/form mapping and tax-specific draft calculations |
| shared integrations | Auth/session clients, database clients, exact-money primitives, local-storage infrastructure |

Keep shared code specific. Create cross-feature orchestration services when needed; consume explicit feature operations rather than reaching into another feature's internal queries or UI.

## Suggested layout

Keep app routes thin. Put substantial feature behavior under src/features/<feature>. A transactions feature can contain components/, client/, server/, transaction.schema.ts, transaction.rules.ts, and transaction.types.ts.

Use server/confirm-transaction.ts for the application operation, server/transaction-repository.ts for persistence operations, and transaction.rules.ts for pure decisions. Put shared visual primitives in src/components/ui and application shell composition in src/components/app-shell.

Keep provider clients under src/lib/supabase, local persistence infrastructure under src/lib/offline, locale configuration under src/i18n, messages in reviewed language dictionaries, and migrations under supabase/migrations. Adapt these paths to existing conventions without duplicating equivalent modules.

## Responsibilities and dependencies

- Presentation handles input, layout, translations, and understandable progress/failure.
- Application services coordinate authorization, structural validation, rules, persistence, and results.
- Domain rules accept explicit values and produce deterministic results; avoid React, Next.js, database, provider, locale, and browser dependencies.
- Data-access functions encapsulate persistence contracts and map provider details to application values.
- Integration adapters isolate OCR, file access, and local storage.
- Composition code supplies required dependencies. Introduce interfaces where a real boundary or alternate implementation needs one.

Keep imports acyclic. Enforce server/browser restrictions with framework-supported guards; server/ naming alone is not enforcement. Avoid exporting server-only and client-only modules through a shared barrel that accidentally crosses the boundary.

## Reads and mutations

Let Server Components call authorized server read functions directly. Use the project's HTTP endpoints for interactive client queries and queueable mutations. Keep Route Handlers responsible for the transport; put shared workflow logic in services.

Server Actions are valid when selected consistently, but do not duplicate the same workflow in independent implementations. Do not make a Server Component call its own HTTP endpoint when a direct authorized server read is sufficient.

Use explicit business-scoped permissions. Return minimal display/application data. Validate user-supplied IDs and inputs on the server. Auth and authorized direct Storage uploads can use dedicated browser integrations; financial mutations retain their controlled acceptance boundary.

If a rule must hold for every write, enforce the necessary grants, database constraints, and controlled operation so callers cannot bypass it through the Data API.

## Application contracts

Use stable field names and enum values. Keep display translations outside financial records. Separate business date, UTC event timestamps, period boundaries, and locale.

Use stable error codes with typed field/conflict information. Preserve user input on recoverable errors. Do not expose provider errors, internal SQL, secrets, or unrestricted rows to users.

For a queueable command, define the business, stable operation ID, operation kind, payload version, exact values, and expected record revision where applicable. Return authoritative result/revision or a meaningful rejected/conflict outcome.

An identical retry must return the prior outcome. Reusing an operation ID with different content must not silently succeed. Different operation IDs for the same real-world source require a separate duplicate-review process.

## State ownership

| State | Owner |
| --- | --- |
| Current input and field feedback | Form state |
| Fetched cloud records | Server read/query layer |
| Durable unsent drafts and pending commands | Local database |
| Accepted authoritative records and revisions | Postgres |
| Interface language | Preference plus translation configuration |
| Document extraction progress | Explicit processing record |
| Report output | Snapshot or reproducible record/rule revision references |

Reconcile local drafts and query caches explicitly after server acknowledgement. Do not treat optimistic display as durable server acceptance. Keep review, sync, processing, and report freshness separate.

## Integrity and verification

Use exact money with bounds and deliberate rounding. Keep domain calculations deterministic. Preserve provenance, revisions, report invalidation, and missing values.

Perform related acceptance/history/idempotency changes atomically in the database. Check expected revisions at write time. Inspect authorization and ownership again at reachable boundaries.

Use strict TypeScript and runtime schemas appropriately; static types do not validate untrusted input. Keep focused tests near rules. Verify important persistence, access, and recovery behavior through the real boundaries. Discover actual package commands; none are established by this pack.

## Sources

- Next.js project organization: https://nextjs.org/docs/app/getting-started/project-structure
- Next.js data security: https://nextjs.org/docs/app/guides/data-security
- Next.js backend guidance: https://nextjs.org/docs/app/guides/backend-for-frontend
- Service Layer: https://martinfowler.com/eaaCatalog/serviceLayer.html
- Presentation/domain/data separation: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
- PostgreSQL transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html

This is a project recommendation informed by these sources, not a claim that the sources prescribe this exact folder structure.


## Guided owner-workflow implementation — 23 October 2026

The user authorized the docs/design/UX_REDESIGN_BRIEF.md redesign and explicitly prioritized mobile use. The app now separates a short business name/activity/task setup, a returning-owner task home, and guided sale/expense amount-payment-review flows. English/Tagalog, exact values, owner isolation, legacy drafts, and duplicate-safe acceptance are retained. Setup completion and selected activity are stored independently of tax readiness. Existing businesses stay complete with activity unspecified when unknown. Names can be changed through an authorized profile-revision check.

Device drafts now autosave with account/business scope and expected-snapshot conflict detection. Part payments remain draft-only; unpaid and unknown payment retain their distinct meanings. The user must explicitly retry pending account saves. Last-business preference stores only an account-scoped UUID and is revalidated against owned businesses.

docs/design/STYLES.md guides the provisional visual design. No photo/OCR, tax calculation, service worker/offline reopening, physical-device validation, owner usability findings, or Vercel deployment is claimed. See docs/product/guided-workflows.md and docs/development/verification.md for actual contracts and executed checks. The exported docs/archive/project-pack-2026-10-22/MSME_PROJECT_PACK.md remains its original snapshot.

## Completion slice — Quezon City, 23 October 2026

The user authorized lifecycle, retrieval, notebook review, preparation, recovery and offline improvements. Current implementation now includes multiple operation-scoped drafts and persisted short setup; separate full/partial/later payments; revisioned corrections/voids and source history; searchable paginated records; exact period summaries and immutable/stale CSV/print snapshots; private notebook capture/manual source review with a configured Azure adapter; separate revisioned preparation evidence with tax calculation blocked; password recovery integration; and a production public offline shell. Unknown legacy payment dates remain null. New additive migrations were tested and applied only to the separately authorized CSSprint MSME project. See docs/development/IMPLEMENTATION_GAP_AUDIT.md and docs/development/verification.md for actual status/evidence.

Quezon City is the selected target city, without selecting the pilot boundary or business segment. Asia/Manila remains the time zone. Live OCR credentials, actual SMTP delivery, tax rules/practitioner validation, physical phone/fluent Tagalog/owner research and operational restore remain external dependencies. A separate Vercel project is authorized but creation was denied by provider scope access; no deployment URL exists. No Git commit/push or destructive database reset was performed.

## Public account-free demo — 23 October 2026

The user explicitly requested a shareable Vercel demo without accounts. A separate browser-only simulation now uses the existing UI behind NEXT_PUBLIC_DEMO_MODE=true. It seeds synthetic Quezon City records, keeps demo records/photos in a separate IndexedDB database, rotates the synthetic owner/business on reset, and labels saves/exports as simulated and browser-local. It does not bypass the real application Auth/RLS or expose the real financial database. Normal authenticated behavior remains the default when the flag is false.

Published and verified: https://cssprint-msme-demo.vercel.app (separate project cssprint-msme-demo, prj_E3uprIXsokq8Y6b6Ybf868pXQjyQ; deployment dpl_5ZYi2C6qERfAncEL3KmhhgfHp7Gt READY). The connector default scope allowed creation/deployment; earlier explicit-scope creation and build-log inspection were denied. No Git commit/push or Supabase migration was performed. Actual evidence and demo limits are in docs/development/demo-deployment.md: 248 local tests, builds/type/lint and four public browser journeys passed. Live OCR, real email, tax validation and human/device review remain separate dependencies.
