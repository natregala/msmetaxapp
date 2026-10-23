# Current supported product scope

The app targets microbusiness owners in a proposed **Quezon City** pilot. Exact boundaries and the first business segment remain research decisions. English and Tagalog are available; dates retain Asia/Manila meaning.

A separate [account-free demo](https://cssprint-msme-demo.vercel.app) opens directly at Home with sample records. Its changes and photos stay in the visitor's browser; the authenticated journey below describes the full application. See [demo limits and verification](../development/demo-deployment.md).

## Working owner journey

1. Sign in or create an account. Confirmation-required and password recovery flows are integrated; actual email delivery remains unverified.
2. Complete business name → broad activity → first task. Non-sensitive unfinished setup is saved locally; completed creation is safely retryable.
3. Start a sale/expense or park several unfinished records. Resume a specific draft without blocking unrelated new work.
4. Enter exact amount/date, explicit payment details and optional description; review and confirm.
5. Record full, unpaid, partial or unknown payment. Add later payment to the original record without duplicating the sale/expense.
6. Find records using business-date/type/payment/description filters and pages beyond Home's recent list.
7. Inspect record/source/payment history; review corrections or voids with reasons and expected revisions.
8. Understand a period using accepted-record totals and confirmed payment dates, with exclusions and unresolved items visible.
9. Save an immutable report/preparation snapshot, download safe CSV or print the readable package. Later source/profile changes mark it stale.
10. Capture a notebook page, privately upload its original, manually review/add/correct proposals and accept each row deliberately. Live OCR is optional and currently unconfigured.
11. Enter owner-supplied preparation evidence separately from onboarding. Produce a record package and missing-information list; unverified tax calculations remain blocked.

Simple owner contributions and withdrawals have secondary journeys. Legacy loans/transfers retain their meanings without adding servicing or transfer-management products.

See [guided workflows](guided-workflows.md), [financial lifecycle](ledger-lifecycle.md), [records/preparation](records-and-preparation.md), and [notebook review](notebook-review.md).

## Persistence and safeguards

Drafts, review state, submission state, payment knowledge and preparation completeness are distinct. Device storage is scoped by account/business/operation; accepted records belong to Postgres. Immutable reviewed commands keep original identities across uncertain acknowledgements. Conflicting edits are rejected rather than silently overwritten.

Exact individual amounts range from ₱0.00 through ₱9,999,999,999.99. Missing is not zero. Incomplete decimal text stays a draft until valid. Dates range 1900-01-01 through 2100-12-31. Zero, unusually large, future or older entries receive an explicit review confirmation. Aggregate totals use exact integer strings without rounding or the per-record cap.

Payment events have separate dates. Legacy records lacking separately supplied payment dates retain unknown dates and are excluded from dated totals until corrected with evidence. Unknown payment information never becomes paid/unpaid by inference.

The production public offline shell permits previously established device workspaces to reopen and make drafts. Private history, documents, reports, provider processing and acceptance remain online operations. Cache/storage failure is reported; device storage is not encrypted and is not a cloud backup.

## Remaining limits

- Azure live extraction requires credentials and representative-sample evaluation. No live OCR result/accuracy is claimed.
- Tax-specific calculations, tax form fields, filing/payment and practitioner approval remain unsupported. The useful records/preparation package remains available.
- Refunds, credits, overpayments, loan servicing, full transfer management, inventory, payroll, invoicing and staff collaboration remain outside scope.
- One owner per business. Report generation caps a single relevant snapshot at 10,000 records and rejects larger selections instead of truncating silently.
- Most-recent report references are remembered locally; a complete saved-report library is not implemented.
- Physical-phone, screen-reader, fluent Tagalog, owner usability and practitioner reviews remain outstanding.
- SMTP/email delivery, production retention policy and managed database/Storage disaster recovery remain unverified operational work.
- The account-free browser demo is published on Vercel. The real authenticated cloud workflow still needs Vercel environment setup and verification. No Git commit/push, real-data production launch or hackathon submission has occurred.

The dated [verification record](../development/verification.md) and [gap matrix](../development/IMPLEMENTATION_GAP_AUDIT.md) distinguish tested results from external dependencies.
