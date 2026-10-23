# Original version-one manual transaction entry contract

Implemented 23 October 2026 (Asia/Manila). This documents the preserved version-one create operation and legacy pending commands. Current new entries and maintenance use the additive [ledger lifecycle](ledger-lifecycle.md) and [records/preparation workflow](records-and-preparation.md), including partial/later payments and correction/void history. The create-only limits below apply to v1, not to the whole current app.

Owners now start from a task home and use dedicated sale/expense steps. Business setup, activity, rename, and automatic scoped drafts are documented in [guided workflows](guided-workflows.md). Only legacy version-one acceptance uses the create-only contract below; its pending commands keep their original payloads. Current financial maintenance uses the linked ledger contract above.

## HTTP boundary

All successful responses are `{ok:true,data:...}`; rejected responses are `{ok:false,error:{code,fields?}}`. Provider error text is not exposed. Authenticated responses include `Cache-Control: private, no-store` and `Vary: Cookie`.

| Operation | Endpoint | Payload / result |
| --- | --- | --- |
| Session | GET `/api/session` | `{user:{id,email}|null}` |
| Sign in / up | POST `/api/auth/sign-in`, `/api/auth/sign-up` | `{email,password}`; user or confirmation required |
| Sign out | POST `/api/auth/sign-out` | `{}`; local session signed out |
| List businesses | GET `/api/businesses` | `{businesses:[{id,name}]}` |
| Create business | POST `/api/businesses` | `{id,name}`; stable client-generated UUID |
| Guided business setup | POST `/api/businesses` | `{id,name,activity}`; atomic setup and retry receipt |
| Rename business | PATCH `/api/businesses` | `{id,name,expectedRevision}`; owner-authorized profile update |
| Recent records | GET `/api/transactions?businessId=...` | `{records:[...]}`; most recent 50 |
| Confirm record | POST `/api/transactions` | command below; `{id,revision:1}` |

```json
{
  "businessId": "business UUID",
  "operationId": "stable operation UUID",
  "payload": {
    "version": 1,
    "businessDate": "2026-10-23",
    "kind": "sale",
    "amountCentavos": "125050",
    "description": "Synthetic example",
    "moneyMovement": "none",
    "reviewConfirmed": true,
    "expectedRevision": 0
  }
}
```

The signed-in user is taken from verified Auth, never from a request's claimed owner. Ownership is checked at the service and database operation. Database acceptance commits the record, revision, and mutation receipt together. An identical authorized replay returns its original acknowledgement; incompatible operation reuse returns `CONFLICT` (HTTP 409). Direct financial table writes are revoked, including for an owner.

## Meaning and state

`sale` permits `in`, `none`, or `unknown`; `expense` permits `out`, `none`, or `unknown`. Contributions, incoming loans, and incoming transfers permit `in` or `unknown`. Withdrawals, loan repayment, and outgoing transfers permit `out` or `unknown`. These labels preserve supplied meaning; the application computes no accounting profit or tax base. Partial movement requires a richer settlement contract and is outside this form.

Amounts never default to zero. A missing description is `null`; a missing amount/date/type cannot be accepted. Dates and PHP do not change when switching languages. Manual source, actor, UTC timestamp, and revision are retained. Existing-balance settlements are excluded pending explicit links to their original obligations.

Form edits are automatically saved after a short debounce and remain unsaved until the device write succeeds. Review navigation does not itself submit. Confirmation first durably stores the immutable command, then sends it. Only a validated server acknowledgement permits success and cleanup. Lost acknowledgements retain the original operation ID and payload; retries cannot edit that unresolved command. Authentication failure retains the draft for the original account. Server records are read again after acceptance; local success is not substituted for server state.

Business/account keys isolate IndexedDB drafts in normal application access. IndexedDB is readable by the same browser profile; this is not cryptographic protection against another person with local device access. No server history or authentication response is put in a service-worker cache.

## Provisional choices

One owner per business, email/password Auth, explicit foreground retry, a single current draft per account/business, create-only records, native controls and typed bilingual dictionaries. Final naming, typography, translation wording, and composition remain subject to research. No tax-specific rule is selected by these implementation choices.
