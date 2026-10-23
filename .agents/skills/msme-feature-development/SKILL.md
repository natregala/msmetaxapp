---
name: msme-feature-development
description: Implement or refactor features in this Filipino MSME Next.js application using readable feature modules, thin entry points, application services, pure rules, and focused data access. Use for application code, API contracts, state ownership, and architecture reviews.
---

# Develop an MSME feature

Read the project's AGENTS.md and the foundation [architecture reference](../msme-project-foundation/references/architecture-and-conventions.md). Read the [record contracts](../msme-project-foundation/references/financial-record-contracts.md) when handling financial data.

## Inspect and define the change

1. Inspect the existing feature, package manifest, lockfile, migrations, and actual checks. Preserve established conventions unless a concrete problem justifies a change.
2. Define the user operation and its observable result, including loading, validation, empty, error, and retry behavior.
3. Identify which rules are shared by manual entry, document review, and offline submission. Route these paths through the same applicable server operation.

## Place code by responsibility

- Keep Next.js route files concerned with requests and pages concerned with composition.
- Put the workflow in a named feature service such as confirmReviewedTransaction or generatePeriodDraft.
- Keep classification, exact calculations, transition rules, and period logic in ordinary TypeScript functions.
- Put Supabase queries and writes in focused data-access functions. Put OCR and local database details behind named adapters.
- Keep React hooks focused on browser/UI coordination. Keep business rules out of effects and rendering.
- Keep shared modules small and specifically named. Add an abstraction when it removes meaningful duplication or isolates an actual dependency.
- Use functions by default. Avoid generic repository frameworks, unnecessary class hierarchies, global event buses, and empty layers.
- Keep feature imports intentional and acyclic. Put cross-feature orchestration in a service and consume another module's explicit public operations.

## Respect the server and browser boundary

Use server-only guards for privileged server modules. Treat a folder name as organization, not enforcement. Keep secrets and provider keys server-side. Keep shared schemas and pure rules free of framework-specific server imports when both environments need them.

Let Server Components call authorized server read functions directly. Use the project's chosen HTTP mutation boundary for browser and offline submissions. Avoid implementing one workflow twice through different transports.

Verify identity and business access at the operation boundary. Return a minimal application result instead of a provider response or unrestricted database row. Keep repository use subordinate to actual authorization, grants, RLS, and constraints.

## Define contracts deliberately

Validate untrusted input on the server, even when the form validated it. Separate structural validation from business validity.

Use a small typed result with stable error codes, field details, and conflict information. Translate user-facing explanations in the UI. Keep canonical enums, PHP amounts, business dates, identifiers, and UTC timestamps independent of locale.

For repeated submissions, include a stable operation ID. For edits, include an expected revision. Delegate all-or-nothing confirmation and concurrency checks to an appropriate database operation; sequential HTTP writes are not a transaction.

Assign state ownership: active form to form state, cloud reads to the query layer, durable unsent work to the local database, accepted server records to Postgres. Reconcile these states explicitly after success or conflict.

## Verify and hand off

Run checks that cover the changed risk: pure rule cases, data integration, or the complete UI flow. Include English/Tagalog and phone behavior when affected. Use actual repository commands and report actual output.

Keep tests near the behavior they protect. Avoid broad test expansion for cosmetic changes. Record meaningful architecture decisions and unresolved tradeoffs in the project context.
