# Additive migration notes

Apply files in filename order to a new environment. Existing environments must retain their original migration history and financial records.

| Migration | Behavior |
| --- | --- |
| 20261022173245_manual_transaction_entry.sql | Original owner-only businesses, reviewed records, revisions and retry receipts |
| 20261022181352_guided_business_setup.sql | Short setup, broad activity, profile revision and safe rename |
| 20261022192459_ledger_lifecycle.sql | Financial revisions/voiding, linked payments, search, summaries, immutable reports and source references |
| 20261022192523_document_review.sql | Private notebook metadata, original-object policies, proposals, review/acceptance receipts |
| 20261022193930_preparation_profiles.sql | Owner-supplied preparation evidence, unknown figures, revision/history and safe retries |
| 20261022194303_ledger_owner_movement_resolution.sql | Full contribution/withdrawal movement follow-up without adding owner receivables or loan servicing |
| 20261022195322_document_acceptance_safeguards.sql | Source foreign keys, proposal locators, explicit payment dates and protection against reusing an older manual acceptance |
| 20261022202136_ledger_zero_payment_preservation.sql | Preserve explicit paid-zero status and kind-derived direction through corrections, without inventing payment events |

The isolated hosted project is CSSprint MSME, ffrrwnoctodgfuravmvg. These additions were tested with the existing migration chain before application. The original two hosted MCP history timestamps differ from the local CLI filenames; later additions also receive hosted MCP timestamps. No history reset or destructive repair was performed. For another linked environment, compare migration names/content deliberately rather than replaying already-installed table creation.

Known legacy received/paid amounts remain known. Their separate payment dates were not recorded in v1 and remain null after migration. They are excluded from dated cash totals and period outstanding calculations until an owner supplies evidence through a payment correction. No payment date or missing amount is invented.

Financial changes are additive: accepted records remain, direct writes stay revoked, and revisions/receipts commit atomically. Existing reviewed pending v1 commands retain their original IDs and payloads. Notebook rows accepted before a financial correction remain linked to their original source; retry cannot rewrite that history.

The Storage bucket remains private. Embedded tests include Storage-schema fixtures for policies; actual hosted upload/download denial is verified separately in browser tests. New database types were generated from the hosted schema after the initial additive migrations. Later safeguards replace existing function bodies without changing their API shape.

Do not remove an applied migration from history or rewrite it to ship a new fix. Create a separately named additive migration, test it, then apply to the intended environment.

The final additive zero-payment fix was reproduced with a failing embedded PostgreSQL regression, then verified for paid sale/expense corrections, kind changes, unknown/unpaid preservation, and linked-payment rejection before being applied to the isolated hosted project. It changes no function signatures or historical accepted data.
