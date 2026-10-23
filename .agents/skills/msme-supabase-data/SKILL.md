---
name: msme-supabase-data
description: Design, implement, or review Supabase data, Auth, RLS, private Storage, and transactional writes for this Filipino MSME app. Use for schema changes, authorization, record acceptance, source access, idempotency, migrations, and deployment data configuration.
---

# Implement Supabase data boundaries

Read the [record contracts](../msme-project-foundation/references/financial-record-contracts.md) and [architecture](../msme-project-foundation/references/architecture-and-conventions.md). Use the provider's current documentation for actual APIs and CLI commands.

## Inspect first

Inspect the actual project, environment, schema, migrations, generated types, grants, policies, and authentication flow. Verify versions and relevant changelog entries before changing provider behavior. Do not invent project IDs, credentials, tables, deployment regions, or service availability.

Apply existing authorization to changes. Keep synthetic demo work isolated from real-user data. Never weaken access controls to make a demo succeed.

## Model business ownership and exact records

Attach data and private objects to the correct business. Model ownership or membership explicitly and validate access on each operation.

Keep source documents, proposed extraction, accepted records, revisions, mutation identities, and report snapshots distinguishable. Preserve canonical financial meaning, business dates, precise amounts, and provenance.

Define constraints for relationships and important invariants. Use appropriate indexes based on actual access patterns. Preserve currency precision across JSON and JavaScript, including safe integer bounds or decimal serialization.

## Enforce authorization at every reachable boundary

Enable RLS on exposed business tables and define the intended grants; table accessibility and row policies are separate decisions. Match policies to actual business membership. A signed-in role alone does not establish access to a specific business.

Use trusted identity and membership data. Keep secret/service credentials out of browser bundles and logs. Use least-privileged, user-scoped access where appropriate; explicitly authorize any privileged server operation.

Review views and database functions for effective permissions. Prefer invoker behavior. Do not use privileged functions merely to remove a permission error. If a business invariant depends on a controlled write operation, restrict direct table mutation so callers cannot bypass it.

Test another account's access at database, endpoint, Storage, and local-cache boundaries.

## Persist acceptance and corrections safely

Use a database transaction or equivalent authorized database operation for related financial record, source-link, revision, and idempotency changes.

Check expected versions inside the write. Handle conflicts explicitly. Enforce business-scoped uniqueness for operation IDs and verify payload compatibility before replaying a prior result. Return the existing outcome for an identical retry.

After current authorization and payload checks, resolve an already completed operation before applying the current record-version check. Replaying a committed operation must acknowledge its original outcome even if a later edit advanced the record; refresh current state separately and never downgrade it to an older returned revision.

Invalidate or version affected report drafts when source records, evidence, or calculation inputs change. Never rely on several independent HTTP requests to create atomicity.

## Protect uploads and authentication flows

Store source images and reports privately. Use authenticated reads or short-lived signed access as appropriate. Authorize document ownership before OCR or export access.

Upload images directly to authorized Storage paths; verify current upload and function limits. Use resumable uploads when the network/file behavior warrants them. Validate allowed file properties and processing limits.

Use the official server/browser Auth integration for installed versions. Validate sessions and redirect configuration. When email authentication is chosen, configure and test an actual delivery provider for external testers; verify current built-in service limits.

## Deliver and verify

Create versioned migrations using the repository's established workflow; preserve existing history and unrelated data. Update generated types and document the operation contract.

Verify allowed and denied access, atomic failure behavior, duplicate retry, incompatible replay, and stale-version edits relevant to the change. Record actual results and unresolved risks. Do not present setup as regulatory certification.
