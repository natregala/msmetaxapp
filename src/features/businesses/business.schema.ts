import { z } from "zod";

export const businessActivities = [
  "products",
  "services",
  "both",
  "other",
] as const;
export const businessProfileSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  activity: z.enum(businessActivities).nullable(),
  setupCompleted: z.boolean(),
  profileRevision: z.number().int().positive(),
});
export const businessCreationSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  activity: z.enum(businessActivities).optional(),
});
export const businessRenameSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  expectedRevision: z.number().int().positive(),
});
