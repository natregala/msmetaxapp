import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appFetch } from "@/lib/client/app-fetch";
import { demoFetch } from "@/features/demo/demo-fetch";
import {
  getDemoImage,
  putDemoImage,
  resetDemo,
  withDemoState,
} from "@/features/demo/demo-store";
import { isConfigured } from "@/lib/supabase/server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public demo isolation and browser persistence", () => {
  it("saves simulated records without network calls and reopens them from IndexedDB", async () => {
    const network = vi
      .fn()
      .mockRejectedValue(new Error("Real network forbidden"));
    vi.stubGlobal("fetch", network);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    await resetDemo();
    const session = await (await appFetch("/api/session")).json();
    expect(session.data.user.email).toBeNull();
    const businesses = await (await appFetch("/api/businesses")).json();
    const businessId = businesses.data.businesses[0].id;
    const command = {
      businessId,
      operationId: crypto.randomUUID(),
      action: "create",
      expectedRevision: 0,
      values: {
        kind: "sale",
        businessDate: "2026-10-23",
        amountCentavos: "12345",
        description: "Sample transport sale",
        paymentStatus: "unpaid",
        paymentAmountCentavos: null,
        paymentDate: null,
      },
    };
    const first = await (
      await appFetch("/api/ledger", {
        method: "POST",
        body: JSON.stringify(command),
      })
    ).json();
    const retry = await (
      await appFetch("/api/ledger", {
        method: "POST",
        body: JSON.stringify(command),
      })
    ).json();
    expect(first.ok).toBe(true);
    expect(retry.data).toEqual(first.data);
    const reopened = new Dexie("msme-public-demo-v1");
    await reopened.open();
    const saved = await reopened.table("sessions").get("current");
    expect(
      saved.value.ledgers[businessId].details.filter(
        (entry: { record: { id: string } }) =>
          entry.record.id === first.data.id,
      ),
    ).toHaveLength(1);
    reopened.close();
    expect(network).not.toHaveBeenCalled();
  });

  it("rolls back source bytes and metadata together if a demo operation fails", async () => {
    await resetDemo();
    const before = await withDemoState((state) => state.businesses[0].name);
    const key = "sample-rollback-" + crypto.randomUUID();
    await expect(
      withDemoState(async (state) => {
        state.businesses[0].name = "Must roll back";
        await putDemoImage(key, new Blob(["sample"]));
        throw new Error("Synthetic failure");
      }),
    ).rejects.toThrow("Synthetic failure");
    expect(await withDemoState((state) => state.businesses[0].name)).toBe(
      before,
    );
    expect(await getDemoImage(key)).toBeNull();
  });

  it("reset rotates the demo scope while preserving an unrelated browser database", async () => {
    await resetDemo();
    const before = await withDemoState((state) => ({
      user: state.user.id,
      business: state.businesses[0].id,
    }));
    const unrelated = new Dexie("unrelated-owner-" + crypto.randomUUID());
    unrelated.version(1).stores({ drafts: "id" });
    await unrelated.table("drafts").put({ id: "real-work", amount: "12." });
    await resetDemo();
    const after = await withDemoState((state) => ({
      user: state.user.id,
      business: state.businesses[0].id,
    }));
    expect(after.user).not.toBe(before.user);
    expect(after.business).not.toBe(before.business);
    expect((await unrelated.table("drafts").get("real-work")).amount).toBe(
      "12.",
    );
    expect(
      (await demoFetch(`/api/ledger?businessId=${before.business}`)).status,
    ).toBe(403);
    unrelated.close();
    await unrelated.delete();
  });

  it("never falls through to live APIs or external hosts in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    for (const url of [
      "/api/auth/sign-in",
      "https://unrelated.example/api/ledger",
      "/not-an-api",
    ]) {
      expect((await appFetch(url)).ok).toBe(false);
    }
    expect(network).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      appFetch("/api/session", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps live provider access disabled in a demo even if provider variables exist", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sample.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-publishable");
    expect(isConfigured()).toBe(false);
  });

  it("preserves ordinary authenticated HTTP transport when demo mode is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const response = Response.json({ ok: true, data: {} });
    const network = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", network);
    expect(await appFetch("/api/session")).toBe(response);
    expect(network).toHaveBeenCalledWith("/api/session", undefined);
  });
});
