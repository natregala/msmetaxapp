# Rural Microbusiness Bookkeeping & BIR Compliance Support

> **Status: Initial submission (ideation stage).** This README reflects the ideas and concepts from our 22 October 2026 ideation session. It is not a working prototype yet, and we will keep updating this repository throughout the hackathon.

**Team:** Funny Biz · 4 members · 3-day hackathon
**Members:** Chester Garcia, Nathaniel Regala, Siegfrid Santiago, Jim Luigi Tongcua
---

## 1. The idea in one paragraph

A guided bookkeeping and tax-preparation app for Filipino rural microbusiness owners who still keep handwritten records. The owner photographs a notebook page, checks and corrects the extracted entries, keeps recording new transactions (even offline), and at the end of the quarter gets a clearly labeled **draft BIR filing package** where every total can be traced back to its source entries and original notebook image.

## 2. The problem

Many microbusiness owners keep records in notebooks, receipts, informal expense lists, or *utang* (customer credit) records. When a filing period arrives, those records have to be reconstructed and connected to tax obligations, often with outside help. A form-filling tool only helps if the underlying records are complete and understandable, so we start from the records.

**Our working hypothesis** is that the hardest part is turning everyday records into something reviewable and linking it to the right tax task. We will test this by observing real owners rather than assume it.

Context supporting further investigation (it does not prove demand for our app): DTI's MSMED Plan 2023–2028 identifies technology and digitalization constraints for MSMEs, and NWPC reported a March 2026 bookkeeping and productivity training for 45 MSMEs in Gattaran, Cagayan.

## 3. Who it is for (initial scope)

For the hackathon we focus on **one complete workflow for one defined taxpayer profile**:

- Already BIR-registered, **non-VAT individual sole proprietor**
- Keeps handwritten records
- Current-year tax situation can be verified (for example, 8% option eligibility and election confirmed)
- Specific business type (e.g., tailoring or repair) and community to be chosen based on access to owners, usable sample records, and a qualified tax adviser

Out-of-scope cases (other employment or businesses, employees, withholding, exemptions, previous filing issues) get a clear explanation and a handoff, not an automated answer. **Unregistered businesses** are directed to official BIR/DTI registration guidance. Creating an account in our app is never presented as BIR registration.

## 4. Proposed user journey

1. **Establish the business profile.** Short, plain-language onboarding with an explicit "I'm not sure" option. Optionally upload a Certificate of Registration (COR) to prefill details for the owner to confirm. Output: a supported profile and a short task list.
2. **Set the period and starting information.** Choose the period and whether to import existing records or start from a date. No years of back-encoding required. Each import is labeled by type (sales notebook, expense list, invoice, utang record) because the same amount can mean different things.
3. **Scan and review.** Photograph a notebook page. OCR plus document extraction proposes rows (date, description, amount, category), each linked to its source image. A side-by-side review screen lets the owner confirm, correct, and resolve duplicates. Unreadable fields stay unresolved instead of being guessed.
4. **Keep recording.** Quick actions for sales, expenses, customer payments, owner contributions, and owner withdrawals. Money movement is separated from transaction type (e.g., a customer settling a balance links to the earlier sale). Entries save locally when offline and sync once when connectivity returns, with no loss or duplicates.
5. **Review the filing period.** Shows included records, unconfirmed entries, possible duplicates, missing documents, and missing prior-period info, without claiming "complete screen = legally compliant."
6. **Generate the quarterly draft.** A Form 1701Q preparation workflow (exact calculation path to be validated with a tax practitioner) with a calculation worksheet, draft fields, unresolved items, and filing instructions. Tap any total to see its entries and source images.
7. **Get guidance in context.** AI chat explains fields, why a figure is included, what is missing, and what to do next, citing official sources and stating the conditions under which the guidance applies.

## 5. Key features and technical approach

| Capability | Prototype responsibility | Acceptance condition |
| :-- | :-- | :-- |
| Guided onboarding | Establish one supported profile, flag missing evidence | Unsupported situations are visible |
| OCR and review | Extract rows from limited notebook layouts, keep source links | Confirmed rows match the reviewed source |
| Ongoing bookkeeping | Save, correct, and sync new transactions | No unexplained loss or duplicate posting |
| Draft preparation | One quarterly summary and supported form draft | Figures can be traced and checked |
| Contextual AI guidance | Explain fields and next steps from reviewed sources | Answers state conditions and uncertainty |

