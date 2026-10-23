import {
  businessCreationSchema,
  businessRenameSchema,
} from "@/features/businesses/business.schema";
import { createDemoLedgerState, handleDemoLedgerRequest } from "./demo-ledger";
import { withDemoState } from "./demo-store";

function reply(data: unknown, status = 200, headers?: Record<string, string>) {
  if (typeof data === "string") return new Response(data, { status, headers });
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function fail(code: string, status = 422) {
  return reply({ ok: false, error: { code } }, status);
}

/** No API call in demo mode falls through to the network or the real database. */
export async function demoFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  init.signal?.throwIfAborted();
  const base =
    typeof window === "undefined"
      ? "http://demo.local"
      : window.location.origin;
  const url = new URL(input, base);
  if (url.origin !== base || !url.pathname.startsWith("/api/"))
    return fail("DEMO_ONLY", 403);
  const method = (init.method ?? "GET").toUpperCase();
  let body: unknown = null;
  if (init.body) {
    try {
      body = JSON.parse(String(init.body));
    } catch {
      return fail("VALIDATION_ERROR");
    }
  }
  try {
    const response = await withDemoState((state) => {
      init.signal?.throwIfAborted();
      if (url.pathname === "/api/session" && method === "GET")
        return reply({ ok: true, data: { user: state.user } });
      if (url.pathname === "/api/businesses") {
        if (method === "GET")
          return reply({ ok: true, data: { businesses: state.businesses } });
        if (method === "POST") {
          const parsed = businessCreationSchema.safeParse(body);
          if (!parsed.success) return fail("VALIDATION_ERROR");
          const command = parsed.data;
          const signature = JSON.stringify(command);
          const found = state.businesses.find(
            (entry) => entry.id === command.id,
          );
          if (found)
            return state.businessReceipts[command.id] === signature
              ? reply({ ok: true, data: { business: found } })
              : fail("CONFLICT", 409);
          const business = {
            id: command.id,
            name: command.name,
            activity: command.activity ?? null,
            setupCompleted: true,
            profileRevision: 1,
          };
          state.businesses.push(business);
          state.businessReceipts[business.id] = signature;
          state.ledgers[business.id] = createDemoLedgerState(
            business.id,
            state.user.id,
          );
          return reply({ ok: true, data: { business } });
        }
        if (method === "PATCH") {
          const parsed = businessRenameSchema.safeParse(body);
          if (!parsed.success) return fail("VALIDATION_ERROR");
          const found = state.businesses.find(
            (entry) => entry.id === parsed.data.id,
          );
          if (!found) return fail("FORBIDDEN", 403);
          if (found.profileRevision !== parsed.data.expectedRevision)
            return fail("CONFLICT", 409);
          found.name = parsed.data.name;
          found.profileRevision++;
          return reply({ ok: true, data: { business: found } });
        }
      }
      const businessId =
        url.searchParams.get("businessId") ??
        (body && typeof body === "object" && "businessId" in body
          ? String(body.businessId)
          : "");
      const ledger = state.ledgers[businessId];
      if (!ledger) return fail("FORBIDDEN", 403);
      const result = handleDemoLedgerRequest(ledger, { url, method, body });
      if (!result) return fail("DEMO_ONLY", 400);
      state.ledgers[businessId] = result.state;
      return reply(result.body, result.status, result.headers);
    });
    init.signal?.throwIfAborted();
    return response;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    return fail("LOCAL_STORAGE_FAILED", 503);
  }
}
