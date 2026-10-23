import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  values: new Map<string, string>(),
}));
vi.mock("../../src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fixture.db,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      fixture.values.has(key) ? { value: fixture.values.get(key) } : undefined,
    set: (key: string, value: string) => fixture.values.set(key, value),
    delete: (key: string) => fixture.values.delete(key),
  }),
}));
import {
  exchangeEmailCode,
  requestRecovery,
  updateRecoveredPassword,
} from "../../src/features/auth/server/recovery-service";
beforeEach(() => {
  fixture.values.clear();
  fixture.db = {};
});
it("requests a PKCE recovery redirect without claiming email delivery or account existence", async () => {
  const reset = vi.fn().mockResolvedValue({ error: null });
  fixture.db = { auth: { resetPasswordForEmail: reset } };
  expect(
    await requestRecovery(
      { email: "synthetic@example.test" },
      "https://example.test",
    ),
  ).toEqual({ requested: true });
  expect(reset).toHaveBeenCalledWith("synthetic@example.test", {
    redirectTo: "https://example.test/api/auth/callback?flow=recovery",
  });
});
it("rejects expired links and does not grant a recovery capability", async () => {
  fixture.db = {
    auth: {
      exchangeCodeForSession: async () => ({
        data: {},
        error: { code: "flow_state_expired" },
      }),
    },
  };
  await expect(exchangeEmailCode("expired", "recovery")).rejects.toMatchObject({
    code: "INVALID_RECOVERY",
  });
  expect(fixture.values.has("msme-recovery")).toBe(false);
});
it("requires current verified identity and the recovery capability before changing a password", async () => {
  const update = vi.fn().mockResolvedValue({ error: null });
  fixture.db = {
    auth: {
      getUser: async () => ({ data: { user: { id: "owner-a" } }, error: null }),
      updateUser: update,
    },
  };
  await expect(
    updateRecoveredPassword({ password: "Synthetic-new-pass-123" }),
  ).rejects.toMatchObject({ code: "INVALID_RECOVERY" });
  fixture.values.set("msme-recovery", "owner-b");
  await expect(
    updateRecoveredPassword({ password: "Synthetic-new-pass-123" }),
  ).rejects.toMatchObject({ code: "INVALID_RECOVERY" });
  expect(update).not.toHaveBeenCalled();
  fixture.values.set("msme-recovery", "owner-a");
  expect(
    await updateRecoveredPassword({ password: "Synthetic-new-pass-123" }),
  ).toEqual({ updated: true });
  expect(fixture.values.has("msme-recovery")).toBe(false);
});
it("only grants recovery after a successful server-side code exchange", async () => {
  fixture.db = {
    auth: {
      exchangeCodeForSession: async () => ({
        data: {
          user: { id: "owner-a" },
          session: { access_token: "synthetic" },
        },
        error: null,
      }),
    },
  };
  expect(await exchangeEmailCode("synthetic-code", "confirm")).toEqual({
    recovery: false,
  });
  expect(fixture.values.size).toBe(0);
  expect(await exchangeEmailCode("synthetic-code", "recovery")).toEqual({
    recovery: true,
  });
  expect(fixture.values.get("msme-recovery")).toBe("owner-a");
});
