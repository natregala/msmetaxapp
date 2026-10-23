import { z } from "zod";
import {
  isBusinessDate,
  isCanonicalCentavos,
} from "@/features/transactions/transaction.rules";
import { transactionKinds } from "@/features/transactions/transaction.types";
import { preparationValuesSchema } from "@/features/preparation/preparation.schema";

export const ledgerAmount = z
  .string()
  .refine(isCanonicalCentavos, "invalid_amount");
export const ledgerDate = z.string().refine(isBusinessDate, "invalid_date");
const reason = z.string().trim().min(1).max(500);
const description = z.string().trim().min(1).max(500).nullable();
const base = {
  businessId: z.uuid(),
  operationId: z.uuid(),
  expectedRevision: z.number().int().nonnegative().max(2147483646),
};
const existing = {
  ...base,
  recordId: z.uuid(),
  expectedRevision: z.number().int().positive().max(2147483646),
};
export const ledgerCreateValues = z
  .strictObject({
    businessDate: ledgerDate,
    kind: z.enum(["sale", "expense", "owner_contribution", "owner_withdrawal"]),
    amountCentavos: ledgerAmount,
    description,
    paymentStatus: z.enum(["paid", "unpaid", "partial", "unknown"]),
    paymentAmountCentavos: ledgerAmount.nullable(),
    paymentDate: ledgerDate.nullable(),
  })
  .superRefine((v, ctx) => {
    if (
      !isCanonicalCentavos(v.amountCentavos) ||
      (v.paymentAmountCentavos !== null &&
        !isCanonicalCentavos(v.paymentAmountCentavos))
    )
      return;
    const amount = BigInt(v.amountCentavos),
      paid =
        v.paymentAmountCentavos === null
          ? null
          : BigInt(v.paymentAmountCentavos);
    const add = (message: string) =>
      ctx.addIssue({
        code: "custom",
        message,
        path: ["paymentAmountCentavos"],
      });
    if (v.paymentStatus === "paid" && (paid !== amount || !v.paymentDate))
      add("invalid_full_payment");
    if (
      v.paymentStatus === "partial" &&
      (paid === null || paid <= 0n || paid >= amount || !v.paymentDate)
    )
      add("invalid_partial_payment");
    if (
      ["unpaid", "unknown"].includes(v.paymentStatus) &&
      (paid !== null || v.paymentDate !== null)
    )
      add("unexpected_payment");
    if (
      !["sale", "expense"].includes(v.kind) &&
      !["paid", "unknown"].includes(v.paymentStatus)
    )
      add("unsupported_payment_status");
    if (v.paymentDate && v.paymentDate < v.businessDate)
      ctx.addIssue({
        code: "custom",
        message: "payment_before_record",
        path: ["paymentDate"],
      });
  });
export const ledgerCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...base,
    action: z.literal("create"),
    expectedRevision: z.literal(0),
    values: ledgerCreateValues,
  }),
  z.strictObject({
    ...existing,
    action: z.literal("correct"),
    values: z.strictObject({
      kind: z.enum(transactionKinds),
      businessDate: ledgerDate,
      amountCentavos: ledgerAmount,
      description,
      reason,
    }),
  }),
  z.strictObject({
    ...existing,
    action: z.literal("void"),
    values: z.strictObject({ reason }),
  }),
  z.strictObject({
    ...existing,
    action: z.literal("add_payment"),
    values: z.strictObject({
      amountCentavos: ledgerAmount,
      paymentDate: ledgerDate,
    }),
  }),
  z.strictObject({
    ...existing,
    action: z.literal("correct_payment"),
    values: z.strictObject({
      paymentId: z.uuid(),
      expectedPaymentRevision: z.number().int().positive(),
      amountCentavos: ledgerAmount,
      paymentDate: ledgerDate,
      reason,
    }),
  }),
  z.strictObject({
    ...existing,
    action: z.literal("void_payment"),
    values: z.strictObject({
      paymentId: z.uuid(),
      expectedPaymentRevision: z.number().int().positive(),
      reason,
    }),
  }),
  z.strictObject({
    ...existing,
    action: z.literal("resolve_payment"),
    values: z.strictObject({
      paymentKnowledge: z.enum(["known", "unknown"]),
      reason,
    }),
  }),
]);
export const ledgerFilterSchema = z
  .object({
    businessId: z.uuid(),
    from: ledgerDate.optional(),
    to: ledgerDate.optional(),
    kind: z.enum(transactionKinds).optional(),
    payment: z
      .enum(["paid", "unpaid", "partial", "unknown", "needs_attention"])
      .optional(),
    status: z.enum(["active", "void"]).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "invalid_period",
    path: ["to"],
  });
