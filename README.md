# Filipino MSME business records

Current import: the mobile UI redesign is a work in progress, saved at the user's request before the remaining fixes. See [UI checkpoint and open issues](docs/development/ui-checkpoint-2026-10-23.md). Earlier verification records do not certify this unfinished redesign.

A phone-first English/Tagalog app for microbusiness recordkeeping and reviewable preparation, targeting a proposed Quezon City pilot. The exact pilot boundary and first business segment remain research decisions. Built with Next.js, TypeScript, and Supabase.

Owners can set up a business, park multiple drafts, record and maintain sales/expenses and linked payments, review notebook entries, find records, and export an exact period package. English/Tagalog, source history, owner isolation, and duplicate-safe retries remain explicit. See [implemented scope and limits](docs/product/README.md).

## Share the demo

Open [cssprint-msme-demo.vercel.app](https://cssprint-msme-demo.vercel.app) without an account. It uses sample records saved only in each visitor's browser. Use **Reset demo** to start over. The authenticated app and real financial records remain separate. See [demo scope, deployment and checks](docs/development/demo-deployment.md).

## Start here

- **Run the app:** [local setup](docs/development/setup.md)
- **Find or change a file:** [project map](docs/development/project-structure.md)
- **Understand the screens:** [guided workflows](docs/product/guided-workflows.md)
- **Find, maintain, and export records:** [records and preparation](docs/product/records-and-preparation.md)
- **Review notebook photos:** [notebook workflow](docs/product/notebook-review.md)
- **Check resolved gaps:** [implementation matrix](docs/development/IMPLEMENTATION_GAP_AUDIT.md)
- **Work on the design:** [design guide](docs/design/README.md)
- **See actual test results:** [verification record](docs/development/verification.md)
- **Browse all documentation:** [docs index](docs/README.md)

## Run locally

Requires Node.js 22 or newer and npm.

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Set the Supabase URL and publishable key in .env.local.
npm run dev
```

Open [localhost:3000](http://localhost:3000). This workspace already has local configuration. Environment files and test credentials are excluded by `.gitignore`; only the blank `.env.example` belongs in the repository.

## Folder map

| Folder | What belongs here |
| --- | --- |
| `src/` | App screens, feature logic, translations, and integrations |
| `public/` | Assets served by the app, including runtime brand SVGs |
| `assets/brand/` | Original logo artwork and exports |
| `supabase/` | Versioned database migrations and database contract |
| `tests/` | Automated rules, storage, service, database, and browser checks |
| `scripts/` | Development/test fixture helpers |
| `docs/` | Product contracts, design direction, setup, and verification |
| `.agents/` | Project skills and canonical planning/decision references |

The root keeps application configuration and [agent instructions](AGENTS.md). The original planning pack is preserved in a dated [archive](docs/archive/project-pack-2026-10-22/README.md). Generated dependencies, build output, local credentials, and test artifacts stay on this computer and are ignored.

## Development checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Browser tests require isolated synthetic accounts and a running app. See [testing instructions](docs/development/testing.md) before running them. The [verification record](docs/development/verification.md) distinguishes executed checks from open validation.

## Project status

Implemented: persisted short setup; multiple account/business-scoped drafts; full, partial, unknown and later payments; correction/void history; searchable paginated records; exact period summaries; immutable/stale reports; CSV and print; private notebook capture/manual review; separate evidence-based preparation; password-recovery integration; and a production public offline shell for device drafts.

Live automatic reading requires configured server-only Azure credentials and remains unverified. Tax-specific calculations are blocked until applicable rules and evidence are validated. Real email delivery, physical-phone testing, fluent Tagalog/owner review, and practitioner validation remain outstanding. A separate account-free browser demo is published on Vercel; it simulates saves locally and does not expose real accounts or records. The authenticated cloud workflow has not been verified on Vercel. This repository import does not update the demo deployment or constitute a real-data production launch or hackathon submission.

Visual direction follows [STYLES.md](docs/design/STYLES.md) and the [UX debrief](docs/design/UX_REDESIGN_BRIEF.md); final branding remains open. This is original project work with AI development assistance. Manual entry uses no AI processing. Dependencies and their exact versions are recorded in `package.json` and `package-lock.json`.

The supplied GitHub/initial README deadline is **8:00 PM sharp**, with event date unconfirmed.
