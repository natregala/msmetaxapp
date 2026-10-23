# Project context: Filipino MSME bookkeeping and preparation support

Status: planning baseline, 22 October 2026. This records intent, not completed research or verified implementations.

## Instruction and evidence priority

Follow current user and repository instructions. Distinguish confirmed choices, proposed scope, findings, and unresolved assumptions. Never report planned tests as completed results.

## Confirmed user priorities

- Address a specific practical problem faced by Filipino MSMEs through a meaningful digital workflow.
- Deliver a web application, with phone usability as the primary design concern and a comfortable laptop experience.
- Make English and Tagalog readily selectable. Preserve the current task and unfinished input when switching languages.
- Use Supabase and Vercel as the platform foundation.
- Prioritize readable, maintainable code, professional financial workflows, and a dependable hosted demonstration.
- Choose architecture on product merits. The user explicitly removed the three-day constraint from technology selection.
- Leave visual direction open. The user is researching website appearance; brand, palette, typography, detailed layouts, illustrations, and reference designs are not approved yet. Functional work can proceed with clearly provisional, accessible styling.

## Current implementation baseline

Update, 23 October 2026: the first manual transaction entry slice is implemented in this repository. It includes owner-only businesses, Supabase Auth, reviewed create-only records, atomic revision/retry receipts, scoped device drafts, and English/Tagalog UI. The user authorized a separate Supabase project, `CSSprint MSME`, in the `jim-mo` organization / Singapore; the other connected website's project was not changed. See `README.md`, `docs/product/manual-entry.md`, and `docs/development/verification.md` for scope and actual check results. No Vercel deployment, OCR, tax engine, correction workflow, or fully offline app shell has been implemented. The product name and final design remain open; `docs/design/STYLES.md` guides provisional UI and supplied folder artwork.

The implementation currently uses Next.js/React/TypeScript, Zod, Supabase SSR, and Dexie, with native controls, typed language dictionaries, and React form state. The fuller library choices below remain recommendations for later needs, not installed functionality.

Proposed implementation baseline: Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, next-intl, React Hook Form, Zod, Supabase Postgres/Auth/private Storage, and Vercel. Use a feature-based modular monolith, thin entry points, named application services, pure financial rules, and focused data-access functions.

TanStack Query serves cloud data; Dexie stores offline drafts; a service worker supplies offline assets. OCR provider, sign-in method, versions, and broader synchronization remain open. Inspect repository dependencies before changing them.

## Problem and proposed initial user

Working hypothesis: owners spend avoidable effort reconstructing handwritten records for bookkeeping and period preparation. Proposed value: source-linked review, continued recording, and explainable preparation output. Validate through observation and comparison with existing tools.

The supplied ideation README proposes an already registered, non-VAT individual sole proprietor with handwritten records and one verifiable tax path. An appropriately verified current-year 8% path and a quarterly preparation workflow are candidates, not universal defaults or approved tax logic. The exact business activity, community, representative notebook layouts, and self-service versus assisted use remain to be selected through research. Unknown or unsupported tax situations can still use appropriate record organization; gate automated tax calculations separately.

## Complete useful workflow

1. Collect language preference, the minimum account information, and enough business context to understand the task. Offer an explicit unknown answer where relevant.
2. Establish reporting period, record coverage, starting date, and available opening/prior-period information. Preserve gaps.
3. Accept a manually entered record or a clearly identified document type: sales notebook, expense list, invoice, or customer-credit record.
4. Upload authorized images privately. Extract proposed fields with links to their source rows. Retain unresolved values.
5. Let the owner inspect, correct, classify, and resolve suspected duplicates before confirming monetary records.
6. Continue daily entry. Distinguish local persistence from successful server submission, and reviewed status from synchronization status.
7. Review the period for missing information, unconfirmed records, duplicates, and inconsistent classifications.
8. Produce traceable summaries. Generate a tax-specific draft only after the applicable profile, rules, inputs, and calculation path are verified. Otherwise provide a preparation checklist and reviewed-record export.
9. Provide optional contextual explanations with applicable sources and uncertainty. Keep arithmetic deterministic and acceptance of records under explicit control.

## Product boundaries

Account creation does not register a business. Preparing a draft does not establish submission, acknowledgment, payment, or legal compliance. Do not label digital imports as official registered books, instruct owners to discard originals, or imply that a complete screen proves regulatory compliance. Treat tax and accounting-system requirements as research and validation responsibilities before making external claims.

Collect identifiers only when a supported operation needs them. Avoid collecting identity documents, credentials, or detailed addresses simply to enter a transaction. Explain external image processing, minimize provider payloads, and use synthetic or appropriately permissioned/redacted demonstration data.

## Hackathon constraints supplied by the user

