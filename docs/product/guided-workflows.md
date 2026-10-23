# Guided owner workflows

Current implementation for the Quezon City target area follows the [UX debrief](../design/UX_REDESIGN_BRIEF.md) and [STYLES.md](../design/STYLES.md). The first owner segment, exact pilot boundary and final owner validation remain open.

## Setup and Home

A signed-in owner without a business starts business name → basic activity → first task. Activity choices are products, services, both or another activity. Setup collects no TIN, full address or tax questionnaire. Back and language changes preserve answers; non-sensitive setup is saved under the original account with revision checks. Final submission uses a stable business ID and frozen answers, allowing compatible retries after interruption.

Returning owners reach Home. It prioritizes sale/expense entry and notebook capture, with secondary Records, period summary, preparation and owner-money actions. Business creation/switching/rename/sign-out stay in an accessible menu. Home reads accepted active records; corrections and payment status are reflected, and voided records are omitted.

## Manual entry and payments

Sale/expense stages are amount/business date → payment details → review/save. The chosen task establishes the record type. Optional notes expand on demand. Exact amount text and Asia/Manila dates retain meaning across language changes.

Payment answers are paid in full, unpaid, partial or unknown. Full/partial movement requires a payment date; partial movement also needs a positive paid amount below the event total. Unknown and unpaid remain distinct. A review shows the event and payment details before a durable reviewed command is sent.

Later payment belongs to the original record in Records. It updates linked payment events and the balance, without creating another sale/expense. Overpayment, payment before the event, implicit refunds and contradictory edits are rejected. Payment corrections/voids retain history. Unknown prior payment information needs an explicit clarification before adding a settlement.

Secondary contribution/withdrawal entry keeps owner money separate from sales/expenses. Existing unsupported loan/transfer drafts retain their original kinds and version-one commands.

## Multiple drafts and recovery

Each transaction uses a separate account/business/operation key. A database upgrade migrates original single-draft rows without changing values or operation IDs. Owners can save for later, start another transaction, read each draft summary, resume a specific draft or deliberately discard an unsent draft.

Draft saving is debounced; navigation flushes the latest snapshot. An untouched form creates no blocking empty draft. Saving is shown only after the device write succeeds. Failed writes and stale snapshots remain unsaved/conflicted. Conflicts compare readable current/saved values, with deliberate choices and an optional technical recovery download.

A pending submission is frozen before its request. Network/auth failures or lost responses retain its original ID/payload and cannot be discarded as ordinary unfinished work. Only a trusted account acknowledgement permits cleanup. Definitive validation rejection can reopen an editable proposal; uncertain/auth failures cannot use that path. Reviewed pending commands may retry on foreground resume/reconnect after verifying the original account. Unreviewed drafts never auto-submit.

Account changes hide the prior owner's UI and preserve its scoped work. Storage-failure recovery is held in memory for the original owner while the page remains open. Notebook capture/review also exposes persistence guards to business navigation and sign-out.

## Phone, laptop and offline scope

Forms use a focused single column with readable controls, visible focus and normal-flow actions. The skip link remains keyboard accessible. Global language controls remain available. Notebook review focuses one row beneath its source on phones and uses source/form columns on laptops. Printable reports hide the application toolbar and editing controls.

The production service worker caches a public offline shell and static resources only. A previously established workspace can reopen and create device drafts offline. Server history, private source images, uploads, provider processing and reports require reconnection. The app does not cache private API responses or tax identifiers, and it does not provide broad cross-device offline merging.

Actual checks and limits, including viewport versus physical-device evidence, are in [verification](../development/verification.md).
