# Record maintenance, retrieval, and preparation

Implemented for the Quezon City target area. The pilot boundary and first business segment remain research decisions. Dates retain Asia/Manila meaning independently of interface language.

## Find and maintain records

Home's Find records action opens server-backed retrieval beyond the recent fifty. Filters cover business-event date range, kind, description search, active/void state, and payment state. Needs clarification includes unknown payment or an undated legacy payment. Results use pages of 25; the selected date is the business date, while the record detail separately shows recording time.

Details show exact values, outstanding balance when known, source references, linked payment events, and revision history. Correction and voiding require a review and a reason. Corrections retain previous interpretations; voiding preserves the original and all history. A stale expected revision is rejected. Active linked payments prevent inconsistent amount/type changes or transaction voiding.

Payment events store their amount and date separately from the original sale or expense. Later settlement changes the balance, without creating another sale/expense. Payments cannot overpay a balance, precede the original event, or introduce implicit refund/credit handling. Payment corrections and voids have their own revisions and also advance the parent record revision. Unknown information remains unknown until the owner deliberately clarifies it. An explicitly paid zero-value record retains that answer through description/date corrections and changes of kind without creating a zero-value payment event.

Legacy accepted movements retain their known amounts but have no invented payment date. Their date is null, is shown as requiring confirmation, and is excluded from period cash totals until corrected with evidence. Simple owner contributions/withdrawals retain their own meanings; full movement follow-up is supported, while loan servicing and transfer settlement remain unavailable.

## Save and recover a maintenance change

The editor retains raw non-sensitive fields in account/business-scoped IndexedDB. A reviewed command is durably stored before sending, with one fixed operation identifier and payload. An uncertain network/server/auth outcome keeps that command for retry. A successful envelope alone is insufficient: the mutation receipt, snapshot, or preparation-profile result must pass its runtime schema before local pending cleanup.

A definitive revision/validation rejection offers refresh and revision of the proposed change. Current record and proposed values are shown in ordinary labels during review. Technical JSON downloads remain an optional recovery fallback. No pending operation automatically becomes a second financial record.

Correction and preparation editors flush before Home, tab navigation, business changes, or ordinary sign-out. A failed browser write blocks that navigation and leaves raw values visibly unsaved. Page-memory fallback retains those values under the original account, business, and editor if a forced session change unmounts the screen. Older write acknowledgements cannot erase newer raw values. Closing or reloading the page can still lose unsaved memory; it is not a cloud backup.

## Understand and export a period

Sales and expenses use business-event dates. Known money received/paid uses confirmed payment-event dates, including settlement of earlier records. Known balances cover sales/expenses in the chosen business period with payments through its end. Unknown balances and undated movements remain excluded from the respective totals and are disclosed. Undated-payment follow-up counts cover the business across periods. No opening balances, device drafts, pending submissions, profit, or tax calculation are silently included.

Save a reviewable report to create an immutable account snapshot containing its period, exact totals, accepted record/payment versions, source references, generation time, and any supplied preparation evidence. Subsequent changes mark that report stale; regenerate and review it. A CSV download and printable report use the same snapshot. Spreadsheet formula-leading text is neutralized, and all values are escaped. Downloaded files cannot update themselves after later changes; recheck the account report's freshness.

The browser remembers its most recent period/preparation report reference under account/business scope. This is not a complete saved-report library or a device backup. The server retains immutable snapshots; the CSV includes their references.

## Separate preparation journey

Preparation is optional and separate from onboarding. Its stages collect owner-supplied registration/treatment evidence references, tax year and period, coverage, earlier-period income, actual earlier tax payments, credits, and missing-information notes. Blank monetary inputs remain null; only explicit verified zero becomes zero. The form does not request a TIN, full address, or identity document.

Profile edits save through an authorized, idempotent, revision-checked operation. Required history and mutation receipts commit with the profile. Generated packages include that profile version; changed profile evidence or accepted financial records make dependent reports stale.

The package contains reviewed record totals, line items, exact supplied earlier figures, source index, missing-information list, and next-step instructions. Owner answers are not verified tax conclusions. No current tax calculation path or practitioner approval is asserted: tax-specific draft fields/calculations remain blocked. The package does not register a business, create registered books, file a return, pay tax, or prove compliance.

## Verification performed

The records/preparation browser subset and updated original workflow regressions passed together: 12 Playwright tests. They covered partial sale plus later payment, correction and linked-payment rejection, record search beyond fifty with pagination, hosted summaries/CSV/snapshot freshness and owner denial, preparation unknowns versus verified zero, actual CSV download, original bilingual/device drafts, automatic lost-response reconciliation, legacy contribution replay, and touch/reduced-height behavior.

Targeted local tests passed for preparation-profile authorization/history/atomic rollback/replay, preparation evidence gates, immutable pending-command persistence/account isolation, and malformed success-acknowledgement rejection. Actual 390px phone, 1440px laptop, and 1280px preparation/print screenshots were visually inspected. These are Chromium viewport checks; physical-phone testing, fluent Tagalog review, owner usability research, and practitioner review remain outstanding.
