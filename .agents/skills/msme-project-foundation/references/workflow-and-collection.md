# Workflow and progressive data collection

Status: proposed product flow. Collect the minimum information for the requested operation and explain its purpose. Do not make complete tax onboarding a prerequisite for basic record organization.

## Collection map

| Stage | Collect or establish | Use the information for | Preserve gaps and limits |
| --- | --- | --- | --- |
| First use | Preferred language and intended task | Readable onboarding and next action | Let the user change language without losing work |
| Account | Minimum data required by the selected sign-in method | Authentication and recovery | Login method is still open; do not collect unrelated identifiers |
| Business | Display name, relevant activity, ownership/membership, only location detail needed by the task | Associate records and understand the owner's context | Do not infer tax status from rural location or business size |
| Starting point | Start date, existing record habits, import/manual preference, available coverage | Set expectations and avoid pretending missing history exists | Mark incomplete coverage explicitly |
| Period | Reporting period and relevant business dates | Filter, review, and reproduce totals | Keep date-only business events distinct from UTC timestamps |
| Document intake | Source kind, image/file, available date/coverage, business association | Select extraction/review behavior and preserve evidence | Keep unreadable fields and unknown meanings unresolved |
| Manual entry | Business date, description, exact amount, supported type, relevant money movement and source | Create a reviewable record | Ask for additional fields only when the selected type needs them |
| Credit/settlement | Link to earlier sale/obligation, relevant payment amount/date, minimum counterparty reference | Prevent recording settlement as a second sale | Preserve uncertain relationships for review |
| Owner/other movements | Supported contribution, withdrawal, transfer, loan, or correction meaning | Separate operations from sales/expenses | Do not invent accounting recognition or tax treatment |
| Review | Corrected fields, source comparison, duplicate decision, confirmation | Accept an explicit owner interpretation | Preserve original extraction, correction, actor, and revision |
| Daily work | New drafts, corrections, visible local/sync state | Continue the records with recovery | Define which operations are supported offline |
| Period inspection | Missing/unconfirmed rows, duplicate candidates, coverage gaps, corrections | Establish what the summary includes and what remains unresolved | A completed checklist does not prove legal compliance |
| Tax-specific request | Applicable taxpayer facts and evidence, relevant year/elections, supported obligation and form | Determine whether the verified path applies | Unknown or unsupported conditions gate only that automated output |
| Prior-period inputs | Needed opening figures, prior cumulative amounts, credits/payments, source evidence | Apply the supported period calculation correctly | Unknown is not zero; request only inputs required by the verified path |
| Form/export identifiers | Only identity, registration, address, and other fields required by the supported output | Populate the selected draft | Do not collect them just to record a sale |
| Draft report | User confirmation of coverage and unresolved inputs | Generate a traceable draft and checklist | Filing, acknowledgment, and payment require separate actual evidence |

This map is conceptual. Final field names, requirements, and tax-profile questions depend on validated scope and real owner research.

## System-generated information

Generate stable record and operation IDs, actor/business association, creation timestamps, versions, processing state, source references, retry status, and report input/rule versions. Do not ask owners to type these.

Generate an operation ID before the first submission, then reuse it on retries. Generate human-facing totals from accepted inputs and deterministic rules, with source links. Never generate a missing amount, prior payment, or tax election as an assumed fact.

## Useful outcomes from the data

- A reviewed record history with evidence and corrections.
- A period summary that states its coverage and unresolved information.
- Distinct cash-movement and other supported business views with accurate labels.
- A preparation checklist based on verified applicable requirements.
- A draft tax-specific output only when the profile, rule path, and necessary inputs are verified.
- Optional contextual explanations citing applicable sources and referencing authorized application data.

## Workflows and recovery

Manual entry and document confirmation converge on controlled record-acceptance operations. Offline drafts remain local until the server accepts them. A successful image upload does not confirm its extracted rows.

Keep originals and corrections traceable. Correcting a record invalidates or versions affected report drafts. Allow review of source evidence when a user questions a total.

Capture enough state to reopen unfinished work. Show actionable errors and preserve input. Provide manual entry when extraction is unavailable, and suitable record organization when tax automation is unsupported.

## Collection boundaries

Keep notebooks, identifiers, and generated documents private by default. Minimize data passed to AI or other processors. Explain the processing purpose and use permissioned/redacted or synthetic documents for evaluation and demos.

This pack does not supply a legal privacy notice, approved tax questionnaire, or validated form mapping. Research those for the actual supported deployment and document the evidence.

