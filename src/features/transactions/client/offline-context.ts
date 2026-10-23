import { z } from "zod";
import { businessActivities, type Business } from "../transaction.types";
const contextSchema = z.strictObject({
  userId: z.uuid(),
  businesses: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      activity: z.enum(businessActivities).nullable(),
      setupCompleted: z.boolean(),
      profileRevision: z.number().int().positive(),
    }),
  ),
});
const key = "msme-active-device-workspace-v1";
export function rememberOfflineContext(userId: string, businesses: Business[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ userId, businesses }));
  } catch {
    /* Draft saving has its own visible persistence status. */
  }
}
export function offlineContext() {
  try {
    const parsed = contextSchema.safeParse(
      JSON.parse(localStorage.getItem(key) ?? "null"),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function forgetOfflineContext() {
  try {
    localStorage.removeItem(key);
  } catch {
    /* An unavailable store contains no readable workspace. */
  }
}
