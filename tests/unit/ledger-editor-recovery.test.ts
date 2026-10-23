import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPendingLedgerStore } from "@/features/ledger/client/pending-command-store";
import {
  acknowledgeEditor,
  recoveredEditor,
  rememberEditor,
  settleEditorWrites,
} from "@/features/ledger/client/editor-recovery";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const business = "11111111-1111-4111-8111-111111111111",
  secondBusiness = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.restoreAllMocks());
describe("raw ledger editor recovery when browser writes fail", () => {
  it("keeps navigation blocked when a newer edit fails after the first flush succeeds", async () => {
    let firstSaved!: (value: boolean) => void,
      latestSaved!: (value: boolean) => void;
    const first = new Promise<boolean>((resolve) => {
      firstSaved = resolve;
    });
    const latest = new Promise<boolean>((resolve) => {
      latestSaved = resolve;
    });
    const writer = { current: first };
    const navigation = settleEditorWrites(writer, first);
    writer.current = latest;
    firstSaved(true);
    latestSaved(false);
    expect(await navigation).toBe(false);
  });
  it("retains incomplete amount/reason for the original owner and business across store remount", async () => {
    const name = "ledger-editor-" + crypto.randomUUID(),
      key = "record:correct";
    const store = createPendingLedgerStore(name);
    await store.saveEditor(user, business, key, {
      amount: "10.00",
      reason: "Previously saved",
    });
    const original = IDBObjectStore.prototype.put;
    const patched = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, value, suppliedKey) {
        if (this.name === "editors")
          throw new DOMException(
            "Synthetic storage full",
            "QuotaExceededError",
          );
        return original.call(this, value, suppliedKey!);
      });
    const raw = {
      amount: "12.",
      reason: "Unfinished correction",
      date: "2026-10-23",
    };
    await expect(
      store.saveEditor(user, business, key, raw),
    ).rejects.toBeDefined();
    raw.amount = "changed externally";
    store.close();
    const mounted = createPendingLedgerStore(name);
    expect(await mounted.readEditor(user, business, key)).toEqual({
      amount: "12.",
      reason: "Unfinished correction",
      date: "2026-10-23",
    });
    expect(await mounted.readEditor(other, business, key)).toBeNull();
    expect(await mounted.readEditor(user, secondBusiness, key)).toBeNull();
    patched.mockRestore();
    await mounted.saveEditor(user, business, key, {
      amount: "12.",
      reason: "Unfinished correction",
      date: "2026-10-23",
    });
    mounted.close();
    const reopened = createPendingLedgerStore(name);
    expect((await reopened.readEditor(user, business, key))?.amount).toBe(
      "12.",
    );
    await reopened.clearEditor(user, business, key);
    expect(await reopened.readEditor(user, business, key)).toBeNull();
    reopened.close();
  });
  it("does not let an old write acknowledgement erase newer unsaved raw values", () => {
    const name = "ledger-editor-" + crypto.randomUUID();
    const old = rememberEditor(name, user, business, "preparation", {
      raw: "old",
    });
    const latest = rememberEditor(name, user, business, "preparation", {
      raw: "12.",
      notes: "unknown",
    });
    acknowledgeEditor(name, user, business, "preparation", old);
    expect(recoveredEditor(name, user, business, "preparation")).toEqual({
      raw: "12.",
      notes: "unknown",
    });
    acknowledgeEditor(name, user, business, "preparation", latest);
    expect(recoveredEditor(name, user, business, "preparation")).toBeNull();
  });
});
