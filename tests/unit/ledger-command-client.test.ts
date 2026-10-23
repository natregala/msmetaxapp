import { afterEach, describe, expect, it, vi } from "vitest";
import { sendReviewedOperation } from "@/features/ledger/client/commands";
afterEach(() => {
  vi.unstubAllGlobals();
});
function reply(data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}
describe("maintenance command acknowledgement", () => {
  it("rejects malformed or absent success receipts instead of authorizing pending cleanup", async () => {
    for (const data of [
      {},
      { id: "bad", revision: 1 },
      { id: "11111111-1111-4111-8111-111111111111", revision: 0 },
      null,
    ]) {
      reply(data);
      await expect(
        sendReviewedOperation({
          businessId: "11111111-1111-4111-8111-111111111111",
          operationId: "22222222-2222-4222-8222-222222222222",
        }),
      ).rejects.toMatchObject({ code: "SERVER_ERROR" });
    }
  });
  it("accepts a validated mutation acknowledgement and forbids arbitrary endpoints", async () => {
    const data = { id: "11111111-1111-4111-8111-111111111111", revision: 3 };
    reply(data);
    expect(
      await sendReviewedOperation({
        businessId: data.id,
        operationId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual(data);
    await expect(
      sendReviewedOperation({ _endpoint: "https://unrelated.invalid/" }),
    ).rejects.toMatchObject({ code: "INVALID_LOCAL_OPERATION" });
  });
  it("validates both snapshot and preparation profile results before cleanup", async () => {
    reply({});
    for (const _endpoint of [
      "/api/ledger/snapshots",
      "/api/preparation/profile",
    ])
      await expect(sendReviewedOperation({ _endpoint })).rejects.toMatchObject({
        code: "SERVER_ERROR",
      });
  });
});
