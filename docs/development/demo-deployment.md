# Shareable demo without accounts

Published 23 October 2026: [cssprint-msme-demo.vercel.app](https://cssprint-msme-demo.vercel.app).

The link opens directly at Home with a clearly labeled sample Quezon City store. No app account or Vercel login is needed. Visitors can try bilingual sale/expense entry, payments, corrections, reports/CSV, notebook photo/manual review, and preparation screens.

## What the demo saves

The demo simulates the application workflows using a separate browser IndexedDB database. Sample records and photos stay in that browser. Reloading preserves them; a different browser starts independently. **Reset demo** replaces the visible sample workspace with a new synthetic owner/business scope. It does not change the real database or another visitor's work.

Use sample information only. Browser storage is not a cloud backup and may be cleared or unavailable. Automatic OCR and tax calculation/filing/payment remain unavailable. A demo save is not real financial acceptance, private cloud upload, or tax preparation approval; the banner, statuses, report coverage, and CSV identify the simulation.

The ordinary authenticated application remains available when the demo flag is false. Its Auth, RLS, private Storage and server acceptance rules remain required. The demo client never falls through to the real API, and server provider configuration is disabled when the demo flag is true, even if provider variables are present.

## Deployment identity

- Separate Vercel project: `cssprint-msme-demo`, `prj_E3uprIXsokq8Y6b6Ybf868pXQjyQ`.
- Deployment: `dpl_5ZYi2C6qERfAncEL3KmhhgfHp7Gt`, provider state `READY`.
- Immutable deployment URL: [cssprint-msme-demo-ehsyyvcxq-jim-faf9.vercel.app](https://cssprint-msme-demo-ehsyyvcxq-jim-faf9.vercel.app).
- Public alias: [cssprint-msme-demo.vercel.app](https://cssprint-msme-demo.vercel.app).
- Node 24.x, Next.js, `npm ci`, `npm run build`.
- Only configured demo variable: `NEXT_PUBLIC_DEMO_MODE=true` for this separate project.
- Uploaded 95 allowlisted source/config/public files; no local env, private data, fixtures, tests, build artifacts, or dependency directories.
- Source bundle SHA-256: `247b65122e0533d1c4b155b004cf3bc3a8c8b88caa98d0e45284ff6fd561199b`.

Source deployment used the authorized Vercel connector. No Git initialization, commit, or push was needed or performed. The repository is not implicitly linked to this demo project. `scripts/prepare-demo-deployment.mjs` writes a source allowlist manifest to ignored `.vercel/`; it does not deploy by itself.

The public environment flag is baked into the browser bundle. Change it deliberately and rebuild; a URL query cannot switch this deployment into the real application. A future authenticated cloud deployment also needs its own verified provider variables and environment checks.

## Local demo and tests

```powershell
$env:NEXT_PUBLIC_DEMO_MODE = "true"
$env:MSME_BUILD_DIR = ".next-demo"
npm run build
npm start -- --port 3002
```

In another terminal:

```powershell
$env:E2E_DEMO = "1"
$env:E2E_BASE_URL = "http://localhost:3002"
npx playwright test tests/e2e/demo.spec.ts tests/e2e/demo-documents.spec.ts
```

Leave `NEXT_PUBLIC_DEMO_MODE` false/unset for normal authenticated development. Clear the temporary build variable and run the standard build afterward to restore default generated type references. Demo browser tests skip unless explicitly enabled.

## Actual verification

- 248 local tests passed across 30 files, including demo exactness, replay, simulated document acceptance, IndexedDB persistence/rollback/reset isolation, zero real-network fallback, and ordinary HTTP transport.
- Typecheck and lint passed; ordinary and demo production builds passed.
- Three local entry/report/reset browser tests and one local notebook browser test passed.
- All four browser tests passed again on the public Vercel alias, using fresh sessions with no authentication. They checked mobile language preservation, saved entry reload, exact partial/later payments and history, summary/CSV, independent browsers, reset, and photo/manual review/source reload. Network interception observed zero API/Supabase requests in those journeys.
- Anonymous HTTPS returned 200 for the app; direct real ledger API access returned 503 `NOT_CONFIGURED` without data, both locally and on Vercel.
- Actual published phone Home and laptop notebook screenshots were visually inspected; additional phone/Tagalog/report screens were inspected during local verification. Artifacts remain ignored under `test-results/`.

The first local notebook assertions encountered wording from an earlier local build; assertions were aligned to the stable save phrase and locked state. The final public run used the published source and passed. A downscaled report screenshot suggested an old revision; stronger assertions confirmed revision 2 and two history entries, with no engine defect. Build-log inspection through the connector returned scope-access 403, but deployment status and public HTTP/browser checks were available and passed.

These checks do not establish real email delivery, live OCR quality, real-device/fluent Tagalog/owner validation, practitioner approval, or a production restore rehearsal. No Supabase migration or real financial-data write was performed for this demo task.
