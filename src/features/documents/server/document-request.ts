import "server-only";
import { OperationError } from "@/lib/http/result";
/** Proposals have a bounded larger JSON budget than a single transaction command. */
export async function readDocumentMutation(request: Request): Promise<unknown> {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new OperationError("INVALID_ORIGIN", 403);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new OperationError("INVALID_REQUEST", 415);
  const limit = 128 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new OperationError("INVALID_REQUEST", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OperationError("INVALID_REQUEST");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new OperationError("INVALID_REQUEST", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OperationError("INVALID_REQUEST");
  }
}
