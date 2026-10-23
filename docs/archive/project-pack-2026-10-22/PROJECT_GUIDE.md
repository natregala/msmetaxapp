# MSME project context and agent skills

Prepared: 22 October 2026, Asia/Manila.

This pack captures the current product intent, technical direction, code organization, data rules, and reusable development workflows. It does not contain an implemented website, selected visual identity, live credentials, validated tax engine, or deployment.

## Contents

- AGENTS.md: concise instructions for agents working in the repository.
- .agents/skills/: eight focused skills, each with SKILL.md and optional host UI metadata.
- msme-project-foundation/references/: seven canonical context/reference documents.
- This guide: reading order and integration guidance.

## Read in this order

1. Product context: confirmed user priorities, working proposals, and limits.
2. Architecture and conventions: feature modules, responsibilities, and contracts.
3. Workflow and collection map: what to collect and how each input is used.
4. The reference and skill relevant to the immediate task.
5. Visual research handoff when the user supplies appearance/interaction research.

Keep the record contracts and acceptance reference available for any changes affecting financial state, ownership, synchronization, or reports.

## Use in a project repository

Merge AGENTS.md with any existing repository instructions. Keep the .agents/skills folder structure intact so sibling reference links resolve. Preserve the existing application README and project configuration.

OpenCode's current documentation supports project skills in .agents/skills/<name>/SKILL.md and root AGENTS.md instructions. It loads skills on demand; referenced files still need to be read. Other agents may use the same files through their skill mechanism or explicit file reads. Verify discovery in the actual tool.

The agents/openai.yaml files supply optional display metadata; the Markdown instructions and references remain the portable content. Do not install duplicate copies under multiple discovery paths.

Official compatibility references: https://opencode.ai/docs/skills/ and https://opencode.ai/docs/rules/ (checked 22 October 2026).

## Start an implementation session

Ask the coding agent to read AGENTS.md, load msme-project-foundation, inspect the repository, and complete the specific requested feature using the relevant skill. Have it report actual verification and open questions.

Example request:

> Read AGENTS.md and use msme-feature-development with msme-supabase-data to implement manual transaction entry. Inspect the existing code first. Keep visual styling provisional, preserve English/Tagalog behavior, and verify persistence and business isolation.

For visual research:

> Read the visual-research-handoff reference. Inspect these selected references and record the patterns relevant to our owner's tasks. Keep unselected branding decisions open.

For document work:

> Use msme-document-intake to implement source-linked notebook-row review. Keep ambiguous values unresolved and reuse the existing record-confirmation operation.

These examples are future task prompts, not evidence that any work has already happened.

## What remains open

Final name/branding, palette/type/layout references, exact owner segment/community, supported notebook layouts, login method, OCR provider, package versions, broader offline synchronization, and the fully verified tax calculation path.

Make progress on independent work while research continues. When the user requests interface implementation, make accessible provisional choices and record them. No blanket design-approval gate is imposed.

## Maintain the pack

Update the canonical references when decisions change. Keep task evidence separate from proposals. Read current provider documentation before version-sensitive implementation. Regenerate any distributed Markdown bundle from the canonical files; do not maintain two conflicting copies.

At creation, project-scoped files were produced. Global skill installation was not completed because automatic approval review blocked modification of the global agent configuration directory. This does not prevent using the files in an authorized project repository.

## Validation of this instruction pack

All eight skill definitions passed the skill frontmatter/name validator. Local reference links and display metadata were checked. Three independent scenario walkthroughs applied the written skills to offline/account races, unfinished bilingual forms, and incomplete document/tax inputs; useful clarifications were incorporated. These are instruction-pack checks, not application tests, user research, or tax validation.

