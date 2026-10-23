import { z } from "zod";
import {
  allowedMovements,
  isBusinessDate,
  isCanonicalCentavos,
} from "./transaction.rules";
import {
  businessActivities,
  moneyMovements,
  transactionKinds,
} from "./transaction.types";

export const businessIdSchema = z.uuid();
export const acceptanceSchema = z.strictObject({
  id: z.uuid(),
  revision: z.literal(1),
});
export const payloadSchema = z
  .strictObject({
    version: z.literal(1),
    businessDate: z.string().refine(isBusinessDate, "invalid_date"),
    kind: z.enum(transactionKinds),
    amountCentavos: z.string().refine(isCanonicalCentavos, "invalid_amount"),
    description: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => value === value.trim(), "invalid_description")
      .nullable(),
    moneyMovement: z.enum(moneyMovements),
    reviewConfirmed: z.literal(true),
    expectedRevision: z.literal(0),
  })
  .refine(
    (value) => allowedMovements(value.kind).includes(value.moneyMovement),
    {
      message: "invalid_movement",
      path: ["moneyMovement"],
    },
  );

export const commandSchema = z.strictObject({
  businessId: businessIdSchema,
  operationId: z.uuid(),
  payload: payloadSchema,
});

export const createBusinessSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
});

export const createGuidedBusinessSchema = createBusinessSchema.extend({
  activity: z.enum(businessActivities),
});
export const renameBusinessSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  expectedRevision: z.number().int().min(1).max(2147483647),
});
