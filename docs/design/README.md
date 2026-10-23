# Design guidance

Use [STYLES.md](STYLES.md) for the visual system and the [UX redesign brief](UX_REDESIGN_BRIEF.md) for interaction flow. Both are the user's supplied guidance. Mobile usability is the first priority; English/Tagalog switching must preserve unfinished work.

The current app follows the Buwis Folder mascot and provisional forest/mango/cream/coral direction. System UI typography avoids an external font dependency. Product naming, detailed composition, translations, and final branding still require owner/design validation.

| Material | Location |
| --- | --- |
| Visual guide | [STYLES.md](STYLES.md) |
| Owner-task UX debrief | [UX_REDESIGN_BRIEF.md](UX_REDESIGN_BRIEF.md) |
| Implemented screen behavior | [Guided workflows](../product/guided-workflows.md) |
| Original artwork and available exports | [assets/brand](../../assets/brand/README.md) |
| Runtime SVGs | `public/brand/` |
| App styles | `src/app/globals.css` |
| Research handoff and open decisions | [Canonical visual research handoff](../../.agents/skills/msme-project-foundation/references/visual-research-handoff.md) |

The older duplicate research handoff is retained only in the historical archive. Proposed asset variants mentioned in the style guide are not evidence that those variants have been produced.


## Phone simplification, 23 October 2026

The user's Kitang-Kita screenshot ZIP guides the current implementation: white screens, green primary actions, large question headings, visible labels, and expandable secondary details. Native CSS and system fonts preserve the existing stack. `src/app/simplified.css` contains the shared layout adjustments.

| Owner task | Where it remains available |
| --- | --- |
| Sales and expenses, full/partial/unpaid/unknown payment | Home → Record a sale / Record an expense |
| Unfinished entries, retry, conflict recovery and discard | Home → saved drafts |
| Notebook photos, original source, manual review, missed rows and history | Home → Photograph a notebook |
| Search, date/type/payment/status filters and pagination | Home → Find records; filters expand above the results |
| Later payments, payment history and source links | Open a record |
| Correct, clarify and void records/payments | Open a record → correction controls |
| Exact period summary, CSV, immutable report, included records and print | Home → Understand a period |
| Business/evidence profile, earlier figures and preparation package | Home → Prepare records |
| Contributions and withdrawals | Home → Owner money |
| Business selection, adding/renaming, account actions | Business/account menu |
| English and Tagalog | Header, throughout the journey |

Back saves current editable work before leaving. Failed local writes keep the owner on the current task. Browser history holds navigation identifiers, while scoped draft storage holds answers. Language changes retain the current task and raw input. Returning through history cannot reopen a completed sale as an empty review. Adding another entry assigns a separate operation ID. Corrections require fresh review after browser navigation rather than resurrecting an earlier command.

Phone controls have comfortable touch targets; headings and field labels are bold, and secondary status text is larger. Report details expand for printing and restore afterward. Disclosure sections reduce the initial reading load without deleting their functions. The supplied screenshots are visual references, not evidence that reminder scheduling or external filing exists.

Browser checks use synthetic data, 320px/390px phone widths and a laptop viewport. Actual older-owner testing and fluent Tagalog review remain necessary.
