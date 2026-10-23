import { describe, expect, it } from "vitest";
import {
  amountToCentavos,
  buildCommand,
  formatPHP,
  isBusinessDate,
  todayInManila,
  validateDraft,
} from "../../src/features/transactions/transaction.rules";
import { commandSchema } from "../../src/features/transactions/transaction.schema";
import type { TransactionDraft } from "../../src/features/transactions/transaction.types";

const businessId = "10000000-0000-4000-8000-000000000001";
const operationId = "20000000-0000-4000-8000-000000000001";
const draft: TransactionDraft = {
  businessDate: "2026-10-23",
  kind: "sale",
  description: "  Morning sales  ",
  amount: "107.09",
  moneyMovement: "in",
};

describe("exact financial inputs", () => {
  it.each([
    ["0", "0"],
    ["0.00", "0"],
    ["0.01", "1"],
    ["107.09", "10709"],
    ["1.1", "110"],
    ["9999999999.99", "999999999999"],
  ])("converts %s pesos to %s centavos without rounding", (input, expected) => {
    expect(amountToCentavos(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "1.001",
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    "1,000",
    "1.",
    ".50",
    "10000000000.00",
  ])("rejects unsupported amount %s", (input) => {
    expect(() => amountToCentavos(input)).toThrow();
  });

  it("preserves missing amount versus an explicitly supplied zero", () => {
    expect(validateDraft({ ...draft, amount: "" })).toEqual({
      amount: "required",
    });
    expect(validateDraft({ ...draft, amount: "0" })).toEqual({});
  });

  it("formats the exact maximum and fractional peso without float conversion", () => {
    expect(formatPHP("999999999999")).toBe("₱9,999,999,999.99");
    expect(formatPHP("1")).toBe("₱0.01");
    expect(formatPHP("0")).toBe("₱0.00");
  });

  it("validates real calendar dates and inclusive supported boundaries", () => {
    expect(isBusinessDate("2024-02-29")).toBe(true);
    expect(isBusinessDate("1900-01-01")).toBe(true);
    expect(isBusinessDate("2100-12-31")).toBe(true);
    for (const value of [
      "2026-02-29",
      "1900-02-29",
      "2100-02-29",
      "2026-04-31",
      "1899-12-31",
      "2101-01-01",
      "2026-2-03",
    ])
      expect(isBusinessDate(value)).toBe(false);
  });

  it("uses the Manila business date independently of the device timezone", () => {
    expect(todayInManila(new Date("2026-10-22T15:59:59Z"))).toBe("2026-10-22");
    expect(todayInManila(new Date("2026-10-22T16:00:00Z"))).toBe("2026-10-23");
  });

  it("keeps unknown movement and unpaid sales distinct from a paid sale", () => {
    expect(
      buildCommand(businessId, operationId, {
        ...draft,
        moneyMovement: "unknown",
      }).payload.moneyMovement,
    ).toBe("unknown");
    expect(
      buildCommand(businessId, operationId, { ...draft, moneyMovement: "none" })
        .payload.moneyMovement,
    ).toBe("none");
    expect(validateDraft({ ...draft, moneyMovement: "out" })).toEqual({
      moneyMovement: "invalid_movement",
    });
    expect(
      validateDraft({ ...draft, kind: "loan_received", moneyMovement: "none" }),
    ).toEqual({ moneyMovement: "invalid_movement" });
  });

  it("normalizes only the submitted interpretation, leaving raw draft input intact", () => {
    const command = buildCommand(businessId, operationId, draft);
    expect(command.payload.description).toBe("Morning sales");
    expect(command.payload.amountCentavos).toBe("10709");
    expect(draft.description).toBe("  Morning sales  ");
    expect(
      buildCommand(businessId, operationId, { ...draft, description: " " })
        .payload.description,
    ).toBeNull();
  });
});

describe("untrusted command boundary", () => {
  const valid = buildCommand(businessId, operationId, draft);
  it("accepts a complete explicit review command", () =>
    expect(commandSchema.safeParse(valid).success).toBe(true));
  it.each([
    { amountCentavos: 10709 },
    { amountCentavos: null },
    { amountCentavos: "01" },
    { amountCentavos: "1000000000000" },
    { expectedRevision: 1 },
    { reviewConfirmed: false },
    { businessDate: "2026-02-30" },
    { source: "manual" },
    { description: " " },
    { description: "x".repeat(501) },
    { kind: "settlement" },
    { moneyMovement: "out" },
  ])("rejects a malformed or unsupported payload %j", (change) => {
    expect(
      commandSchema.safeParse({
        ...valid,
        payload: { ...valid.payload, ...change },
      }).success,
    ).toBe(false);
  });
  it("does not accept caller-supplied ownership or an absent business ID", () => {
    expect(
      commandSchema.safeParse({ ...valid, ownerId: businessId }).success,
    ).toBe(false);
    expect(commandSchema.safeParse({ ...valid, businessId: "" }).success).toBe(
      false,
    );
  });
  it("uses the same Unicode character bound as the form and PostgreSQL", () => {
    const description = "😀".repeat(500);
    expect(validateDraft({ ...draft, description })).toEqual({});
    expect(
      commandSchema.safeParse({
        ...valid,
        payload: { ...valid.payload, description },
      }).success,
    ).toBe(true);
    expect(
      commandSchema.safeParse({
        ...valid,
        payload: { ...valid.payload, description: `${description}😀` },
      }).success,
    ).toBe(false);
  });
});
