# Sources, decisions, and open questions

Baseline: 22 October 2026, Asia/Manila. External references are implementation/research starting points; reread current primary material before relying on version-sensitive behavior.

## Evidence categories

| Category | Meaning |
| --- | --- |
| User-confirmed | Explicit requirement or choice in this conversation |
| Working recommendation | Proposed technical/product default that can be refined |
| Hypothesis | A claim about users/value requiring observation |
| Verified implementation fact | Established by inspecting actual code and executed checks |
| Authoritative rule evidence | Applicable operative source, effective period, and documented interpretation |
| Open | No decision or adequate evidence yet |

Do not upgrade a category without evidence. Preserve the reason and date for a changed decision.

## Decision register

| Decision | Current status |
| --- | --- |
| Web app, phone first, useful laptop experience | User-confirmed |
| Readily accessible English / Tagalog | User-confirmed |
| Supabase and Vercel foundation | User-confirmed |
| Readable code and professional financial workflow | User-confirmed |
| No three-day constraint on technology selection | User-confirmed |
| Visual research continues; no final identity selected | User-confirmed |
| Next.js/React/TypeScript/Tailwind/shadcn/next-intl/forms stack | Working recommendation |
| Feature modules, services, pure rules, focused data access | Working architecture recommendation |
| Narrow registered non-VAT individual profile; possible 8% path | Scope proposed in supplied ideation README; verify before automation |
| Source-linked notebook review as a valuable distinction | Product hypothesis; compare correction effort and alternatives |
| Bounded offline drafts and later server submission | Working contract; verify actual target-device behavior |
| Deployment, app implementation, validated tax rules | Not established by this pack |

## Open questions

Record an owner and next evidence step for the actual target segment/community, sample notebook layouts, assisted versus independent use, selected design references, sign-in method, OCR provider, browser baseline, package versions, broader offline requirements, tax-rule reviewer, pricing, and research access.

Keep answers in this register or link to their canonical decision record. Do not silently fill them from assumptions.

## Technical primary sources

These topics were checked against primary documentation during planning; implementation must verify the relevant installed/current version.

| Topic | Primary reference |
| --- | --- |
| Next.js structure and boundaries | https://nextjs.org/docs/app/getting-started/project-structure |
| Server/client components | https://nextjs.org/docs/app/getting-started/server-and-client-components |
| Data-access and server safety | https://nextjs.org/docs/app/guides/data-security |
| Route/server usage | https://nextjs.org/docs/app/guides/backend-for-frontend |
| PWA/offline integration | https://nextjs.org/docs/app/guides/progressive-web-apps |
| shadcn components | https://ui.shadcn.com/docs |
| shadcn component-family default | https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default |
| Tailwind browser baseline | https://tailwindcss.com/docs/compatibility |
| next-intl | https://next-intl.dev/docs/getting-started/app-router |
| Form state and validation | https://react-hook-form.com/get-started and https://zod.dev/ |
| Cloud query state | https://tanstack.com/query/latest/docs/framework/react/overview |
| Supabase current changes | https://supabase.com/changelog |
| Supabase RLS | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Private Storage | https://supabase.com/docs/guides/storage/buckets/fundamentals |
| Uploads | https://supabase.com/docs/guides/storage/uploads/resumable-uploads |
| Auth email setup | https://supabase.com/docs/guides/auth/auth-smtp |
| Function payload/other limits | https://vercel.com/docs/functions/limitations |
| Preview and production environments | https://vercel.com/docs/deployments/environments |
| Exact numeric representation | https://www.postgresql.org/docs/current/datatype-numeric.html |
| Database atomicity | https://www.postgresql.org/docs/current/tutorial-transactions.html |
| Local database | https://dexie.org/docs/Dexie.js |
| Browser storage | https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria |
| Background sync availability | https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API |
| Broader sync candidate | https://docs.powersync.com/integrations/supabase/guide |
| Touch target guidance | https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html |
| Architecture concepts | https://martinfowler.com/bliki/PresentationDomainDataLayering.html |
| Project skill compatibility | https://opencode.ai/docs/skills/ and https://opencode.ai/docs/rules/ |

Avoid hard-coding transient limits into product promises. Source framework details from matching package documentation.

## Tax and privacy research starting points

The following links come from the supplied ideation README. This pack does not independently certify their current applicability, completeness, or interpretation. Reopen the operative source, follow amendments and relevant current issuances, and record the applicable period before encoding a rule.

- BIR 8% option research: https://bir-cdn.bir.gov.ph/local/pdf/RMO%20NO.23-2018.pdf
- BIR accounting systems/books research: https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%209-2021.pdf
- BIR 2026 books digest supplied by user: https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%204-2026%20Digest.pdf
- BIR 2026 forms digest supplied by user: https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2036-2026%20Digest.pdf
- BIR filing-solution certification research: https://bir-cdn.bir.gov.ph/local/pdf/RMO%20NO.%208-2019.pdf
- NPC identifier/privacy research: https://privacy.gov.ph/wp-content/uploads/2023/05/Advisory-Opinion-No.-2023-002.pdf
- NPC AI-processing guidance supplied by user: https://privacy.gov.ph/wp-content/uploads/2025/02/Advisory-2024.12.19-Guidelines-on-Artificial-Intelligence-w-SGD.pdf

No tax formula or claimed regulatory exemption is encoded by this pack.

## Evidence/decision entry template

