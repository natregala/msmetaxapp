import type { DocumentProposal } from "./document.schema";
import {
  isBusinessDate,
  amountToCentavos,
} from "@/features/transactions/transaction.rules";

export type SourceLine = { page: 1; line: number; text: string };
/** Deliberately bounded layout: YYYY-MM-DD | description | PHP amount | paid/unpaid/unknown.
 * Ambiguous and non-matching lines remain proposals with missing fields, never accepted money.
 */
export function proposeNotebookRows(
  lines: SourceLine[],
  kind: "sale" | "expense",
  newId: () => string,
): DocumentProposal[] {
  return lines.slice(0, 50).map((line) => {
    const cells = line.text.split("|").map((cell) => cell.trim());
    const businessDate =
      cells.length >= 3 && isBusinessDate(cells[0]) ? cells[0] : "";
    let amount = "";
    if (cells.length >= 3) {
      const raw = cells[2].replace(/^(?:PHP|₱)\s*/i, "");
      try {
        amountToCentavos(raw);
        amount = raw;
      } catch {
        /* Preserve uncertainty, not an invented amount. */
      }
    }
    const payment = cells[3]?.toLowerCase();
    const paymentStatus =
      payment === "paid" || payment === "unpaid" ? payment : "unknown";
    return {
      id: newId(),
      page: 1,
      line: line.line,
      sourceText: line.text.slice(0, 1000),
      businessDate,
      description:
        cells.length >= 3 ? cells[1].slice(0, 500) : line.text.slice(0, 500),
      amount,
      kind,
      paymentStatus,
      paymentDate: "",
      uncertainties: [
        ...(!businessDate ? ["date_unresolved"] : []),
        ...(!amount ? ["amount_unresolved"] : []),
        ...(paymentStatus === "unknown" ? ["payment_unknown"] : []),
        ...(paymentStatus === "paid" ? ["payment_date_unresolved"] : []),
        ...(/\b(total|subtotal|balance|brought forward)\b/i.test(line.text)
          ? ["possible_non_record"]
          : []),
      ],
    };
  });
}

export function matchingProposalIds(
  rows: DocumentProposal[],
  row: DocumentProposal,
): string[] {
  if (!row.businessDate || !row.amount) return [];
  let amount: string;
  try {
    amount = amountToCentavos(row.amount);
  } catch {
    return [];
  }
  return rows
    .filter((other) => {
      if (
        other.id === row.id ||
        other.kind !== row.kind ||
        other.businessDate !== row.businessDate
      )
        return false;
      try {
        return amountToCentavos(other.amount) === amount;
      } catch {
        return false;
      }
    })
    .map((other) => other.id);
}
