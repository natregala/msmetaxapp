---
name: msme-offline-sync
description: Implement or review offline drafts, PWA caching, local account isolation, durable submission queues, idempotent retries, and edit conflicts for this Filipino MSME app. Use when adding Dexie, service workers, reconnect behavior, or offline financial-record workflows.
---

# Preserve offline work and synchronize safely

Read the [record contracts](../msme-project-foundation/references/financial-record-contracts.md) and actual database mutation contract.

## Define supported offline behavior

Use the bounded initial contract: a previously signed-in owner can create and reopen drafts on the same device, then submit supported operations when connected.

List which screens and commands work offline. Keep cloud OCR, remote authorization, and tax-draft generation dependent on their actual online services. Treat cached server history as a dated snapshot.

Evaluate a dedicated sync solution if the product expands to broad offline history editing and cross-device reconciliation. Do not silently extend a draft queue into full bidirectional synchronization.

## Implement local persistence

Use Dexie/IndexedDB for durable drafts and outbox records. Scope all local records by account and business; define cache access when sessions expire or accounts change.

Persist an entry and its queued operation atomically in the local database where they must remain consistent. Store stable identifiers, operation kind, payload/version, retry state, and last meaningful error.

Handle quota, eviction, and write failures explicitly. Request persistent browser storage where useful without guaranteeing permanence. Do not label a failed local write as saved or local storage as a backup.

Protect unsynced work during logout, cache cleanup, and app upgrades. Provide a clear reconnect, export, or deliberate discard choice when needed. Never silently mix accounts or erase pending records.

## Cache deliberately

Use the service worker for a tested offline app shell and essential assets/language resources. Prevent broad caching of authenticated responses and sensitive documents.

Plan asset and database schema upgrades so an update does not discard drafts or combine incompatible client and command versions. Installation alone does not establish offline behavior.

## Submit through one contract

Assign an operation ID before first submission. Retain it across retries and client restarts. Have the server enforce uniqueness, authorized business scope, and payload compatibility.

Retry when the app opens, resumes, or actual connectivity permits requests. Offer a visible retry action. Treat background sync as an optional enhancement; an online flag alone does not prove server reachability.

Keep pending work when the request fails or the acknowledgement is lost. Remove/mark a queued operation only after a trustworthy accepted outcome. Handle duplicate acknowledgement, multiple tabs, and concurrent queue workers without duplicate posting.

Reauthorize server work after session expiry. Do not transmit one account's queue under another account.

Bind workers and in-flight requests to an account/session generation. Stop that account's workers on account change and ignore stale responses in the new account's UI. An aborted request may still have committed: retain its operation identity and resolve it after the original account is reauthorized.

## Resolve conflicts and expose status

Use expected revisions for edits and check them atomically server-side. Show explicit conflict resolution for financial changes; do not silently apply last-write-wins.

Separate replay acknowledgement from current record state. A previously accepted operation can acknowledge an older revision without overwriting a later edit; mark the operation complete, then refresh current state. A genuinely new stale edit must receive a conflict.

Keep review and synchronization statuses separate. Distinguish locally saved, pending, synchronized, failed, and conflicted work in both languages. Show the last confirmed server state when that matters.

Verify reopen-after-save, lost acknowledgement, repeated retry, account switching, session expiry, local storage failure, stale-version edits, and app upgrade behavior affected by the change. Report actual platform/browser limits.