**Design principle: separate the jobs.**

- **Structured transaction record:** amount, date, type, source, review status, correction history
- **Maintained rules:** determine supported obligations and form mapping
- **Deterministic code:** all arithmetic and validation (never the AI)
- **AI:** assists extraction and explanation only

Every draft stores its tax period and rule version. If an underlying entry changes, the draft is flagged for review instead of silently staying "current."

**Stack:** to be chosen from the team's existing skills. Likely a mobile-friendly web app with local transaction storage. We will add integrations only when needed to demonstrate the core flow.

**Rural-fit design questions (to validate locally):** which phone, how reliable the connection, which language, independent vs. assisted use, and how much time the owner can spare daily. Language plan: plain English and Filipino, with a local language considered after testing. Basic entry works offline; cloud OCR and AI chat show their connection requirements and queue work.

## 6. How we differ from existing tools

Taxumo (bookkeeping, filing, paid preparation) and Juan Accounting (document and handwritten-receipt extraction) already exist, so OCR and AI assistance are not new on their own. Our hypothesis is that the **combination** of these is valuable for a defined rural segment:

- adapting to the owner's **existing notebook records**
- **reviewing rows against the original source** with easy correction
- **offline-tolerant** daily bookkeeping on the owner's actual phone
- a clear **next action** rather than just a form

We will compare actual tasks (setup effort, page handling, correction effort, what owners understand unaided), not just feature checklists.

## 7. Compliance, privacy, and honest limits

- **Draft only.** The prototype prepares and organizes. Live BIR submission, payment, and acknowledgment are separate future states.
- **Not official books.** OCR imports and digital records do not automatically become registered books of accounts. We organize and preserve records for review and preparation, keep source images and correction history, and never tell users to discard original documents.
- **Tax profile is verified, not assumed.** Rural location and business size do not determine a tax regime. The 8% option requires eligibility and a valid election for the tax year.
- **Rules change.** Forms and rules are versioned with sources and effective dates. A production version needs an owner for ongoing rule review.
- **Privacy.** TINs are sensitive personal information (NPC guidance). We would minimize identifiers sent to AI services, explain external processing, and use only synthetic or redacted data in public demos.
- **Errors.** Handwriting OCR can look plausible and still be wrong, so owner review of every monetary entry is core to the product. We measure raw extraction quality and reviewed-entry accuracy separately.

## 8. Three-day plan

| Day | Main work | Output |
| :-: | :-- | :-- |
| 1 | Observe current tasks, select profile and layouts, review rules, build onboarding and basic entry | Supported scope, sample data, basic transaction flow |
| 2 | Connect extraction, correction, bookkeeping, period totals, and draft generation | Full flow from one notebook page to a draft package |
| 3 | Test with users, inspect calculations, fix failures, verify offline behavior, rehearse | Reliable demo and accurately reported findings |

**Roles (four people):** user research and tax coordination · onboarding and interface design · OCR and review · transaction storage and draft generation. We agree on a shared transaction structure early.

**Target demo:** confirm the profile → scan a page → correct an ambiguous amount → resolve a possible duplicate → save reviewed entries → add a transaction offline → sync once → produce a traceable quarterly draft → show a contextual AI explanation of one figure.

**Fallback:** if the calculation cannot be validated in time, the demo ends at reviewed bookkeeping plus a preparation checklist, and we will say so clearly.

## 9. Validation plan

We plan to observe about five owners from the chosen segment and consult at least one qualified tax practitioner. Test documents will be permissioned and redacted.

| Question | Method | Decision informed |
| :-- | :-- | :-- |
| Is the problem recurring and important? | Observe current preparation, find the hardest step | Whether to pursue it |
| Does extraction save effort? | Manual entry vs. scan + correction | Whether OCR earns its place |
| Are reviewed records reliable? | Compare to independently transcribed samples | Whether totals are dependable |
| Is the output useful? | Practitioner inspects assumptions, fields, sources | Whether it supports real preparation |
| Can owners keep using it? | Test on their phones, through interruptions | Self-service vs. assisted model |
| Will someone commit? | Present a concrete pilot service and price | Customer and commercial model |

