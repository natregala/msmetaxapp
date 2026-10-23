import { z } from "zod";
import { isCanonicalCentavos } from "@/features/transactions/transaction.rules";

const knownAmount = z.string().refine(isCanonicalCentavos).nullable();
export const preparationValuesSchema = z.strictObject({
  year: z.number().int().min(1900).max(2100),
  registration: z.enum(["registered", "not_registered", "unknown"]),
  taxTreatment: z.enum(["eight_percent", "graduated", "other", "unknown"]),
  evidence: z.string().trim().max(1000),
  priorIncomeCentavos: knownAmount,
  priorTaxPaymentsCentavos: knownAmount,
  otherCreditsCentavos: knownAmount,
  coverage: z.enum(["complete", "partial", "unknown"]),
  notes: z.string().trim().max(1000),
});
export type PreparationValues = z.infer<typeof preparationValuesSchema>;
export type PreparationProfile = {
  revision: number;
  values: PreparationValues;
  updatedAt: string;
};
export const preparationCommandSchema = z.strictObject({
  businessId: z.uuid(),
  operationId: z.uuid(),
  expectedRevision: z.number().int().min(0).max(2147483646),
  values: preparationValuesSchema,
});

export function preparationMissing(values: PreparationValues): string[] {
  const missing: string[] = [];
  if (values.registration === "unknown") missing.push("registration");
  if (values.taxTreatment === "unknown") missing.push("taxTreatment");
  if (!values.evidence) missing.push("evidence");
  if (values.priorIncomeCentavos === null) missing.push("priorIncomeCentavos");
  if (values.priorTaxPaymentsCentavos === null)
    missing.push("priorTaxPaymentsCentavos");
  if (values.otherCreditsCentavos === null)
    missing.push("otherCreditsCentavos");
  if (values.coverage !== "complete") missing.push("coverage");
  // Completion of owner answers never substitutes for reviewed, applicable rules.
  missing.push("verifiedRules", "practitionerReview");
  return missing;
}
