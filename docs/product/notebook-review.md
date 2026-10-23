# Notebook capture and reviewed records

The bounded workflow starts from **Photograph a notebook** on Home. It supports one JPEG/PNG page at a time, up to 4 MB and 50 proposed entries per page. The target pilot area is Quezon City; the first owner segment and representative notebook layouts still need research.

## Capture and original source

Choose Sales notebook or Expense notebook, photograph/select the page, inspect the preview, and choose another photo if needed. A selected photo is saved as an account/business-scoped Blob in IndexedDB. Browser storage failures are shown; device storage is not a backup.

Saving the original registers a stable document ID and file fingerprint, then uploads to the private `notebook-sources` Supabase bucket using an authorized signed upload token. Completion verifies the byte count, SHA-256 fingerprint, and JPEG/PNG signature against the actual stored original. A repeated upload can reconcile an already-uploaded original without replacing it. An unfinished capture remains available for retry.

Private originals are displayed through an authenticated, owner-authorized, uncached image endpoint. The bucket has owner-scoped INSERT/SELECT policies and no client replacement/deletion policy. The app never creates a public source URL.

## Automatic reading and its current blocker

The server adapter targets Azure Document Intelligence `prebuilt-read`, REST API `2024-11-30`. It sends only the selected image bytes after the owner's external-processing consent. Configure server-only:

```text
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
AZURE_DOCUMENT_INTELLIGENCE_KEY=
```

Neither variable was present in the inspected local configuration. No Azure service was created, no live extraction was run, and no handwriting accuracy is claimed. The production UI explicitly states that automatic reading is unavailable and permits manual transcription from the source.

The first deterministic interpretation layout is:

```text
YYYY-MM-DD | description | amount | paid / unpaid / unknown
```

Matching lines produce proposals. Missing or ambiguous dates/amounts remain blank; unrecognized payment remains unknown. Non-matching lines remain visible for manual interpretation, and likely total/balance lines are flagged for review. No AI/model calculates financial totals or accepts records.

The adapter stores a received provider job location privately, validates its origin/path against the configured Azure endpoint, and polls that same job on later checks. A definitively failed job is cleared for an explicit retry; an uncertain network response retains the original job. It does not accept arbitrary source URLs. Failure to receive/store the provider's initial job acknowledgement remains a provider recovery/cost limitation; financial record acceptance remains independently idempotent.

## Review and acceptance

The phone layout places source inspection above the focused entry form. Laptop screens place the source beside the form. Owners can add missed entries, edit the source line, date, description, exact amount, sale/expense classification, and payment details, or remove non-record proposals. Both full and partial payment require an owner-confirmed payment date; partial payment also requires the actual amount. Missing payment dates are not inferred from business dates. These values pass through the shared ledger balance rules.

Review edits are saved locally with expected-state checks and can be saved to the account without accepting financial records. Original extraction remains separate from later review revisions. Conflicts show the owner's entries beside saved entries and require a deliberate choice.

The owner must review each entry, compare it with the page, check possible duplicates, then explicitly confirm acceptance. Matching image fingerprints and same-date/type/amount candidates warn without deleting legitimate repeated events.

Acceptance uses the same controlled ledger operation as manual records. The transaction, initial payment where relevant, source-document/row link, row acceptance, document revision, and receipts commit in one database transaction. Replaying a committed row acceptance acknowledges its original result. A new source acceptance cannot reuse an earlier ledger-create identifier to rewrite an existing record's provenance, and a different operation cannot accept the same source row again.

Accepted source rows cannot be edited or removed in notebook review. Corrections and voids use Records, retaining the original source link and financial history. Saving a photo or review draft never implies that its entries have been accepted, filed, or paid.

## Interfaces and evidence

- `GET /api/documents?businessId=...`: latest 100 source pages for the authorized business.
- `GET /api/documents?businessId=...&documentId=...`: source, proposals, review history, row acceptances, and duplicate candidates.
- Add `&image=1` for the authenticated original-image response.
- `POST /api/documents`: registered, revision-checked commands with stable operation IDs.

Focused verification ran 27 tests across five files, using actual PostgreSQL RLS/transactions with embedded Storage-schema fixtures and separate mocked Azure HTTP responses. They cover unresolved extraction, owner isolation, protected original paths, source-linked full/partial/unknown acceptance, explicit payment dates, conflicting edits, receipt replay, rejection of earlier ledger-operation reuse, request origin/body limits, and complete rollback after a forced source-audit failure.

One hosted Playwright journey passed against the local app and the isolated Supabase project: a photo survived an online reload, English/Tagalog preserved it and raw amount text, an upload-finalization response was deliberately dropped and reconciled, a manually reviewed partial-payment entry was accepted, and a lost acceptance response was retried into one record and one payment. Foreign-account image/review requests and a direct foreign Supabase Storage download were denied. Phone (390px) and laptop (1440px) screenshots were captured and visually inspected; these are browser viewport checks rather than physical-device findings.

These tests do not establish live Azure quality, physical-camera behavior, practitioner approval, or owner/fluent Tagalog review. Retention/deletion policy, Storage backup/restore procedures, and production processing-cost approval remain operational work.

Primary references consulted: [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [Azure Read model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0), and [Azure analyze-document REST contract](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20%282024-11-30%29).