**Proposed targets (not achieved results):** 30% reduction in total preparation time including corrections; no unexplained monetary differences from the checked source; no lost entries or duplicate postings after offline reconnection.

If OCR correction takes as long as manual entry, we narrow the layouts or simplify capture. Anything the tax professional cannot verify stays outside the automated path.

## 10. Commercial thinking

Possible paying customers: the **owner**, a **local bookkeeper** serving several clients, or an **organization** supporting microbusinesses (e.g., DTI Negosyo Centers, cooperatives, livelihood programs). Willingness to pay is unvalidated. If value centers on quarterly preparation, a monthly subscription may be hard to justify; if daily entry proves useful, recurring pricing fits better. Support, hosting, maintenance, and regulatory upkeep costs must be measured alongside revenue.

## 11. After the hackathon

1. Improve reliability within the tested segment (more real notebook layouts, clearer prompts, interruption recovery, reviewer-friendly export)
2. Test a multi-client workflow for bookkeepers if assisted use shows value
3. Add taxpayer profiles, annual forms, and formal-bookkeeping arrangements only after their rules are reviewed
4. Pursue direct filing via BIR certification or an authorized provider

## 12. What we want mentor feedback on

1. Which initial business segment best balances an important problem, accessible owners, representative documents, and a manageable tax situation?
2. Which assumptions, classifications, and calculations should a Philippine tax practitioner validate before any pilot with real preparation?
3. Can you help us reach owners and advisers who can share permissioned, redacted records?
4. Is the strongest first business case the owner, a local bookkeeper, or a supporting organization?
5. What evidence would show the prototype has real value, and which capability should we cut if it does not help?

---

## References

1. DTI. *MSMED Plan 2023–2028.* https://dtiwebfiles.s3-ap-southeast-1.amazonaws.com/BSMED/MSMED%20Plan%202023-2028/MSMED%20Plan%202023-2028_approved%2007Nov2024.v2.pdf
2. NWPC. *Gattaran MSME bookkeeping and productivity training report,* 16 March 2026. https://nwpc.dole.gov.ph/45-gattaran-msmes-trained-o-bookkeeping-and-productivity-under-istiv-bayanihan/
3. Taxumo. *Online Tax Filing Plans.* https://taxumo.com/taxumo-subscription-plans/
4. Juan Accounting. *Juan Magic Import Attachments.* https://help.juan.ac/en/articles/9094452-juan-magic-import-attachments
5. BIR. *RMO 23-2018 (8% income tax option).* https://bir-cdn.bir.gov.ph/local/pdf/RMO%20NO.23-2018.pdf
6. BIR. *RMC 36-2026 digest (eBIRForms, Form 1701-MS).* https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2036-2026%20Digest.pdf
7. BIR. *RMO 9-2021 (computerized accounting systems and books).* https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%209-2021.pdf
8. BIR. *RMC 4-2026 digest (loose-leaf and computerized books).* https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%204-2026%20Digest.pdf
9. BIR. *RMO 8-2019 (certification of e-filing and payment solutions).* https://bir-cdn.bir.gov.ph/local/pdf/RMO%20NO.%208-2019.pdf
10. NPC. *Advisory Opinion 2023-002 (tax declarations and individual TINs).* https://privacy.gov.ph/wp-content/uploads/2023/05/Advisory-Opinion-No.-2023-002.pdf
11. NPC. *Advisory 2024-04 (AI systems processing personal data).* https://privacy.gov.ph/wp-content/uploads/2025/02/Advisory-2024.12.19-Guidelines-on-Artificial-Intelligence-w-SGD.pdf
12. DTI. *Negosyo Center FAQ.* https://esigaw.dti.gov.ph/wp-content/uploads/2023/04/Negosyo-Center-FAQ.pdf
13. BIR. *Ease of Paying Taxes Act flyer.* https://bir-cdn.bir.gov.ph/BIR/pdf/flyer-eopt.pdf
