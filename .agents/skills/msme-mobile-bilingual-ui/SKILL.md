---
name: msme-mobile-bilingual-ui
description: Research, design, implement, or review phone-first English and Tagalog interfaces for this Filipino MSME app. Use for forms, notebook review, responsive layouts, translations, accessibility, save states, and applying user-supplied visual references.
---

# Build the mobile and bilingual interface

Read the [visual research handoff](../msme-project-foundation/references/visual-research-handoff.md), the actual feature requirements, and any user-selected references. Treat the visual identity as unresolved unless a later decision records it.

## Establish the task and design status

Identify the owner's next action and the information needed to complete it. Preserve the recorded workflow before adding decorative content.

When asked only for research, context, or documentation, deliver that work. When asked to implement, use selected references and resolve ordinary missing details with accessible provisional choices. Record those choices; do not invent approval or impose a blanket design freeze.

Avoid claims that a phone type, language, or accounting skill represents all Filipino MSMEs. Use observed users and devices when available.

## Build reusable, adaptable controls

Use the existing Tailwind/shadcn component family and project tokens. Verify current compatibility before introducing new primitives. Develop reusable amount inputs, record items, source-review controls, language selection, and save-status components.

Make the phone workflow usable in a single narrow viewport; use desktop space to improve evidence review and record inspection. Support camera and file-upload paths where the browser allows them. Keep controls usable with keyboard, touch, and visible focus.

Use visible labels, readable text and amounts, adequate contrast, clear field errors, comfortable touch targets, and text alongside status colors. Validate the assembled screen rather than assuming component primitives establish accessibility.

## Implement English and Tagalog fully

Keep an easily discoverable English / Tagalog control available before sign-in and throughout the workflow. Save the selected preference appropriately for the account/device.

Use reviewed translation dictionaries for labels, instructions, errors, empty states, loading, uploads, review, and save/sync feedback. Keep user-entered descriptions intact. Keep official identifiers intact and translate their explanations.

Preserve input values, attachments, current screen and step, and validation context during a language change. Handle remounts and navigation explicitly; a translation library alone does not preserve drafts. Keep PHP and Asia/Manila behavior independent of locale.

Keep draft ownership outside locale-dependent remounts. Preserve unfinished amount text, not only the last parsed number, and preserve File/Blob or authorized upload references through the chosen draft store. Do not rely on a file-input DOM value to restore an attachment. Preserve dirty/touched state and focus where appropriate.

Do not use live model translation for fixed interface text. Mark untranslated or unreviewed wording explicitly in development and resolve it before representing bilingual coverage as complete.

## Make progress and failure understandable

Distinguish upload, extraction, review, local saving, and cloud submission. Show success only for the operation that actually succeeded.

Keep review status separate from sync status. Use short messages such as saved on this device, waiting to sync, synced, needs review, and could not sync. Supply both-language equivalents reviewed for comprehension.

Preserve work after recoverable errors. Keep the source image available during corrections. Display uncertain values and missing information explicitly. Do not use a generic compliant or filed badge for a generated draft.

## Verify

Complete the affected task on representative phone and laptop widths/browsers. Switch languages during an unfinished form and after validation fails. Check amount readability, text expansion, keyboard/focus, source zoom, and retry behavior.

Report observed outcomes and remaining design questions. Update the visual reference when the user selects a direction or research changes a substantive interaction.
