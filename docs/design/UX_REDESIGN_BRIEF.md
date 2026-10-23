# UX Redesign Brief: Guided Setup and Everyday Recordkeeping

## Goal

Redesign the app for Quezon City microbusiness owners who may have limited experience with digital financial tools. The product should guide owners through familiar business tasks rather than require them to understand a bookkeeping form. The exact pilot boundary and first business segment remain open research decisions.

The current screen is a useful inventory of data requirements, but it should not be the interaction model. Keep the underlying validation, source traceability, business isolation, exact monetary values, and save guarantees. Change when and how information is requested.

**Core requirement: collect information progressively, at the moment it becomes necessary.**

Do not merely divide the existing long form into several pages with the same technical labels. Organize each step around a question the owner understands.

## 1. Separate three journeys

| Journey | Purpose | When it happens |
| --- | --- | --- |
| Initial setup | Identify the business and help the owner begin | First sign-in, or when adding a business |
| Everyday recording | Record a sale, an expense, or review a supported document | Whenever the owner performs that task |
| Tax preparation | Establish the supported tax profile, period history, and draft requirements | When the owner asks to prepare a tax draft |

An incomplete tax profile must not prevent basic recordkeeping. Completing app setup must never be presented as BIR registration or proof of compliance.

## 2. First-time experience after sign-up

Retain the language chosen before registration. Keep the English / Tagalog control visible without making language selection an additional mandatory screen.

### Screen 1 — Name the business

**Question:** “Ano ang pangalan ng negosyo mo?”

Show one clearly labeled input, a short example, and a primary **Magpatuloy** button. Avoid a marketing hero, account-management panel, tax questions, and an empty dashboard on this screen.

Explain that the name can be changed later. Preserve the answer when navigating back or switching languages.

### Screen 2 — Understand the activity

**Question:** “Ano ang ginagawa ng negosyo mo?”

Use large text-labeled choices for selling products, providing services, both, and another activity. An optional familiar example can help explain each choice.

Use this answer to tailor examples and available prompts. Do not infer a tax regime from it.

Collect location here only if a defined pilot boundary genuinely requires it. Otherwise defer it; do not request a full address merely to begin recording.

### Screen 3 — Begin a useful task

**Question:** “Ano ang gusto mong unahin?”

Offer the supported tasks: **Itala ang benta**, **Itala ang gastos**, and **Kunan ng larawan ang notebook**. Include **Mamaya na** as a secondary path to a simple home screen.

Only display a working action as available. Do not lead owners into a document-capture flow that is not implemented.

Do not place pricing selection, a full business profile, optional preferences, tax documents, or a product tour between sign-up and this first useful action unless genuinely necessary.

**First-time path:** Sign up → business name → business activity → first useful task.

Initial setup is separate from transaction entry. Returning owners resume their unfinished task or see the home screen; they do not repeat onboarding.

## 3. A simple home screen for returning owners

The home screen should answer: “What can I do now?” and “What needs my attention?”

Show the business name, a small number of clear task actions, and a short, relevant summary. Use **Itala ang benta**, **Itala ang gastos**, and the supported notebook-capture action instead of one unexplained plus symbol.

Show a review task only when one exists. Show recent records after records exist, without letting them crowd the main actions. Label summary figures by period and meaning; do not label cash movement as profit.

Move account switching, adding another business, and sign-out into an account or business menu. They should remain accessible without competing with the owner's current task.

Tax preparation can have a clearly labeled entry point, but it should not interrupt ordinary recording or appear as a mandatory setup warning.

## 4. Make record entry task-based

When an owner selects **Itala ang benta**, the app already knows the task. Do not ask the owner to choose “Uri ng tala” again.

Use a few short, meaningful steps. Group closely related details; do not turn every checkbox into a separate screen.

### Example: recording a sale

| Step | Owner-facing question | Screen content |
| --- | --- | --- |
| 1 | “Magkano ang benta?” | Amount entry and a clearly displayed, editable date defaulting to today |
| 2 | “Bayad na ba ito?” | Supported payment-status choices, followed only by relevant details |
| 3 | “Tama ba ang mga detalye?” | Plain-language summary, visible edit actions, and **I-save ang benta** |

Put nonessential notes or payment-method detail behind **Magdagdag ng detalye** when they are not required for the selected operation. Do not hide information needed for correct classification or calculation.

An expense follows its own wording and rules. Avoid sending both tasks through an identical generic accounting form.

### Preserve financial meaning

Do not silently assume a sale has been paid. A sale, an expense, a payment against an earlier balance, and an owner's contribution remain different events internally.

Only offer confirmed workflows the application actually supports. If unpaid or partially paid transactions are unsupported, explain that at the relevant choice and preserve the unfinished entry. Do not turn it into a paid sale or include an unresolved entry in confirmed totals.

A payment against an earlier balance requires the appropriate linked record. Removing confusing controls must not remove that distinction.

### After saving

Show a short summary and an honest save state. Offer **Magdagdag ulit** and **Bumalik sa simula**. Do not leave the owner wondering whether the button worked or whether another click will create a duplicate.

