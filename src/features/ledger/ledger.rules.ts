import type { LedgerSnapshot } from "./ledger.types";
import { formatPHP } from "@/features/transactions/transaction.rules";
import {
  preparationMissing,
  preparationValuesSchema,
} from "@/features/preparation/preparation.schema";

/** Totals may exceed the per-record bound; format arbitrary exact integer totals. */
export function formatLedgerPHP(centavos: string): string {
  if (!/^(0|[1-9]\d*)$/.test(centavos)) throw new RangeError("invalid_total");
  const digits = centavos.padStart(3, "0");
  return (
    "₱" +
    digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    digits.slice(-2)
  );
}

/** Quotes every field and neutralizes spreadsheet formulas, including leading whitespace. */
export function csvCell(value: string): string {
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function preparationRows(snapshot: LedgerSnapshot): string[][] {
  const parsed = preparationValuesSchema.safeParse(
    snapshot.preparation?.profile,
  );
  if (!parsed.success)
    return [["Preparation inputs", "Not included in this snapshot"]];
  const profile = parsed.data;
  const amount = (value: string | null) =>
    value === null
      ? "Unknown / not supplied"
      : formatLedgerPHP(value).slice(1).replaceAll(",", "");
  const labels: Record<string, string> = {
    registration: "Registration information",
    taxTreatment: "Applicable tax treatment",
    evidence: "Supporting evidence references",
    priorIncomeCentavos: "Earlier-period income",
    priorTaxPaymentsCentavos: "Actual prior tax payments",
    otherCreditsCentavos: "Other credits",
    coverage: "Record coverage",
    verifiedRules: "Verified applicable official tax rules",
    practitionerReview: "Qualified practitioner review",
  };
  return [
    [
      "Preparation profile revision",
      String(snapshot.preparation?.profileRevision ?? "Unknown"),
    ],
    ["Tax year", String(profile.year)],
    [
      "Owner-supplied registration information (not independently verified)",
      profile.registration,
    ],
    [
      "Owner-supplied tax treatment (not verified eligibility)",
      profile.taxTreatment,
    ],
    ["Supporting evidence references", profile.evidence || "Not supplied"],
    ["Earlier-period income PHP", amount(profile.priorIncomeCentavos)],
    ["Actual prior tax payments PHP", amount(profile.priorTaxPaymentsCentavos)],
    ["Other credits PHP", amount(profile.otherCreditsCentavos)],
    ["Owner-supplied record coverage", profile.coverage],
    ["Preparation notes", profile.notes || "Not supplied"],
    [
      "Missing information / required validation",
      ...preparationMissing(profile).map((key) => labels[key] ?? key),
    ],
    [
      "Tax calculation status",
      "Blocked: no applicable rule set or practitioner validation is claimed. No tax due or draft return fields generated.",
    ],
    [
      "Next steps",
      "Review missing and uncertain records, confirm payment dates, obtain supporting evidence, and have applicable rules and treatment checked before generating a tax-specific output.",
    ],
  ];
}
export function snapshotCSV(snapshot: LedgerSnapshot): string {
  const rows: string[][] = [
    ["Draft business record export", "PHP", snapshot.from, snapshot.to],
    ["Snapshot", snapshot.id, "Generated", snapshot.createdAt],
    [
      "Freshness",
      snapshot.stale
        ? "STALE - regenerate and review"
        : "Current at generation",
    ],
    ["Coverage", snapshot.coverage],
    [
      "Business date",
      "Record type",
      "Description",
      "Amount PHP",
      "Known paid PHP",
      "Remaining PHP",
      "Payment status",
      "Record status",
      "Revision",
      "Record reference",
      "Source document",
      "Source row",
    ],
    ...snapshot.records.map((r) => [
      r.businessDate,
      r.kind,
      r.description ?? "",
      formatPHP(r.amountCentavos).slice(1).replaceAll(",", ""),
      formatPHP(r.paidCentavos).slice(1).replaceAll(",", ""),
      r.remainingCentavos === null
        ? "Unknown"
        : formatPHP(r.remainingCentavos).slice(1).replaceAll(",", ""),
      r.paymentStatus,
      r.status,
      String(r.revision),
      r.id,
      r.sourceReference?.documentId ?? "Manual",
      r.sourceReference?.rowId ?? "",
    ]),
    [
      "Sales PHP",
      formatLedgerPHP(snapshot.totals.salesCentavos)
        .slice(1)
        .replaceAll(",", ""),
    ],
    [
      "Expenses PHP",
      formatLedgerPHP(snapshot.totals.expensesCentavos)
        .slice(1)
        .replaceAll(",", ""),
    ],
    [
      "Known money received PHP",
      formatLedgerPHP(snapshot.totals.receivedCentavos)
        .slice(1)
        .replaceAll(",", ""),
    ],
    [
      "Known money paid PHP",
      formatLedgerPHP(snapshot.totals.paidCentavos)
        .slice(1)
        .replaceAll(",", ""),
    ],
    ["Records with unknown payment", String(snapshot.totals.unknownCount)],
    [
      "Payments with unknown dates (business-wide)",
      String(snapshot.totals.undatedPaymentCount ?? 0),
    ],
    [
      "Payment event date",
      "Payment amount PHP",
      "Payment status",
      "Payment revision",
      "Transaction reference",
      "Payment reference",
    ],
    ...snapshot.payments.map((p) => [
      p.paymentDate ?? "Unknown - owner confirmation needed",
      formatPHP(p.amountCentavos).slice(1).replaceAll(",", ""),
      p.status,
      String(p.revision),
      p.transactionId,
      p.id,
    ]),
    ...preparationRows(snapshot),
    [
      "Limitations",
      "Not a tax return, filing, payment acknowledgement, or registered book. No local drafts or pending commands included. Unknown figures are not zero.",
    ],
  ];
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
