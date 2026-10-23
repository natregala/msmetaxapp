import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class OperationError extends Error {
  constructor(
    public code: string,
    public status: number = 400,
    public fields?: Record<string, string>,
  ) {
    super(code);
  }
}

export function success<T>(data: T) {
  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
}

export function failure(error: unknown) {
  let issue =
    error instanceof OperationError
      ? error
      : new OperationError("SERVER_ERROR", 500);
  if (error instanceof Error && error.message === "NOT_CONFIGURED")
    issue = new OperationError("NOT_CONFIGURED", 503);
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(
      error.issues.map((entry) => [entry.path.join("."), entry.message]),
    );
    issue = new OperationError("VALIDATION_ERROR", 422, fields);
  }
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: issue.code,
        ...(issue.fields ? { fields: issue.fields } : {}),
      },
    },
    {
      status: issue.status,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    },
  );
}

export async function readMutation(request: Request): Promise<unknown> {
  // Cookie-authenticated writes only accept same-origin JSON. No permissive CORS.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new OperationError("INVALID_ORIGIN", 403);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new OperationError("INVALID_REQUEST", 415);
  const limit = 16384;
  if (Number(request.headers.get("content-length")) > limit)
    throw new OperationError("INVALID_REQUEST", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OperationError("INVALID_REQUEST");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
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
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError("INVALID_REQUEST");
  }
}
