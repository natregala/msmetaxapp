import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  failure,
  OperationError,
  readMutation,
  success,
} from "../../src/lib/http/result";

function mutation(body: string, headers: Record<string, string> = {}) {
  return new Request("https://records.example/api/transactions", {
    method: "POST",
    headers: {
      origin: "https://records.example",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

describe("cookie-authenticated HTTP boundary", () => {
  it("accepts JSON from the exact application origin", async () => {
    await expect(
      readMutation(mutation('{"amountCentavos":"100"}')),
    ).resolves.toEqual({ amountCentavos: "100" });
  });
  it.each([
    "https://other.example",
    "null",
    "https://records.example.evil.test",
    "http://records.example",
  ])("rejects the foreign origin %s", async (origin) => {
    await expect(
      readMutation(mutation("{}", { origin })),
    ).rejects.toMatchObject({ code: "INVALID_ORIGIN", status: 403 });
  });
  it("requires origin and JSON content type", async () => {
    await expect(
      readMutation(
        new Request("https://records.example/api/transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
    await expect(
      readMutation(mutation("{}", { "content-type": "text/plain" })),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 415 });
  });
  it("rejects excessive bytes even without a content-length header", async () => {
    await expect(
      readMutation(
        mutation(JSON.stringify({ description: "😀".repeat(5000) })),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects invalid JSON and oversized declared content", async () => {
    await expect(readMutation(mutation("not JSON"))).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(
      readMutation(mutation("{}", { "content-length": "20000" })),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("prevents cached authenticated responses and hides provider error details", async () => {
    const ok = success({ id: "example" });
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("vary")).toBe("Cookie");
    const problem = failure(new Error("secret database SQL and credentials"));
    expect(problem.status).toBe(500);
    expect(await problem.json()).toEqual({
      ok: false,
      error: { code: "SERVER_ERROR" },
    });
  });
  it("returns stable permission and validation feedback", async () => {
    expect(failure(new OperationError("FORBIDDEN", 403)).status).toBe(403);
    const parsed = z
      .object({ businessId: z.uuid() })
      .safeParse({ businessId: "bad" });
    if (parsed.success) throw new Error("fixture should be invalid");
    const response = failure(parsed.error);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fields: { businessId: expect.any(String) },
      },
    });
  });
});
