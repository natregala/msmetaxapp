import { describe, expect, it } from "vitest";
import {
  csvCell,
  formatLedgerPHP,
  snapshotCSV,
} from "@/features/ledger/ledger.rules";
import { ledgerCreateValues } from "@/features/ledger/ledger.schema";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";
describe("ledger exact exports and acceptance validation", () => {
  it("neutralizes spreadsheet formulas even after whitespace and escapes CSV delimiters", () => {
    for (const input of ["=1+1", " +SUM(A1:A2)", "\t@command", "-1+2"])
      expect(csvCell(input)).toBe("\"'" + input.replaceAll('"', '""') + '"');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("2026-10-23")).toBe('"2026-10-23"');
  });
  it("formats aggregate totals beyond the individual transaction cap without floats", () => {
    expect(formatLedgerPHP("9999999999990000")).toBe("₱99,999,999,999,900.00");
    expect(formatLedgerPHP("0")).toBe("₱0.00");
    expect(() => formatLedgerPHP("1.2")).toThrow();
  });
  it("rejects malformed amounts and initial payments safely without throwing BigInt parser errors", () => {
    const base = {
      businessDate: "2026-10-23",
      kind: "sale",
      amountCentavos: "100",
      description: null,
      paymentStatus: "partial",
      paymentAmountCentavos: "25",
      paymentDate: "2026-10-23",
    };
    expect(ledgerCreateValues.safeParse(base).success).toBe(true);
    for (const value of ["", "1.2", "-1", "NaN"])
      expect(
        ledgerCreateValues.safeParse({ ...base, amountCentavos: value })
          .success,
      ).toBe(false);
    expect(
      ledgerCreateValues.safeParse({ ...base, paymentAmountCentavos: "101" })
        .success,
    ).toBe(false);
    expect(
      ledgerCreateValues.safeParse({ ...base, paymentDate: "2026-10-22" })
        .success,
    ).toBe(false);
    expect(
      ledgerCreateValues.safeParse({ ...base, paymentStatus: "unknown" })
        .success,
    ).toBe(false);
  });
  it("exports versioned rows, exact values, payment events and stale limitations together", () => {
    const snapshot: LedgerSnapshot = {
      id: "snapshot",
      businessId: "business",
      from: "2026-01-01",
      to: "2026-01-31",
      createdAt: "now",
      ledgerVersion: "1",
      stale: true,
      preparation: {
        profileRevision: 2,
        profile: {
          year: 2026,
          registration: "unknown",
          taxTreatment: "unknown",
          evidence: "=unsafe reference",
          priorIncomeCentavos: null,
          priorTaxPaymentsCentavos: "0",
          otherCreditsCentavos: null,
          coverage: "partial",
          notes: "Review needed",
        },
      },
      manifest: [],
      coverage: "Accepted only",
      totals: {
        salesCentavos: "12345",
        expensesCentavos: "0",
        receivedCentavos: "5000",
        paidCentavos: "0",
        receivableCentavos: "7345",
        payableCentavos: "0",
        unknownCount: 0,
        recordCount: 1,
        voidCount: 0,
      },
      records: [
        {
          id: "record",
          businessId: "business",
          kind: "sale",
          businessDate: "2026-01-01",
          amountCentavos: "12345",
          description: "=IMPORT()",
          moneyMovement: "in",
          revision: 2,
          status: "active",
          paymentKnowledge: "known",
          paidCentavos: "5000",
          remainingCentavos: "7345",
          paymentStatus: "partial",
          recordedAt: "now",
          source: "manual",
          sourceReference: null,
        },
      ],
      payments: [
        {
          id: "payment",
          transactionId: "record",
          amountCentavos: "5000",
          paymentDate: "2026-01-03",
          status: "active",
          revision: 1,
          recordedAt: "now",
        },
      ],
    };
    const csv = snapshotCSV(snapshot);
    expect(csv).toContain('"123.45"');
    expect(csv).toContain('"\'=IMPORT()"');
    expect(csv).toContain("STALE");
    expect(csv).toContain('"2026-01-03","50.00"');
    expect(csv).toContain("Not a tax return");
    expect(csv).toContain(
      '"Earlier-period income PHP","Unknown / not supplied"',
    );
    expect(csv).toContain('"Actual prior tax payments PHP","0.00"');
    expect(csv).toContain("Verified applicable official tax rules");
    expect(csv).toContain("No tax due or draft return fields generated.");
  });
});