- Previously developed applications, thesis/academic projects, commercial products, and earlier hackathon entries are not accepted.
- Avoid undemonstrable hardware-heavy work, informational-only sites, unjustified AI integration, and an undefined user or pain point.
- Languages, frameworks, open-source libraries, public APIs, and similar resources are permitted. AI development assistance is permitted.
- The GitHub repository and initial README must be submitted by **8:00 PM sharp**. The supplied instruction does not establish the event date; verify it before scheduling.

Keep the application original; document dependency and sample-data provenance.

## Open research and success evidence

Record owner/device/connectivity observations, sample documents, correction effort, comprehension, adviser feedback, and competitor comparisons. Measure effort including review, accepted-entry accuracy, and interruption recovery. README targets are unachieved proposals. Never invent interviews, demand, willingness to pay, approvals, or benchmarks.

Provenance: user instructions in this conversation and the supplied ideation document, `Pasted markdown.md`. Preserve their distinction from independently verified external evidence.

## Guided owner-workflow implementation — 23 October 2026

The user authorized the docs/design/UX_REDESIGN_BRIEF.md redesign and explicitly prioritized mobile use. The app now separates a short business name/activity/task setup, a returning-owner task home, and guided sale/expense amount-payment-review flows. English/Tagalog, exact values, owner isolation, legacy drafts, and duplicate-safe acceptance are retained. Setup completion and selected activity are stored independently of tax readiness. Existing businesses stay complete with activity unspecified when unknown. Names can be changed through an authorized profile-revision check.

Device drafts now autosave with account/business scope and expected-snapshot conflict detection. Part payments remain draft-only; unpaid and unknown payment retain their distinct meanings. The user must explicitly retry pending account saves. Last-business preference stores only an account-scoped UUID and is revalidated against owned businesses.

docs/design/STYLES.md guides the provisional visual design. No photo/OCR, tax calculation, service worker/offline reopening, physical-device validation, owner usability findings, or Vercel deployment is claimed. See docs/product/guided-workflows.md and docs/development/verification.md for actual contracts and executed checks. The exported docs/archive/project-pack-2026-10-22/MSME_PROJECT_PACK.md remains its original snapshot.

## Target-area correction — 23 October 2026

The user explicitly selected Quezon City instead of Manila for the proposed pilot. Use Quezon City in current product framing. The exact pilot boundary and first business segment remain research decisions; do not expand the city into all NCR. Asia/Manila remains the business-date timezone. Existing historical source titles and archived snapshots retain their original wording.

## Completion slice — Quezon City, 23 October 2026

The user authorized lifecycle, retrieval, notebook review, preparation, recovery and offline improvements. Current implementation now includes multiple operation-scoped drafts and persisted short setup; separate full/partial/later payments; revisioned corrections/voids and source history; searchable paginated records; exact period summaries and immutable/stale CSV/print snapshots; private notebook capture/manual source review with a configured Azure adapter; separate revisioned preparation evidence with tax calculation blocked; password recovery integration; and a production public offline shell. Unknown legacy payment dates remain null. New additive migrations were tested and applied only to the separately authorized CSSprint MSME project. See docs/development/IMPLEMENTATION_GAP_AUDIT.md and docs/development/verification.md for actual status/evidence.

Quezon City is the selected target city, without selecting the pilot boundary or business segment. Asia/Manila remains the time zone. Live OCR credentials, actual SMTP delivery, tax rules/practitioner validation, physical phone/fluent Tagalog/owner research and operational restore remain external dependencies. A separate Vercel project is authorized but creation was denied by provider scope access; no deployment URL exists. No Git commit/push or destructive database reset was performed.

## Public account-free demo — 23 October 2026

The user explicitly requested a shareable Vercel demo without accounts. A separate browser-only simulation now uses the existing UI behind NEXT_PUBLIC_DEMO_MODE=true. It seeds synthetic Quezon City records, keeps demo records/photos in a separate IndexedDB database, rotates the synthetic owner/business on reset, and labels saves/exports as simulated and browser-local. It does not bypass the real application Auth/RLS or expose the real financial database. Normal authenticated behavior remains the default when the flag is false.

Published and verified: https://cssprint-msme-demo.vercel.app (separate project cssprint-msme-demo, prj_E3uprIXsokq8Y6b6Ybf868pXQjyQ; deployment dpl_5ZYi2C6qERfAncEL3KmhhgfHp7Gt READY). The connector default scope allowed creation/deployment; earlier explicit-scope creation and build-log inspection were denied. No Git commit/push or Supabase migration was performed. Actual evidence and demo limits are in docs/development/demo-deployment.md: 248 local tests, builds/type/lint and four public browser journeys passed. Live OCR, real email, tax validation and human/device review remain separate dependencies.
