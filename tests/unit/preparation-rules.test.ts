import { describe, expect, it } from "vitest";
import {
  preparationMissing,
  preparationValuesSchema,
} from "@/features/preparation/preparation.schema";
describe("preparation evidence gate", () => {
  const values = {
    year: 2026,
    registration: "unknown" as const,
    taxTreatment: "unknown" as const,
    evidence: "",
    priorIncomeCentavos: null,
    priorTaxPaymentsCentavos: null,
    otherCreditsCentavos: null,
    coverage: "unknown" as const,
    notes: "",
  };
  it("keeps missing figures unknown and never enables tax calculations from filled answers", () => {
    expect(
      preparationValuesSchema.parse(values).priorTaxPaymentsCentavos,
    ).toBeNull();
    expect(preparationMissing(values)).toContain("priorTaxPaymentsCentavos");
    expect(
      preparationMissing({
        ...values,
        registration: "registered",
        taxTreatment: "eight_percent",
        evidence: "Owner supplied document reference",
        priorIncomeCentavos: "0",
        priorTaxPaymentsCentavos: "0",
        otherCreditsCentavos: "0",
        coverage: "complete",
      }),
    ).toEqual(["verifiedRules", "practitionerReview"]);
  });
  it("rejects approximate, negative or missing-as-zero monetary strings", () => {
    for (const amount of ["1.25", "-1", "", "001", "1000000000000"])
      expect(
        preparationValuesSchema.safeParse({
          ...values,
          priorIncomeCentavos: amount,
        }).success,
      ).toBe(false);
  });
});
