# Visual research and design handoff

## Status and authority

Visual research remains open. No brand, palette, typography, final screen composition, or reference website is approved. Treat earlier suggested colors and layouts as examples.

The established product priorities are phone-first usability, a useful laptop experience, a visible English / Tagalog switch, clear financial-record workflows, and Supabase plus Vercel as the platform foundation. The working frontend recommendation is Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui; it does not determine the visual identity.

This document alone does not authorize app construction. When interface implementation is requested, use current research and assets. Resolve routine reversible choices autonomously. Record unspecified visual choices as accessible provisional defaults; do not block functional work with a blanket approval gate.

## Keep these decisions open

| Decision | Evidence to collect |
| --- | --- |
| Brand and visual tone | User-selected references and the intended owner audience |
| Colors and typography | Legibility, contrast, amount readability, and reference preferences |
| Navigation and information hierarchy | Tasks owners perform most often; observed terminology |
| Dashboard content | Decisions an owner needs to make, and available trustworthy data |
| Document-review layout | Tests involving real notebook structures and correction tasks |
| Language wording | Owner comprehension and review by fluent Filipino speakers |
| Browser support | Actual devices and browsers used by the intended owners |

Validate owners' language preferences, devices, accounting knowledge, and connectivity; do not assume uniform needs.

## Research capture template

For each selected reference or observation, record:

- **Reference:** URL, screenshot or local asset, and date inspected.
- **Relevant task:** What the owner is trying to complete.
- **Observed pattern:** Specific navigation, spacing, form, review, or feedback behavior.
- **Reason to consider it:** How it may help this task.
- **Evidence:** User preference, observed task result, or an explicitly labeled hypothesis.
- **Constraints:** Small-screen behavior, text expansion, keyboard, connectivity, accessibility.
- **Proposed application:** Named screen or reusable component affected.
- **Decision status:** Candidate, selected by user, provisionally implemented, or superseded.

Describe what to learn from a reference. Do not copy proprietary branding, assets, or an unrelated dashboard wholesale.

## Turn evidence into components

1. Read the selected references and identify the task they improve.
2. Map the task onto capture, review, confirmation, saving, and period inspection.
3. Define replaceable tokens for spacing, typography, color, radius, and emphasis.
4. Apply the decisions to reusable controls such as amount input, transaction item, document review, language switch, and save status.
5. Test one complete flow on phone and laptop. Record observed problems before expanding the pattern.
6. Update the design decision record when the user supplies new evidence; retain the reason for substantive changes.

## Functional UI requirements

- Preserve entered values, attached documents, workflow step, and validation context when switching languages.
- Translate navigation, instructions, errors, loading states, empty states, and save/sync feedback. Preserve user-entered text and official identifiers.
- Keep PHP and the business timezone independent of language selection. Store canonical values separately from their translated labels.
- Adapt presentation to screen size: readable phone interactions and useful wider review views. Do not force large tables into an unusable phone layout.
- Provide visible labels, keyboard access, visible focus, adequate contrast, comfortably sized touch controls, and status text alongside color. Validate the complete interface; a component library alone does not establish accessibility.
- Keep review status separate from synchronization status. Show only the save state actually achieved.
- Preserve work after recoverable errors. Put actionable explanations beside relevant fields.
- Keep source images accessible during correction and make missing or uncertain extracted values visible.

## Handoff to implementation

Deliver selected references, design decisions, reusable component requirements, both-language copy, responsive behavior, and observed usability issues. Mark unresolved items explicitly. Report what was inspected and tested without presenting proposals as owner-validated findings.

## Implementation references

- [Next.js project organization](https://nextjs.org/docs/app/getting-started/project-structure)
- [next-intl App Router guidance](https://next-intl.dev/docs/getting-started/app-router)
- [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [Tailwind browser compatibility](https://tailwindcss.com/docs/compatibility)

Recheck version-sensitive documentation during implementation.
