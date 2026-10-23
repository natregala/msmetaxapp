import Dexie from "dexie";
import { z } from "zod";
import { businessActivities } from "@/features/transactions/transaction.types";
const schema = z.strictObject({
  userId: z.uuid(),
  id: z.uuid(),
  name: z.string().max(100),
  activity: z.enum(businessActivities).nullable(),
  step: z.enum(["name", "activity", "task"]),
  task: z.enum(["sale", "expense", "home"]).nullable(),
  revision: z.number().int().nonnegative(),
});
export type SetupDraft = z.infer<typeof schema>;
const db = new Dexie("msme-setup-v1");
db.version(1).stores({ setups: "userId" });
export async function loadSetup(userId: string): Promise<SetupDraft | null> {
  const row = await db.table("setups").get(userId);
  return row ? schema.parse(row) : null;
}
export async function saveSetup(
  draft: SetupDraft,
  expectedRevision: number | null,
): Promise<SetupDraft> {
  const parsed = schema.parse(draft);
  return db.transaction("rw", db.table("setups"), async () => {
    const current = (await db.table("setups").get(parsed.userId)) as
      SetupDraft | undefined;
    if ((current?.revision ?? null) !== expectedRevision)
      throw new Error("LOCAL_DRAFT_CONFLICT");
    if (
      current?.task &&
      JSON.stringify({ ...current, revision: 0 }) !==
        JSON.stringify({ ...parsed, revision: 0 })
    )
      throw new Error("LOCAL_DRAFT_CONFLICT");
    const next = { ...parsed, revision: (expectedRevision ?? 0) + 1 };
    await db.table("setups").put(next);
    return next;
  });
}
export async function completeSetup(userId: string, id: string) {
  await db.transaction("rw", db.table("setups"), async () => {
    const row = await db.table("setups").get(userId);
    if (row?.id === id) await db.table("setups").delete(userId);
  });
}
