import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isDemoMode } from "@/lib/client/app-fetch";
import { demoDocumentImageUrl } from "@/features/demo/demo-documents";
import {
  detailSchema,
  documentSchema,
  type DocumentCommand,
} from "../document.schema";

export class DocumentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function request(path: string, options?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new DocumentError("NETWORK_ERROR");
  }
  const body = await response.json();
  if (!response.ok || !body?.ok)
    throw new DocumentError(body?.error?.code ?? "SERVER_ERROR");
  return body.data;
}
export const documentImageUrl = (businessId: string, documentId: string) =>
  isDemoMode()
    ? demoDocumentImageUrl(businessId, documentId)
    : `/api/documents?businessId=${encodeURIComponent(businessId)}&documentId=${encodeURIComponent(documentId)}&image=1`;
async function demoCall<T>(
  work: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  try {
    const result = await work();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "LOCAL_STORAGE_FAILED";
    throw new DocumentError(code);
  }
}
export async function listSourceDocuments(
  businessId: string,
  signal?: AbortSignal,
) {
  if (isDemoMode())
    return demoCall(async () => {
      const { listDemoDocuments } =
        await import("@/features/demo/demo-documents");
      return listDemoDocuments(businessId);
    }, signal);
  return z
    .object({ documents: z.array(documentSchema), ocrConfigured: z.boolean() })
    .parse(
      await request(
        `/api/documents?businessId=${encodeURIComponent(businessId)}`,
        { signal },
      ),
    );
}
export async function readSourceDocument(
  businessId: string,
  documentId: string,
  signal?: AbortSignal,
) {
  if (isDemoMode())
    return demoCall(async () => {
      const { readDemoDocument } =
        await import("@/features/demo/demo-documents");
      return readDemoDocument(businessId, documentId);
    }, signal);
  return detailSchema
    .extend({ ocrConfigured: z.boolean() })
    .parse(
      await request(
        `/api/documents?businessId=${encodeURIComponent(businessId)}&documentId=${encodeURIComponent(documentId)}`,
        { signal },
      ),
    );
}
export async function submitDocument(
  command: DocumentCommand,
  signal?: AbortSignal,
) {
  if (isDemoMode())
    return demoCall(async () => {
      const { mutateDemoDocument } =
        await import("@/features/demo/demo-documents");
      return mutateDemoDocument(command);
    }, signal);
  return z
    .object({
      detail: detailSchema,
      upload: z.object({ path: z.string(), token: z.string() }).optional(),
      ocrStatus: z.enum(["ready", "processing"]).optional(),
    })
    .parse(
      await request("/api/documents", {
        method: "POST",
        body: JSON.stringify(command),
        signal,
      }),
    );
}
export async function uploadDocumentImage(
  upload: { path: string; token: string },
  file: Blob,
) {
  if (isDemoMode())
    return demoCall(async () => {
      const { uploadDemoDocumentImage } =
        await import("@/features/demo/demo-documents");
      return uploadDemoDocumentImage(upload, file);
    });
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { error } = await client.storage
    .from("notebook-sources")
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type,
      cacheControl: "0",
    });
  if (error) throw new DocumentError("UPLOAD_FAILED");
}
