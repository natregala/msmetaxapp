import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  loadSetup,
  saveSetup,
  completeSetup,
  type SetupDraft,
} from "../../src/features/businesses/client/setup-drafts";
it("persists non-sensitive setup and frozen completion identity; stale tabs cannot replace it", async () => {
  const userId = crypto.randomUUID(),
    id = crypto.randomUUID();
  const first: SetupDraft = {
    userId,
    id,
    name: "Synthetic QC shop",
    activity: "products",
    step: "activity",
    task: null,
    revision: 0,
  };
  const saved = await saveSetup(first, null);
  expect(await loadSetup(userId)).toEqual(saved);
  const frozen = await saveSetup(
    { ...saved, step: "task", task: "home" },
    saved.revision,
  );
  await expect(
    saveSetup({ ...saved, name: "Stale tab" }, saved.revision),
  ).rejects.toThrow("LOCAL_DRAFT_CONFLICT");
  await expect(
    saveSetup({ ...frozen, name: "Changed after send" }, frozen.revision),
  ).rejects.toThrow("LOCAL_DRAFT_CONFLICT");
  expect((await loadSetup(userId))?.id).toBe(id);
  expect(await loadSetup(crypto.randomUUID())).toBeNull();
  await completeSetup(userId, crypto.randomUUID());
  expect(await loadSetup(userId)).not.toBeNull();
  await completeSetup(userId, id);
  expect(await loadSetup(userId)).toBeNull();
});