A local draft is not a server-accepted record. Use wording that makes the difference visible.

## 5. Give notebook capture its own guided flow

Use: select or take a photo → inspect image quality → process → review extracted entries → confirm.

Explain what should be photographed, retain the original image, and let the owner correct uncertain fields. Do not put the complete manual-entry form underneath the upload control.

On a phone, make reviewing a row and its source manageable. On a laptop, use the extra space for a side-by-side view. In both layouts, owners must be able to inspect what they are accepting.

Uncertain extraction remains unresolved rather than being guessed or silently accepted.

## 6. Collect tax information when the owner requests tax preparation

Introduce a separate guided journey explaining why the additional information is needed.

Collect the applicable registration information, current-year profile evidence, reporting period, prior-period figures, and required form identifiers progressively. Allow **Hindi ko alam** where appropriate and explain how to resolve uncertainty.

Ask later questions only when earlier answers make them relevant. A skipped or unknown answer is not the same as “No” or zero.

Keep tax-specific outputs unavailable when required inputs or the calculation path are unverified. Continue allowing ordinary recordkeeping and appropriate record exports.

Do not display “BIR compliant” or equivalent assurances because the setup steps are complete. Preparation, filing, payment, and acknowledgment remain distinct states.

## 7. Screen and interaction requirements

### Focus and wording

Give each step one main question, a clearly labeled primary action, and a predictable back action. Supporting information should help answer that question.

Prefer familiar task wording over internal field names. For example, ask “Bayad na ba ito?” where that is the actual question instead of presenting “Galaw ng pera” as an unexplained classification.

Keep help short and contextual. Offer deeper explanation on demand, but keep critical limitations and errors visible when they matter.

Show progress within the current task. A three-stage indicator must not disguise a first stage containing most of the form.

### Preserve work

Going back, changing language, retrying a failed request, or restoring a draft must preserve the owner's entries and attachments according to the supported persistence behavior.

Automatically preserve transaction drafts on the device where supported. Clearly distinguish **Naka-save sa device**, **Hinihintay ang koneksyon**, and **Naka-save sa account** based on actual state.

Use the approved account-isolated local-storage behavior. Do not extend transaction-draft storage to sensitive tax identifiers without a separate privacy decision.

Keep review status and synchronization status separate internally.

### Layout and accessibility

Use large, text-labeled controls, readable text, visible focus, and sufficient space. If a primary action is fixed near the bottom, it must not cover fields, validation, or the mobile keyboard.

Retain the working skip-to-content link. In the supplied capture it overlaps form content; check its focused placement rather than removing the accessibility feature.

Use laptop width for helpful context, not for exposing every setup question at once.

### Visual direction

Keep the warm, slightly yellow off-white background, forest-green controls, mango accents, and selected folder mascot. Use the mascot sparingly in welcome, guidance, and success states.

Remove repeated marketing headlines, unrelated tips, and decorative cards from focused entry steps. Visual warmth should support the task rather than lengthen it.

Use meaningful, explicitly synthetic examples in demos. Do not leave test identifiers or extreme test amounts as the default owner-facing experience.

## 8. Implementation boundaries

Treat this as an interaction-flow refactor, not a request to replace the agreed stack or weaken data safeguards.

Keep initial setup, record entry, document review, and tax preparation as distinct workflows. Maintain one underlying record-entry draft across its steps. Map plain-language answers into the existing structured data model in the application layer.

Validate the current step before advancing, then validate the complete operation on the server before accepting it. Preserve authorization, RLS, source links, correction history, exact monetary values, and idempotent submission.

Store initial-setup completion separately from tax-profile verification. Derive any tax-preparation readiness from the actual evidence and period requirements.

Do not expose an action as working merely because its button or screen exists.

## 9. Acceptance criteria

The redesign is ready for owner testing when:

1. A first-time owner can reach a useful recording task without completing a tax profile or navigating account-management controls.
2. Each step has an obvious next action, and selecting a task removes redundant questions.
3. Back navigation and English / Tagalog switching preserve unfinished input.
4. A sale can be reviewed and saved through the supported short flow, with clear recovery from a failed request.
5. Save messages accurately distinguish a local draft from an account record; retrying does not duplicate records.
6. Returning owners are not forced through initial setup again.
7. Unsupported cases are explained without incorrect classification, discarded work, or invented tax outputs.
8. The flow is usable on representative phones with the keyboard open, and on laptops without unnecessary information exposure.

Observe intended owners completing the flow without coaching. Record hesitation, mistaken taps, requests for help, and completion; do not treat polished screenshots or a successful developer walkthrough as proof of usability.

**Success means the owner understands the current question, the next action, and whether the record was saved—not merely that all fields are present.**

---

Basis: the supplied implementation screenshot, the project's earlier guided-onboarding and review requirements, and the latest user direction toward a Quezon City pilot. This is a redesign specification, not an audit of unseen routes or repository code. Use alongside STYLES.md: that file governs the visual system; this brief governs the interaction flow.
