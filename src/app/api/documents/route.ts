import { failure, success } from "@/lib/http/result";
import {
  getDocuments,
  changeDocument,
  getDocumentImage,
} from "@/features/documents/server/document-service";
import { readDocumentMutation } from "@/features/documents/server/document-request";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = {
      businessId: params.get("businessId"),
      ...(params.get("documentId")
        ? { documentId: params.get("documentId")! }
        : {}),
    };
    if (params.get("image") === "1") {
      const result = await getDocumentImage(input);
      return new Response(result.bytes.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": result.mime,
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    }
    return success(await getDocuments(input));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return success(await changeDocument(await readDocumentMutation(request)));
  } catch (error) {
    return failure(error);
  }
}