export const ledgerPeriodSchema = z
  .strictObject({ businessId: z.uuid(), from: ledgerDate, to: ledgerDate })
  .refine((v) => v.from <= v.to, "invalid_period");
export const snapshotSchema = z
  .strictObject({
    businessId: z.uuid(),
    operationId: z.uuid(),
    from: ledgerDate,
    to: ledgerDate,
    preparation: z
      .strictObject({
        profileRevision: z.number().int().positive(),
        profile: preparationValuesSchema,
      })
      .nullable()
      .optional(),
  })
  .refine((v) => v.from <= v.to, "invalid_period");

export const ledgerRecordSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  kind: z.enum(transactionKinds),
  businessDate: ledgerDate,
  amountCentavos: ledgerAmount,
  description: z.string().nullable(),
  moneyMovement: z.enum(["in", "out", "none", "unknown"]),
  revision: z.number().int().positive(),
  status: z.enum(["active", "void"]),
  paymentKnowledge: z.enum(["known", "unknown"]),
  paidCentavos: ledgerAmount,
  remainingCentavos: ledgerAmount.nullable(),
  paymentStatus: z.enum(["paid", "unpaid", "partial", "unknown"]),
  recordedAt: z.string(),
  source: z.enum(["manual", "document_review"]),
  sourceReference: z
    .object({ documentId: z.uuid(), rowId: z.uuid(), sourceType: z.string() })
    .nullable(),
});
export const ledgerPaymentSchema = z.object({
  id: z.uuid(),
  transactionId: z.uuid(),
  amountCentavos: ledgerAmount,
  paymentDate: ledgerDate.nullable(),
  status: z.enum(["active", "void"]),
  revision: z.number().int().positive(),
  recordedAt: z.string(),
});
const historySchema = z.object({
  revision: z.number().int().positive(),
  previousRevision: z.number().int().nonnegative(),
  actorId: z.uuid(),
  recordedAt: z.string(),
  interpretation: z.record(z.string(), z.unknown()),
});
export const ledgerDetailSchema = z.object({
  record: ledgerRecordSchema,
  payments: z.array(ledgerPaymentSchema),
  history: z.array(historySchema),
  paymentHistory: z.array(historySchema.extend({ paymentId: z.uuid() })),
});
export const ledgerListSchema = z.object({
  records: z.array(ledgerRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.literal(25),
});
export const ledgerSummarySchema = z.object({
  from: ledgerDate,
  to: ledgerDate,
  records: z.array(ledgerRecordSchema),
  payments: z.array(ledgerPaymentSchema),
  coverage: z.string(),
  totals: z.object({
    salesCentavos: z.string().regex(/^(0|[1-9]\d*)$/),
    expensesCentavos: z.string().regex(/^(0|[1-9]\d*)$/),
    receivedCentavos: z.string().regex(/^(0|[1-9]\d*)$/),
    paidCentavos: z.string().regex(/^(0|[1-9]\d*)$/),
    receivableCentavos: z.string().regex(/^(0|[1-9]\d*)$/),
    payableCentavos: z.string().regex(/^(0|[1-9]\d*)$/),
    unknownCount: z.number().int().nonnegative(),
    recordCount: z.number().int().nonnegative(),
    voidCount: z.number().int().nonnegative(),
    undatedPaymentCount: z.number().int().nonnegative(),
  }),
});
export const ledgerSnapshotSchema = ledgerSummarySchema.extend({
  id: z.uuid(),
  businessId: z.uuid(),
  createdAt: z.string(),
  ledgerVersion: z.string().regex(/^\d+$/),
  stale: z.boolean(),
  preparation: z.record(z.string(), z.unknown()).nullable(),
  manifest: z.array(
    z.object({ recordId: z.uuid(), revision: z.number().int().positive() }),
  ),
});
