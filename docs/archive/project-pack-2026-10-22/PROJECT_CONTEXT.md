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
