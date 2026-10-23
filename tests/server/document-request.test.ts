import { describe, expect, it } from "vitest";
import { readDocumentMutation } from "@/features/documents/server/document-request";
function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/documents", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...headers,
    },
  });
}
describe("document mutation boundary", () => {
  it("requires same-origin JSON and rejects malformed bodies", async () => {
    await expect(
      readDocumentMutation(
        request("{}", { Origin: "https://foreign.example" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
    await expect(
      readDocumentMutation(request("{}", { "Content-Type": "text/plain" })),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      readDocumentMutation(request("not json")),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("accepts bounded multi-row reviews beyond single-record budgets and rejects an oversize body", async () => {
    const rows = Array.from({ length: 50 }, (_, line) => ({
      line,
      description: "synthetic".repeat(50),
    }));
    expect(
      await readDocumentMutation(request(JSON.stringify({ rows }))),
    ).toEqual({ rows });
    await expect(
      readDocumentMutation(
        request(JSON.stringify({ data: "x".repeat(128 * 1024) })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 413 });
  });
});
