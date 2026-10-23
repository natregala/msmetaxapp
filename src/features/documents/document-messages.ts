import type { Language } from "@/i18n/messages";
const en = {
  title: "Photograph a notebook",
  home: "Back to home",
  sources: "Your notebook pages",
  newPage: "Add a page",
  guidance:
    "One clear page at a time. Keep all four corners visible, use good light, and avoid shadows.",
  supported:
    "Supported starting layout: date (YYYY-MM-DD) | description | amount | paid / unpaid / unknown. Other layouts can be transcribed manually.",
  sourceType: "What is on this page?",
  sales: "Sales notebook",
  expenses: "Expense notebook",
  choose: "Photograph or choose an image",
  imageHelp:
    "JPEG or PNG, up to 4 MB. Use a redacted copy if the page contains unrelated personal information.",
  preview: "Selected notebook page",
  retake: "Choose another photo",
  upload: "Save original page",
  uploading: "Saving your page…",
  savedLocal: "Work saved on this device",
  localFailure:
    "This device could not save your work. Keep this page open and try again.",
  uploaded: "Original page saved privately",
  extract: "Read this page",
  processing:
    "The page is still being read. Check again to resume the same processing job.",
  checkProcessing: "Check reading progress",
  consent:
    "I agree to send this page to Azure Document Intelligence to propose entries for my review.",
  disclosure:
    "Only this page is sent for reading. Proposed entries will never be saved as financial records without your review.",
  notConfigured:
    "Automatic reading is not configured yet. You can add and review entries from the photo manually.",
  review: "Review entries",
  addRow: "Add a missed entry",
  saveRows: "Save review changes",
  saving: "Saving…",
  saved: "Review changes saved",
  empty:
    "No proposed entries yet. Add an entry from the page, or use automatic reading when configured.",
  source: "Original page",
  row: "Entry",
  line: "Line on page",
  date: "Business date",
  description: "What was this for?",
  amount: "Full amount (PHP)",
  kind: "Is this a sale or an expense?",
  sale: "Sale",
  expense: "Expense",
  unknownKind: "I’m not sure",
  payment: "Payment",
  paid: "Paid in full",
  unpaid: "Not paid yet",
  unknownPayment: "Payment not known",
  partial: "Partly paid",
  paidAmount: "Amount already paid (PHP)",
  paidDate: "Payment date",
  paymentHelp:
    "Choose unknown if the notebook does not establish payment. For a part payment, enter only the amount actually received or paid.",
  remove: "Remove this proposal",
  removeHelp:
    "Remove a subtotal, balance, or incorrectly read line. Accepted records cannot be removed here.",
  original: "Text read from the page",
  uncertain: "Check unclear fields against the page.",
  previous: "Previous entry",
  next: "Next entry",
  reviewRow: "Review and save this entry",
  confirmTitle: "Check this entry before saving",
  confirmed: "I compared this entry with the original page.",
  duplicatesConfirmed:
    "I checked possible duplicates. This is a separate business event.",
  duplicatePage:
    "Another uploaded page has the same image fingerprint. Check whether you already recorded it.",
  duplicateRow:
    "Another proposed or saved entry has the same date, type, and amount. This may be legitimate; check before saving.",
  accept: "Confirm and save record",
  accepted: "Saved to your account",
  acceptedLocked:
    "This entry is accepted. Use Records to correct or void the financial record.",
  cancel: "Back to editing",
  required:
    "Complete a valid date, amount, and sale/expense choice before saving.",
  failed:
    "This operation could not be confirmed. Your work is kept; retry the same operation.",
  pending:
    "Waiting for account confirmation. Retry keeps the original request and will not post the same entry twice.",
  retry: "Retry account operation",
  refresh: "Refresh page details",
  conflict:
    "This page changed in another tab. Compare your edits with the saved entries before choosing.",
  useServer: "Use saved entries",
  useMine: "Keep my edits for review against the new version",
  yourEdits: "Your unsaved entries",
  serverEdits: "Saved entries",
  history: "Review history",
  state: "Page status",
  uploadedDate: "Uploaded",
  noPages: "Your saved notebook pages will appear here.",
  uploadingState: "Upload unfinished",
  uploadedState: "Ready for review",
  reviewState: "Review in progress",
  failedState: "Needs attention",
  atLimit: "This bounded page supports up to 50 entries.",
  notImage: "Choose a JPEG or PNG image no larger than 4 MB.",
  pendingCapture: "An unfinished photo is kept on this device.",
  changeSource: "Change page",
  sourceUnavailable:
    "Could not load the original page. Try refreshing while connected.",
  load: "Loading notebook pages…",
  manual: "Manual entry",
  audit: "Original extraction and review revisions are retained.",
  reviewDraft: "Review draft",
  ocrFailure:
    "The page could not be read. The original is kept; review it manually or retry.",
  missingUpload:
    "The original upload is not yet complete. Resume the saved photo upload.",
  zero: "This is a zero-amount entry. Verify that zero is intentional.",
  future: "This date is in the future. Verify it before accepting.",
  note: "Notebook review saves only rows you explicitly confirm. Saving the photo or review changes does not accept financial records.",
};
type Copy = { [K in keyof typeof en]: string };
const tl: Copy = {
  title: "Kunan ng larawan ang kuwaderno",
  home: "Bumalik sa simula",
  sources: "Mga pahina ng kuwaderno",
  newPage: "Magdagdag ng pahina",
  guidance:
    "Isang malinaw na pahina bawat larawan. Isama ang apat na sulok, gumamit ng maliwanag na ilaw, at iwasan ang anino.",
  supported:
    "Unang suportadong ayos: petsa (YYYY-MM-DD) | detalye | halaga | paid / unpaid / unknown. Maaaring manu-manong isalin ang ibang ayos.",
  sourceType: "Ano ang laman ng pahina?",
  sales: "Kuwaderno ng benta",
  expenses: "Kuwaderno ng gastos",
  choose: "Kunan o pumili ng larawan",
  imageHelp:
    "JPEG o PNG, hanggang 4 MB. Takpan ang personal na impormasyong hindi kailangan.",
  preview: "Napiling pahina",
  retake: "Pumili ng ibang larawan",
  upload: "I-save ang orihinal na pahina",
  uploading: "Sine-save ang pahina…",
  savedLocal: "Naka-save ang gawa sa device",
  localFailure:
    "Hindi na-save ng device ang gawa mo. Panatilihing bukas ang pahina at subukang muli.",
  uploaded: "Pribadong naka-save ang orihinal na pahina",
  extract: "Basahin ang pahina",
  processing:
    "Binabasa pa ang pahina. Suriin muli upang ipagpatuloy ang parehong pagproseso.",
  checkProcessing: "Suriin ang pag-usad",
  consent:
    "Pumapayag akong ipadala ang pahina sa Azure Document Intelligence para magmungkahi ng mga talang susuriin ko.",
  disclosure:
    "Ang pahinang ito lamang ang ipapadala. Walang mungkahing magiging tala nang hindi mo sinusuri.",
  notConfigured:
    "Hindi pa nakaayos ang awtomatikong pagbasa. Maaari kang manu-manong magdagdag at magsuri mula sa larawan.",
  review: "Suriin ang mga tala",
  addRow: "Magdagdag ng hindi nabasang tala",
  saveRows: "I-save ang pagsusuri",
  saving: "Sine-save…",
  saved: "Naka-save ang pagsusuri",
  empty:
    "Wala pang mungkahing tala. Magdagdag mula sa pahina o gamitin ang awtomatikong pagbasa kapag magagamit na.",
  source: "Orihinal na pahina",
  row: "Tala",
  line: "Linya sa pahina",
  date: "Petsa ng pangyayari",
  description: "Para saan ito?",
  amount: "Buong halaga (PHP)",
  kind: "Benta ba ito o gastos?",
  sale: "Benta",
  expense: "Gastos",
  unknownKind: "Hindi ko pa alam",
  payment: "Bayad",
  paid: "Bayad na nang buo",
  unpaid: "Hindi pa bayad",
  unknownPayment: "Hindi pa alam ang bayad",
  partial: "Bahagyang bayad",
  paidAmount: "Halagang nabayaran na (PHP)",
  paidDate: "Petsa ng bayad",
  paymentHelp:
    "Piliin ang hindi pa alam kung hindi malinaw ang bayad. Para sa bahagyang bayad, ilagay lamang ang totoong natanggap o naibayad.",
  remove: "Alisin ang mungkahi",
  removeHelp:
    "Alisin ang subtotal, balanse, o maling nabasang linya. Hindi maaalis dito ang tinanggap nang tala.",
  original: "Tekstong nabasa sa pahina",
  uncertain: "Ihambing ang malabong detalye sa pahina.",
  previous: "Naunang tala",
  next: "Susunod na tala",
  reviewRow: "Suriin at i-save ang talang ito",
  confirmTitle: "Suriin bago i-save",
  confirmed: "Inihambing ko ang tala sa orihinal na pahina.",
  duplicatesConfirmed:
    "Nasuri ko ang posibleng pag-uulit. Hiwalay na pangyayari ito.",
  duplicatePage:
    "May ibang pahinang may parehong larawan. Suriin kung naitala mo na ito.",
  duplicateRow:
    "May ibang mungkahi o tala na may parehong petsa, uri, at halaga. Maaaring tama ito; suriin bago i-save.",
  accept: "Kumpirmahin at i-save",
  accepted: "Naka-save sa account",
  acceptedLocked:
    "Tinanggap na ito. Gamitin ang Mga tala para itama o ipawalang-bisa.",
  cancel: "Bumalik sa pag-edit",
  required: "Kumpletuhin ang wastong petsa, halaga, at uri bago i-save.",
  failed:
    "Hindi makumpirma ang ginawa. Nakatago ang gawa mo; subukang muli ang parehong kahilingan.",
  pending:
    "Hinihintay ang kumpirmasyon ng account. Parehong kahilingan ang uulitin upang maiwasan ang dobleng tala.",
  retry: "Subukang muli sa account",
  refresh: "I-refresh ang detalye",
  conflict:
    "Nagbago ang pahina sa ibang tab. Ihambing ang iyong gawa sa naka-save bago pumili.",
  useServer: "Gamitin ang naka-save",
  useMine: "Panatilihin ang aking gawa para suriin sa bagong bersyon",
  yourEdits: "Mga hindi pa naka-save",
  serverEdits: "Mga naka-save",
  history: "Kasaysayan ng pagsusuri",
  state: "Kalagayan ng pahina",
  uploadedDate: "Na-upload",
  noPages: "Dito lalabas ang mga naka-save na pahina.",
  uploadingState: "Hindi pa tapos ang upload",
  uploadedState: "Maaari nang suriin",
  reviewState: "Sinusuri pa",
  failedState: "Kailangang balikan",
  atLimit: "Hanggang 50 tala ang suportado sa pahinang ito.",
  notImage: "Pumili ng JPEG o PNG na hanggang 4 MB.",
  pendingCapture: "May hindi pa tapos na larawang nasa device.",
  changeSource: "Baguhin ang pahina",
  sourceUnavailable:
    "Hindi mabuksan ang orihinal. I-refresh kapag may koneksyon.",
  load: "Kinukuha ang mga pahina…",
  manual: "Manu-manong tala",
  audit: "Pinananatili ang orihinal na pagbasa at mga bersyon ng pagsusuri.",
  reviewDraft: "Draft ng pagsusuri",
  ocrFailure:
    "Hindi mabasa ang pahina. Nakatago ang orihinal; suriin nang manu-mano o subukang muli.",
  missingUpload:
    "Hindi pa tapos ang pag-upload ng orihinal. Ipagpatuloy ang naka-save na larawan.",
  zero: "Zero ang halaga ng talang ito. Tiyaking sinadya ang zero.",
  future: "Nasa hinaharap ang petsa. Tiyaking tama bago tanggapin.",
  note: "Ang mga talang kinumpirma mo lamang ang matatanggap. Hindi pagtanggap ng tala ang pag-save ng larawan o pagsusuri.",
};
export const documentMessages: Record<Language, Copy> =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true"
    ? {
        en: {
          ...en,
          imageHelp:
            "JPEG or PNG, up to 4 MB. Use a synthetic sample page only.",
          upload: "Keep sample photo in this browser",
          uploading: "Saving sample photo in this browser…",
          uploaded: "Sample page saved only in this browser",
          uploadedDate: "Stored in this browser",
          uploadingState: "Sample photo not saved yet",
          saved: "Review changes saved in this browser",
          accepted: "Saved in this browser · demo",
          acceptedLocked:
            "This demo entry is saved. Use Records to try correcting or voiding the sample record.",
          pending:
            "Waiting for demo save confirmation. Retrying keeps the same sample request and avoids a second entry.",
          retry: "Retry demo operation",
          consent:
            "I understand this demo uses sample proposals, without external OCR.",
          disclosure:
            "This demo keeps sample pages in this browser. No page is sent to an external reading service.",
          notConfigured:
            "This demo does not use external automatic reading. Review the sample page and enter its rows manually.",
          note: "Sample photos, reviewed entries, and accepted demo records stay in this browser. Only entries you explicitly confirm become saved demo records.",
        },
        tl: {
          ...tl,
          imageHelp:
            "JPEG o PNG, hanggang 4 MB. Gawa-gawang halimbawang pahina lamang ang gamitin.",
          upload: "Itago ang halimbawang larawan sa browser",
          uploading: "Sine-save sa browser ang halimbawang larawan…",
          uploaded: "Sa browser na ito lamang naka-save ang halimbawang pahina",
          uploadedDate: "Naitago sa browser na ito",
          uploadingState: "Hindi pa naka-save ang halimbawang larawan",
          saved: "Naka-save sa browser ang mga pagbabago sa pagsusuri",
          accepted: "Naka-save sa browser na ito · demo",
          acceptedLocked:
            "Naka-save na ang demo entry. Gamitin ang Mga tala para subukang iwasto o pawalang-bisa ang halimbawang tala.",
          pending:
            "Hinihintay ang kumpirmasyon ng demo save. Parehong halimbawang request ang uulitin upang maiwasan ang dobleng tala.",
          retry: "Subukang muli ang demo operation",
          consent:
            "Nauunawaan kong halimbawang mungkahi ang gamit ng demo, walang panlabas na OCR.",
          disclosure:
            "Sa browser na ito nananatili ang mga halimbawang pahina. Walang ipinapadala sa panlabas na serbisyong pambasa.",
          notConfigured:
            "Walang panlabas na awtomatikong pagbasa sa demo. Suriin ang halimbawang pahina at manu-manong ilagay ang mga tala.",
          note: "Sa browser na ito nananatili ang halimbawang larawan, nasuring entry, at tinanggap na demo tala. Mga entry na kinumpirma mo lamang ang nagiging naka-save na demo tala.",
        },
      }
    : { en, tl };
