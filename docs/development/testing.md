# Automated checks

Run commands from the project root after [local setup](setup.md).

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs deterministic rules, draft storage, HTTP/service tests, and embedded PostgreSQL integration tests. Provider calls are mocked in service unit tests; PGlite executes the PostgreSQL policies and transactions. It is not a full local Supabase stack and has one connection.

To target database tests, use `npm run test:database`. The [database contract](../../supabase/README.md) describes that suite's boundaries.

## Browser and hosted API checks

The Playwright suite uses a running local app and its real Supabase connection. It creates clearly named synthetic businesses and records in that project and retains them as evidence. Use a dedicated non-production project.

1. Run `node scripts/prepare-e2e-accounts.mjs` to prepare two explicitly synthetic confirmed accounts. It refuses to replace existing credentials.
2. Apply the generated, ignored `.test-data/auth-fixtures.sql` only to that isolated project. Credentials remain in ignored `.env.e2e`. No email is sent.
3. Run `node scripts/prepare-guided-e2e.mjs` for an additional fresh first-use owner. Apply its ignored `.test-data/guided-auth-fixture.sql` to the same isolated project. Fresh owner references remain in `.env.guided-e2e`; original credentials are preserved.
4. Install Chromium with `npx playwright install chromium`, start the app with `npm run dev`, then run `npm run test:e2e` in another terminal.

Regenerate the guided fixture when checking an owner with no previous businesses. Tests skip when their required fixture credentials are absent. Never apply synthetic Auth fixtures to a live customer project.

Screenshots, reports, and fixture output are ignored. Repeated runs create new synthetic workspaces; do not confuse them with owner research or production records.

The completion/recovery suite uses an additional isolated fixture. Run `node scripts/prepare-completion-e2e.mjs` once and apply ignored `.test-data/completion-auth-fixture.sql` only to the isolated project. It refuses to replace existing credentials; no email is sent. Its local values remain in ignored `.env.completion-e2e`.

Actual service-worker tests require production mode. To avoid disturbing a development server, use separate terminals:

```powershell
$env:MSME_BUILD_DIR = ".next-offline-check"
npm run build
npm start -- --port 3001
```

```powershell
$env:E2E_BASE_URL = "http://localhost:3001"
$env:E2E_PRODUCTION = "1"
npm run test:e2e
```

The alternate build directory is ignored and excluded from lint. Run the ordinary build afterward to restore the default generated Next.js type references. Simultaneous isolated Playwright invocations should use separate output folders; the final suite should run serially to avoid artifact cleanup races.

The confirmation-required/request-success browser branches use explicitly mocked Auth HTTP responses and do not establish real email delivery. Invalid-link callbacks use the actual app route; password-change capability checks are covered separately with a mocked provider. Notebook tests use real private Supabase Storage and manual source review; Azure transport tests are mocked and do not establish live OCR.

## Evidence

[verification.md](verification.md) records commands actually executed, their results, the environments used, and material limitations. Instructions here describe how to run checks; they do not establish that a new run passed.
