import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ocrConfigured,
  startRead,
  pollRead,
} from "@/features/documents/server/azure-read";
afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv(
    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    "https://synthetic.cognitiveservices.azure.com",
  );
  vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY", "synthetic-provider-key");
}
describe("Azure reading adapter, mocked provider transport", () => {
  it("blocks missing credentials without sending a request", async () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY", "");
    const fetcher = vi.fn();
    expect(ocrConfigured()).toBe(false);
    await expect(startRead(new Uint8Array([1]), fetcher)).rejects.toMatchObject(
      { code: "OCR_NOT_CONFIGURED" },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only authorized image bytes and restricts returned job URLs", async () => {
    configure();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: {
          "operation-location":
            "https://synthetic.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/synthetic?api-version=2024-11-30",
        },
      }),
    );
    const url = await startRead(new Uint8Array([1, 2, 3]), fetcher);
    expect(url).toContain("/prebuilt-read/analyzeResults/");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      base64Source: "AQID",
    });
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
    fetcher.mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { "operation-location": "https://unrelated.example/secret" },
      }),
    );
    await expect(startRead(new Uint8Array([1]), fetcher)).rejects.toMatchObject(
      { code: "OCR_FAILED" },
    );
  });
  it("retains running state and validates lines from a finished first-page job", async () => {
    configure();
    const location =
      "https://synthetic.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/synthetic";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: "running" }))
      .mockResolvedValueOnce(
        Response.json({
          status: "succeeded",
          analyzeResult: {
            pages: [
              {
                pageNumber: 1,
                lines: [{ content: "2026-10-23 | Rice | 12.50 | paid" }],
              },
            ],
          },
        }),
      );
    expect(await pollRead(location, fetcher)).toBeNull();
    expect(await pollRead(location, fetcher)).toEqual([
      { page: 1, line: 1, text: "2026-10-23 | Rice | 12.50 | paid" },
    ]);
  });
  it("never polls arbitrary client URLs or trusts malformed extraction data", async () => {
    configure();
    const fetcher = vi.fn();
    await expect(
      pollRead("https://another.example/private", fetcher),
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(
      Response.json({
        status: "succeeded",
        analyzeResult: { pages: [{ pageNumber: 2, lines: [] }] },
      }),
    );
    await expect(
      pollRead(
        "https://synthetic.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/synthetic",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
  });
  it("distinguishes a definitively failed provider job from an uncertain network response", async () => {
    configure();
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ status: "failed" }));
    await expect(
      pollRead(
        "https://synthetic.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/synthetic",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "OCR_JOB_FAILED" });
    fetcher.mockRejectedValue(new Error("synthetic connection lost"));
    await expect(
      pollRead(
        "https://synthetic.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/synthetic",
        fetcher,
      ),
    ).rejects.toThrow("synthetic connection lost");
  });
});
