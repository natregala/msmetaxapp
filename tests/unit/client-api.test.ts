import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGuidedBusiness,
  renameBusiness,
  confirmTransaction,
  getSession,
} from "../../src/features/transactions/client/api";
import { buildCommand } from "../../src/features/transactions/transaction.rules";

afterEach(() => vi.unstubAllGlobals());

describe("HTTP acceptance boundary", () => {
  it("sends business setup and a revision-protected name correction through their explicit operations", async () => {
    const business = {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Sample",
      activity: "services",
      setupCompleted: true,
      profileRevision: 1,
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ ok: true, data: { business } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await createGuidedBusiness("Sample", "services", business.id),
    ).toEqual(business);
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ id: business.id, name: "Sample", activity: "services" }),
    );
    await renameBusiness(business.id, "Corrected", 1);
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[1][1].body).toBe(
      JSON.stringify({
        id: business.id,
        name: "Corrected",
        expectedRevision: 1,
      }),
    );
  });
  const command = buildCommand(
    "10000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000001",
    {
      amount: "0.10",
      businessDate: "2026-10-23",
      kind: "sale",
      description: "",
      moneyMovement: "unknown",
    },
  );

  it("retries the exact supplied operation and only acknowledges a successful server result", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("disconnected"))
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          data: { id: "30000000-0000-4000-8000-000000000001", revision: 1 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(confirmTransaction(command)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    await expect(confirmTransaction(command)).resolves.toEqual({
      id: "30000000-0000-4000-8000-000000000001",
      revision: 1,
    });
    expect(fetchMock.mock.calls[0][1].body).toBe(
      fetchMock.mock.calls[1][1].body,
    );
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("propagates a stable authorization failure for translated UI handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { ok: false, error: { code: "FORBIDDEN" } },
            { status: 403 },
          ),
        ),
    );
    await expect(confirmTransaction(command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects malformed or failed responses rather than claiming acceptance", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("gateway unavailable", { status: 502 }),
      )
      .mockResolvedValueOnce(
        Response.json({ ok: true, data: {} }, { status: 500 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(confirmTransaction(command)).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
    await expect(confirmTransaction(command)).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
  });

  it("preserves cancellation so stale session work can be ignored", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(getSession()).rejects.toBe(abort);
  });
  it("does not acknowledge a 200 response without an authoritative record and revision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ok: true, data: {} })),
    );
    await expect(confirmTransaction(command)).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
  });
});