- Topic and decision requested:
- Current category and status:
- Source URL/title or user instruction:
- Date inspected; publication/effective date; applicable period:
- Observed finding or operative requirement:
- Interpretation and applicability conditions:
- Open questions and required evidence:
- Decision and affected feature:
- Reviewer/rules owner and review status:
- Actual validation performed:
- Supersedes or next review:

## Change log

- 23 October 2026: implemented manual transaction entry with owner-only businesses, create-only reviewed records, exact string centavos, manual provenance, atomic audit/retry receipts, and account/business-scoped device drafts. Email/password Auth is a provisional implementation choice; email delivery is not verified. User explicitly authorized a new separate Supabase project (`CSSprint MSME`, `jim-mo`, Singapore), now configured and migrated. Existing unrelated project unchanged. docs/design/STYLES.md supplied the provisional forest/mango/cream palette and existing folder SVGs; no product name was selected. See `docs/product/manual-entry.md` and `docs/development/verification.md`. No Vercel deployment or tax-rule implementation occurred. The bundled Markdown pack remains its original snapshot and has not been redistributed.

- 22 October 2026: consolidated conversation and ideation context into project-local agent instructions. Visual direction, tax-path validation, and user research remain open. No application or live integration was created.


## Guided owner-workflow implementation — 23 October 2026

The user authorized the docs/design/UX_REDESIGN_BRIEF.md redesign and explicitly prioritized mobile use. The app now separates a short business name/activity/task setup, a returning-owner task home, and guided sale/expense amount-payment-review flows. English/Tagalog, exact values, owner isolation, legacy drafts, and duplicate-safe acceptance are retained. Setup completion and selected activity are stored independently of tax readiness. Existing businesses stay complete with activity unspecified when unknown. Names can be changed through an authorized profile-revision check.

Device drafts now autosave with account/business scope and expected-snapshot conflict detection. Part payments remain draft-only; unpaid and unknown payment retain their distinct meanings. The user must explicitly retry pending account saves. Last-business preference stores only an account-scoped UUID and is revalidated against owned businesses.

docs/design/STYLES.md guides the provisional visual design. No photo/OCR, tax calculation, service worker/offline reopening, physical-device validation, owner usability findings, or Vercel deployment is claimed. See docs/product/guided-workflows.md and docs/development/verification.md for actual contracts and executed checks. The exported docs/archive/project-pack-2026-10-22/MSME_PROJECT_PACK.md remains its original snapshot.

## Folder organization — 23 October 2026

The user requested a navigable project folder before GitHub publishing. Current implementation documents are grouped under docs/product/, design guidance under docs/design/, and setup/testing/evidence under docs/development/. Original logo sources moved to assets/brand/; runtime public/brand/ URLs remain unchanged. The original planning documents, installer, and checksum-protected bundle are preserved under docs/archive/project-pack-2026-10-22/. Canonical agent references stay in .agents/. Local credentials, synthetic fixtures, dependencies, and generated output remain excluded by .gitignore. This organizational change does not initialize Git, commit, push, or change the hosted database.

## Target-area correction — 23 October 2026

The user explicitly selected Quezon City instead of Manila for the proposed pilot. Use Quezon City in current product framing. The exact pilot boundary and first business segment remain research decisions; do not expand the city into all NCR. Asia/Manila remains the business-date timezone. Existing historical source titles and archived snapshots retain their original wording.

## Completion slice — Quezon City, 23 October 2026

The user authorized lifecycle, retrieval, notebook review, preparation, recovery and offline improvements. Current implementation now includes multiple operation-scoped drafts and persisted short setup; separate full/partial/later payments; revisioned corrections/voids and source history; searchable paginated records; exact period summaries and immutable/stale CSV/print snapshots; private notebook capture/manual source review with a configured Azure adapter; separate revisioned preparation evidence with tax calculation blocked; password recovery integration; and a production public offline shell. Unknown legacy payment dates remain null. New additive migrations were tested and applied only to the separately authorized CSSprint MSME project. See docs/development/IMPLEMENTATION_GAP_AUDIT.md and docs/development/verification.md for actual status/evidence.

Quezon City is the selected target city, without selecting the pilot boundary or business segment. Asia/Manila remains the time zone. Live OCR credentials, actual SMTP delivery, tax rules/practitioner validation, physical phone/fluent Tagalog/owner research and operational restore remain external dependencies. A separate Vercel project is authorized but creation was denied by provider scope access; no deployment URL exists. No Git commit/push or destructive database reset was performed.

## Public account-free demo — 23 October 2026

The user explicitly requested a shareable Vercel demo without accounts. A separate browser-only simulation now uses the existing UI behind NEXT_PUBLIC_DEMO_MODE=true. It seeds synthetic Quezon City records, keeps demo records/photos in a separate IndexedDB database, rotates the synthetic owner/business on reset, and labels saves/exports as simulated and browser-local. It does not bypass the real application Auth/RLS or expose the real financial database. Normal authenticated behavior remains the default when the flag is false.

Published and verified: https://cssprint-msme-demo.vercel.app (separate project cssprint-msme-demo, prj_E3uprIXsokq8Y6b6Ybf868pXQjyQ; deployment dpl_5ZYi2C6qERfAncEL3KmhhgfHp7Gt READY). The connector default scope allowed creation/deployment; earlier explicit-scope creation and build-log inspection were denied. No Git commit/push or Supabase migration was performed. Actual evidence and demo limits are in docs/development/demo-deployment.md: 248 local tests, builds/type/lint and four public browser journeys passed. Live OCR, real email, tax validation and human/device review remain separate dependencies.
