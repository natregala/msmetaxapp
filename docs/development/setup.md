# Local setup

Run all commands from the project root.

## Install and start

Requires Node.js 22 or newer and npm. The implementation was tested with Node 24.21.0 and npm 11.19.0; dependencies are pinned in the lockfile.

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Edit .env.local with the project's URL and publishable key.
npm run dev
```

Open [localhost:3000](http://localhost:3000).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key for that project |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Optional server-only Azure endpoint for notebook extraction |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Optional server-only Azure credential; never prefix with NEXT_PUBLIC_ |

This workspace already has an ignored `.env.local` connected to the separately authorized **CSSprint MSME** project in Singapore (`ffrrwnoctodgfuravmvg`). The versioned migrations and additive safeguards are installed there; see [migration notes](migration-notes.md). The other connected website's project was not modified.

Keep local environment files out of commits. `.env.example` contains only blank variable names. Never put a service-role or secret key in a `NEXT_PUBLIC_` variable.

## Connect another environment

Apply the versioned migrations in `supabase/migrations/` in filename order to the intended empty application schema. Set that project's URL and publishable key in local configuration. Discover flags for the installed CLI with `npx supabase --help`; the [database contract](../../supabase/README.md) documents the operations, grants, and ownership checks.

The separate [account-free demo](demo-deployment.md) is published on Vercel and uses synthetic browser-only data. Deploying the real authenticated application still requires its own verified provider variables, redirects, and cloud workflow checks. Keep the unrelated website's project untouched.

Configure Supabase Auth's allowed redirect URLs for each verified environment: `/api/auth/callback?flow=confirm` and `/api/auth/callback?flow=recovery` under the exact app origin. Recovery links use a browser-bound PKCE code; expired, invalid, or different-browser links must be requested again. Actual SMTP/email delivery remains unverified.

The OCR adapter is optional. Leaving both Azure values blank keeps the clearly labeled manual notebook review workflow available. Do not create or incur charges for a provider without authorization. Supported layout, consent and limits are in [notebook review](../product/notebook-review.md).

## Sign in

Create an account with the form or provision a test account through the intended project's Auth dashboard. Keep email confirmation enabled. A project's built-in email service may restrict recipients; configure and verify SMTP before inviting outside users.

Existing automated checks use synthetic confirmed fixtures without sending email. Their credentials stay in ignored local files. Follow [testing instructions](testing.md) when preparing those accounts for an isolated test project.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the production app |
| `npm start` | Serve an existing production build |
| `npm run typecheck` | Check TypeScript |
| `npm run lint` | Run ESLint |
| `npm test` | Run local rules/storage/service/database tests |
| `npm run test:e2e` | Run configured browser and hosted API checks |

See the [project map](project-structure.md) to find implementation files and the [verification record](verification.md) for checks already executed.
