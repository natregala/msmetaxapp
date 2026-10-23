import "server-only";
import { z } from "zod";
import { OperationError } from "@/lib/http/result";
import type { SourceLine } from "../extraction.rules";

export function ocrConfigured() {
  return Boolean(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT &&
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  );
}
function config() {
  if (!ocrConfigured()) throw new OperationError("OCR_NOT_CONFIGURED", 503);
  const endpoint = new URL(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new OperationError("OCR_FAILED", 503);
  return { endpoint, key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY! };
}
function authorizedOperation(value: string, endpoint: URL) {
  const operation = new URL(value);
  if (
    operation.origin !== endpoint.origin ||
    !operation.pathname.startsWith(
      "/documentintelligence/documentModels/prebuilt-read/analyzeResults/",
    )
  )
    throw new OperationError("OCR_FAILED", 503);
  return operation;
}
export async function startRead(
  bytes: Uint8Array,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const { endpoint, key } = config();
  const url = new URL(
    "/documentintelligence/documentModels/prebuilt-read:analyze",
    endpoint,
  );
  url.searchParams.set("api-version", "2024-11-30");
  url.searchParams.set("pages", "1");
  const response = await fetcher(url, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },
    body: JSON.stringify({
      base64Source: Buffer.from(bytes).toString("base64"),
    }),
  });
  const location = response.headers.get("operation-location");
  if (response.status !== 202 || !location)
    throw new OperationError("OCR_FAILED", 503);
  return authorizedOperation(location, endpoint).toString();
}
const readResultSchema = z.object({
  status: z.enum(["notStarted", "running", "succeeded", "failed"]),
  analyzeResult: z
    .object({
      pages: z
        .array(
          z.object({
            pageNumber: z.number().int(),
            lines: z
              .array(z.object({ content: z.string().max(1000) }))
              .max(1000),
          }),
        )
        .max(1),
    })
    .optional(),
});
export async function pollRead(
  location: string,
  fetcher: typeof fetch = fetch,
): Promise<SourceLine[] | null> {
  const { endpoint, key } = config();
  const url = authorizedOperation(location, endpoint);
  const response = await fetcher(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  if (!response.ok) throw new OperationError("OCR_FAILED", 503);
  const parsed = readResultSchema.safeParse(await response.json());
  if (!parsed.success) throw new OperationError("OCR_FAILED", 503);
  if (parsed.data.status === "failed")
    throw new OperationError("OCR_JOB_FAILED", 503);
  if (parsed.data.status !== "succeeded") return null;
  const page = parsed.data.analyzeResult?.pages[0];
  if (!page || page.pageNumber !== 1)
    throw new OperationError("OCR_FAILED", 503);
  return page.lines
    .slice(0, 50)
    .map((line, index) => ({ page: 1, line: index + 1, text: line.content }));
}
