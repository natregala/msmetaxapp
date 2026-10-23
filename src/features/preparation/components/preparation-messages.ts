const en = {
  localUnsaved: "These changes have not been saved on this device yet.",
  intro:
    "Organize a reviewable package for your Quezon City business. Ordinary recordkeeping can continue while tax questions remain unresolved.",
  rejected:
    "This request was rejected before it could be saved. Refresh the saved profile and review your answers before sending a new request.",
  revise: "Refresh profile and review my answers",
  profileStep: "1 · Choose a period",
  figuresStep: "2 · Check your records",
  reviewStep: "3 · Prepare package",
  registration: "What do your registration records say?",
  registered: "I have registration records",
  notRegistered: "I do not have registration records",
  unknown: "I don't know yet",
  treatment: "Which treatment is shown in your current-year evidence?",
  treatmentHelp:
    "Your selection records what you supplied. It does not verify eligibility.",
  eightPercent: "8% option is stated in my evidence",
  graduated: "Graduated rates are stated",
  other: "Another treatment is stated",
  evidence: "Where can you find the supporting evidence?",
  evidenceHelp:
    "Use a document title or reference, without a TIN, full address, or other sensitive identifier.",
  year: "Tax year to prepare",
  coverage: "Do your records cover this whole period?",
  complete: "I checked the coverage",
  partial: "Some records are missing",
  priorIncome: "Earlier-period income figure (PHP)",
  priorTax: "Actual earlier tax payments (PHP)",
  credits: "Other supported credits (PHP)",
  amountsHelp:
    "Leave blank if unknown. Enter 0 only when you have verified zero. These figures are stored as supplied; no tax calculation is enabled.",
  notes: "Missing information or supporting notes",
  next: "Save and continue",
  back: "Back",
  review: "Review the package",
  saveProfile: "Save profile evidence",
  generate: "Generate record-preparation package",
  unknownItems: "Information still needed",
  verifiedRules:
    "Applicable current rules, effective dates, evidence conditions, and calculation examples have not been validated.",
  practitionerReview:
    "A qualified practitioner has not reviewed or approved this preparation path.",
  registrationMissing:
    "Confirm registration/profile information from appropriate evidence.",
  treatmentMissing:
    "Identify the applicable treatment using current-year evidence.",
  evidenceMissing: "Locate the supporting profile evidence.",
  priorIncomeMissing:
    "Check whether earlier-period income figures are required and obtain them.",
  priorTaxMissing:
    "Find evidence of actual earlier-period payments, including verified zero where applicable.",
  creditsMissing: "Identify supported credits or verify that there are none.",
  coverageMissing: "Resolve missing record coverage for the selected period.",
  nextSteps: "Next steps",
  stepRecords:
    "Review missing and unknown-payment records. Add or correct supported entries before regenerating.",
  stepEvidence:
    "Gather supporting records and retain originals. Verify which tax profile and current-year rules apply with a qualified adviser.",
  stepReview:
    "Review the saved package and its source index. Recheck freshness before relying on it.",
  blocked:
    "A record-preparation package is available. Tax-specific draft fields and calculations remain blocked pending verified rules and evidence.",
  saved: "Profile evidence saved to the account",
  saving: "Saving…",
  unchanged:
    "Profile answers below are owner-supplied, not verified tax conclusions.",
  pending:
    "A reviewed profile/report request is awaiting confirmation. Retry the same request before editing it; other bookkeeping remains available.",
  periodYear: "Choose a period within the tax year shown above.",
  fieldError: "Check the year, period, and exact PHP figures.",
  locallySaved: "Non-sensitive preparation answers saved on this device",
  localFailure:
    "This device could not save these answers. Keep the page open and save them to your account.",
};
type PreparationMessages = { [K in keyof typeof en]: string };
const tl: PreparationMessages = {
  localUnsaved: "Hindi pa naka-save sa device ang mga pagbabagong ito.",
  intro:
    "Maghanda ng paketeng masusuri para sa negosyo mo sa Quezon City. Maaaring magpatuloy ang pagtatala habang may hindi pa nalilinaw sa buwis.",
  rejected:
    "Tinanggihan ang request bago ma-save. Kunin ang pinakabagong profile at suriin ang mga sagot bago magpadala ng bagong request.",
  revise: "Kunin ang bagong profile at suriin ang mga sagot",
  profileStep: "1 · Piliin ang panahon",
  figuresStep: "2 · Suriin ang mga tala",
  reviewStep: "3 · Suriin ang pakete",
  registration: "Ano ang nakasaad sa mga dokumento ng pagpaparehistro?",
  registered: "May mga dokumento ako ng pagpaparehistro",
  notRegistered: "Wala akong mga dokumento ng pagpaparehistro",
  unknown: "Hindi ko pa alam",
  treatment:
    "Anong paraan ang nakasaad sa ebidensya para sa kasalukuyang taon?",
  treatmentHelp:
    "Itinatala lamang ng pagpili ang ibinigay mo. Hindi nito bineberipika ang pagiging karapat-dapat.",
  eightPercent: "Nakasaad ang 8% na opsyon sa ebidensya ko",
  graduated: "Nakasaad ang graduated rates",
  other: "Ibang paraan ang nakasaad",
  evidence: "Saan matatagpuan ang sumusuportang ebidensya?",
  evidenceHelp:
    "Gumamit ng pamagat o sanggunian ng dokumento, nang walang TIN, buong address, o ibang sensitibong pagkakakilanlan.",
  year: "Taon ng buwis na ihahanda",
  coverage: "Saklaw ba ng mga tala ang buong panahong ito?",
  complete: "Nasuri ko ang saklaw",
  partial: "May mga kulang na tala",
  priorIncome: "Halaga ng kita sa naunang panahon (PHP)",
  priorTax: "Aktwal na naunang binayarang buwis (PHP)",
  credits: "Ibang may suportang credit (PHP)",
  amountsHelp:
    "Iwang blangko kung hindi alam. Ilagay lamang ang 0 kung natiyak na zero. Itinatabi ang mga halaga ayon sa ibinigay; walang pagkukuwenta ng buwis.",
  notes: "Kulang na impormasyon o sumusuportang tala",
  next: "I-save at magpatuloy",
  back: "Bumalik",
  review: "Suriin ang pakete",
  saveProfile: "I-save ang ebidensya ng profile",
  generate: "Buuin ang pakete ng mga tala",
  unknownItems: "Impormasyong kailangan pa",
  verifiedRules:
    "Hindi pa nabeberipika ang naaangkop na kasalukuyang tuntunin, petsa ng bisa, kondisyon ng ebidensya, at mga halimbawa ng pagkukuwenta.",
  practitionerReview:
    "Wala pang kuwalipikadong propesyonal na nagsuri o nag-apruba sa paraang ito.",
  registrationMissing:
    "Tiyakin ang pagpaparehistro/profile mula sa angkop na ebidensya.",
  treatmentMissing:
    "Tukuyin ang naaangkop na paraan gamit ang ebidensya sa kasalukuyang taon.",
  evidenceMissing: "Hanapin ang sumusuportang ebidensya ng profile.",
  priorIncomeMissing:
    "Alamin kung kailangan ang halaga ng naunang kita at kunin ito.",
  priorTaxMissing:
    "Hanapin ang ebidensya ng aktwal na naunang bayad, kasama ang natiyak na zero kung naaangkop.",
  creditsMissing: "Tukuyin ang may suportang credits o tiyaking wala.",
  coverageMissing:
    "Ayusin ang kulang na saklaw ng tala para sa napiling panahon.",
  nextSteps: "Mga susunod na hakbang",
  stepRecords:
    "Suriin ang kulang at hindi pa alam na bayad. Magdagdag o magwasto ng suportadong tala bago muling buuin.",
  stepEvidence:
    "Tipunin ang mga sumusuportang dokumento at panatilihin ang orihinal. Tiyakin ang profile at kasalukuyang tuntunin kasama ng kuwalipikadong tagapayo.",
  stepReview:
    "Suriin ang naka-save na pakete at mga sanggunian. Tiyaking walang pagbabago bago gamitin.",
  blocked:
    "Maaaring buuin ang pakete ng mga tala. Naka-block pa ang tax-specific na draft at pagkukuwenta hanggang mabeberipika ang tuntunin at ebidensya.",
  saved: "Naka-save sa account ang ebidensya ng profile",
  saving: "Sine-save…",
  unchanged:
    "Ibinigay ng may-ari ang mga sagot; hindi ito nabeberipikang konklusyon sa buwis.",
  pending:
    "Naghihintay ng kumpirmasyon ang nasuring profile/ulat. Ulitin ang parehong request bago baguhin; maaari pa ring magtala ng negosyo.",
  periodYear: "Pumili ng panahon sa loob ng taong nakasaad sa itaas.",
  fieldError: "Suriin ang taon, panahon, at eksaktong halaga sa piso.",
  locallySaved: "Naka-save sa device ang hindi sensitibong sagot",
  localFailure:
    "Hindi na-save ng device ang mga sagot. Panatilihing bukas ang pahina at i-save sa account.",
};
export const preparationMessages =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true"
    ? {
        en: {
          ...en,
          saved: "Sample profile evidence saved in this browser",
          localFailure:
            "This browser could not save these sample answers. Keep the page open and try again.",
        },
        tl: {
          ...tl,
          saved: "Naka-save sa browser ang halimbawang ebidensya ng profile",
          localFailure:
            "Hindi na-save sa browser ang mga halimbawang sagot. Panatilihing bukas ang pahina at subukang muli.",
        },
      }
    : { en, tl };
