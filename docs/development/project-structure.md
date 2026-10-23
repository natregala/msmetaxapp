# Project map

Start with the [root README](../../README.md) or the [documentation index](../README.md).

```text
CSSprint-Hackathon2026/
├── src/                 Application code
│   ├── app/             Next.js pages, API routes, and global styles
│   ├── features/        Auth, businesses, transactions, ledger, documents, preparation
│   ├── i18n/            English/Tagalog dictionaries
│   └── lib/             Shared integrations and utilities
├── public/brand/        SVGs served at /brand/...
├── assets/brand/        Original logo SVGs and PNG export
├── supabase/            Database contract and versioned SQL migrations
├── tests/               Automated checks
├── scripts/             Synthetic test-account preparation
├── docs/
│   ├── product/         Implemented workflows, contracts, and limits
│   ├── design/          STYLES.md and UX redesign brief
│   ├── development/     Setup, testing, structure, and verification
│   └── archive/         Original dated planning snapshots
├── .agents/             Project skills and canonical context
├── AGENTS.md            Repository instructions for coding agents
├── README.md            Human starting point
└── ...                  Standard framework, package, and check configuration
```

## Where to make a change

| Task | Start here |
| --- | --- |
| Screen composition or responsive layout | `src/features/transactions/components/`, `src/app/globals.css` |
| English/Tagalog wording | `src/i18n/` |
| Auth or business behavior | `src/features/auth/`, `src/features/businesses/` |
| Recording rules, drafts, or save workflow | `src/features/transactions/` |
| Record maintenance, linked payments, summaries and exports | `src/features/ledger/` |
| Notebook capture, private upload, extraction adapter and review | `src/features/documents/` |
| Separate preparation evidence and package | `src/features/preparation/` |
| HTTP transport | `src/app/api/` |
| Supabase integration/types | `src/lib/supabase/` |
| Database behavior | New versioned migration under `supabase/migrations/` and relevant tests |
| Visual guidance or UX requirements | [Design guide](../design/README.md) |
| Setup or verification instructions | This `docs/development/` folder |
| Project decisions or agent workflows | [.agents foundation references](../../.agents/skills/msme-project-foundation/SKILL.md) |

Routes remain thin; named feature services coordinate authorization and persistence, and pure rules handle deterministic decisions. Native controls, typed dictionaries, and React form state are used. Tailwind/shadcn, next-intl, React Hook Form, and TanStack Query are earlier recommendations, not installed functionality.

## What stays at the root

`package.json`, `package-lock.json`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, and `playwright.config.ts` support the tools in their standard locations. Keep them there. Local environment files stay at the root because Next.js and test helpers read them there.

## Local files excluded from Git

These can remain visible on disk while `.gitignore` excludes them from future ordinary staging:

| Path | Purpose |
| --- | --- |
| `node_modules/` | Installed dependencies; recreated with `npm ci` |
| `.next/` | Next.js build/development output |
| `.env.local`, `.env.e2e`, `.env.guided-e2e`, `.env.completion-e2e` | Local configuration and synthetic credentials |
| `.test-data/` | Generated synthetic SQL fixtures and local audit manifests |
| `test-results/`, `playwright-report/`, `coverage/` | Test artifacts |
| `*.tsbuildinfo` | Incremental TypeScript cache |
| `supabase/.temp/`, `supabase/.branches/` | Supabase CLI state |
| `.vercel/`, `*.log` | Local deployment state and logs |

Only the blank `.env.example` is intended for the repository. Preserve local credentials and drafts while organizing files. Generated folders will return when development tools run, so they are excluded rather than continually moved.

## Historical material

The [22 October pack](../archive/project-pack-2026-10-22/README.md) preserves original planning documents and its checksum-protected export. It is a historical snapshot. Current implementation contracts live in `docs/product/`; current decisions remain in `.agents/`.

Original artwork is in `assets/brand/`; the two SVGs the app actually serves remain in `public/brand/`. Keeping those separate avoids changing public URLs when arranging design source files.

## Account-free demonstration

`src/features/demo/` contains the explicitly synthetic browser-only ledger/document adapters, isolated IndexedDB state, and bilingual demo banner/reset. `src/lib/client/app-fetch.ts` selects the demo transport only for a build with `NEXT_PUBLIC_DEMO_MODE=true`; the default still uses authenticated HTTP services. See [published demo and verification](demo-deployment.md). The source packaging helper is `scripts/prepare-demo-deployment.mjs`; its output and deployment references stay ignored under `.vercel/`.
