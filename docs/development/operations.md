# Operational readiness and remaining dependencies

The implemented target is a proposed Quezon City pilot. This is developer verification using synthetic data, not evidence of owner demand, tax validation, or production readiness.

## Authentication and privacy

Supabase verifies account identity on server boundaries. Record, payment, document, profile, snapshot and export access is business-owner scoped. Sensitive provider credentials remain server-only. Authenticated API/document/export responses are private and uncached.

Sign-up confirmation and password-recovery requests use Supabase Auth; callback code exchange and verified current identity gate password changes. Recovery links expire and are browser-bound. A successful request is not evidence of delivered email. Configure allowed redirects and an SMTP provider, then verify delivery with an authorized recipient before external testing. That live delivery check remains outstanding.

Device drafts and capture images are readable within the same browser profile, not cryptographically isolated from someone with device access. Signing out clears the active offline workspace pointer while preserving scoped unfinished work. Offline drafts are not a cloud backup. Shared-device owners should finish synchronization, sign out while connected, and use separate browser/device profiles for private work.

## Offline and reconnect behavior

The production service worker caches only an account-independent offline shell, static application resources and public brand assets. It does not cache Auth/API responses, private source images, recovery pages or tax identifiers. An established workspace can reopen and create device drafts offline. Server history, source upload, extraction, reports and acceptance still require connectivity and authorization.

Only immutable commands already reviewed by the owner are eligible for foreground retry when the app resumes or reconnects. Local drafts never become submitted simply because connectivity returns. Owner/session checks, original operation identities, runtime acknowledgement validation and scoped cleanup remain required.

Browser storage can be unavailable, full, cleared or evicted. Failed writes must remain visibly unsaved; relevant navigation waits for persistence or blocks, with in-memory original-owner recovery while the page remains open. Closing the browser can lose unsaved memory. CacheStorage failure must not break successful online application loading.

## Retention, deletion, and recovery

Accepted financial records use correction/void history, not hard deletion. Source originals, extraction/review history and report snapshots remain retained; no destructive owner deletion UI was added. A pilot retention schedule, deletion-request verification, access removal and lawful evidence retention need a documented operator decision before real data is collected.

Backup/restore procedures remain untested operational work. Database backups do not by themselves prove that private Storage objects can be restored. Before real use, establish separate database and source-object backup coverage, retention, authorized operator access, a restore rehearsal in a separate environment, and reconciliation of source/record/snapshot references. Do not reset or restore over this app's existing records as a demonstration.

The automated PostgreSQL suite verifies atomic rollback and disk reopen of its isolated embedded database. It is not a managed Supabase disaster-recovery rehearsal.

## Deployment and external dependencies

- The separate [public browser demo](https://cssprint-msme-demo.vercel.app) is deployed and verified without app/Vercel login. It uses only simulated browser-local data; no provider credentials or live financial backend are configured. See [deployment identity and checks](demo-deployment.md). The real authenticated cloud workflow still needs its own Vercel environment verification. Earlier explicit-scope project creation and later build-log inspection returned 403; project creation/deployment through the connector default scope and public verification succeeded.
- Azure extraction is integrated behind a server adapter but both required credentials are absent. Camera/file capture, private upload and manual row review work without pretending that OCR ran. No paid provider was provisioned and no live extraction accuracy is claimed.
- Tax-specific calculations remain blocked pending applicable official rules, supported evidence and review. Useful record/preparation packages continue to work.
- Physical-phone testing, fluent Tagalog review, owner usability research, practitioner review, SMTP delivery, source retention decisions and disaster recovery remain outstanding.
- The hosted security advisor retains the leaked-password-protection warning. Private audit/receipt tables intentionally have RLS and no client policies/grants. No plan upgrade or Auth configuration change was silently made.

## Cost and support

Subscriptions and pricing remain hypotheses. There is no billing integration or paid entitlement enforcement. Cost drivers include database compute/storage, private image storage and egress, OCR page requests/polling, email delivery, hosting and operator support. No demand, willingness to pay, price or paid plan is asserted.

For a pilot, nominate an operator for account access, failed-upload reconciliation, unknown payment dates, stale reports, privacy requests and incident response. Keep logs free of credentials, image contents and unnecessary identifiers; diagnose with stable operation references and authorized metadata.
