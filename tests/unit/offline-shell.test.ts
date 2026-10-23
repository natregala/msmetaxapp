import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync("public/sw.js", "utf8");
type RequestLike = { url: string; method: string; mode: string };
function worker(
  cache: Record<string, unknown>,
  fetcher: ReturnType<typeof vi.fn>,
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: { origin: "https://app.example" },
    clients: { claim: vi.fn() },
    addEventListener: (type: string, callback: (event: unknown) => void) =>
      listeners.set(type, callback),
  };
  runInNewContext(script, {
    self,
    caches: cache,
    fetch: fetcher,
    URL,
    Response,
    Set,
  });
  return (path: string, mode = "cors") => {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: {
        url: "https://app.example" + path,
        method: "GET",
        mode,
      } satisfies RequestLike,
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    return response;
  };
}
describe("offline shell cache failure behavior", () => {
  it("keeps online JavaScript usable when cache storage cannot open", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("network script"));
    const request = worker(
      { open: vi.fn().mockRejectedValue(Error("storage unavailable")) },
      fetcher,
    );
    const response = await request("/_next/static/chunks/app.js");
    expect(await response!.text()).toBe("network script");
  });
  it("keeps successful online assets when cache lookup or quota writes fail", async () => {
    for (const match of [
      vi.fn().mockRejectedValue(Error("cache unreadable")),
      vi.fn().mockResolvedValue(undefined),
    ]) {
      const fetcher = vi.fn().mockResolvedValue(new Response("network asset"));
      const request = worker(
        {
          open: vi.fn().mockResolvedValue({
            match,
            put: vi.fn().mockRejectedValue(Error("quota exceeded")),
          }),
        },
        fetcher,
      );
      const response = await request("/brand/asset.svg");
      expect(await response!.text()).toBe("network asset");
    }
  });
  it("never intercepts authenticated API, recovery, or private source requests", () => {
    const open = vi.fn(),
      request = worker({ open }, vi.fn());
    for (const path of [
      "/api/session",
      "/api/ledger",
      "/api/documents",
      "/recover",
      "/api/auth/callback?code=secret",
    ])
      expect(request(path, "navigate")).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });
  it("returns a readable fallback if offline shell storage is unavailable", async () => {
    const request = worker(
      { open: vi.fn().mockRejectedValue(Error("no cache")) },
      vi.fn().mockRejectedValue(Error("offline")),
    );
    const response = await request("/", "navigate");
    expect(response!.status).toBe(503);
    expect(await response!.text()).toContain("Kumonekta");
  });
});
