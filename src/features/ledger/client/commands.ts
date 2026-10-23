import { appFetch } from "@/lib/client/app-fetch";
import type {
  LedgerDetail,
  LedgerList,
  LedgerSnapshot,
  LedgerSummary,
} from "../ledger.types";
import type { PreparationProfile } from "@/features/preparation/preparation.schema";
import { preparationValuesSchema } from "@/features/preparation/preparation.schema";
import { ledgerSnapshotSchema } from "../ledger.schema";
import { z } from "zod";

export class LedgerApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
export async function ledgerRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await appFetch(url, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new LedgerApiError("NETWORK_ERROR", 0);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new LedgerApiError("SERVER_ERROR", response.status);
  }
  if (!response.ok || body?.ok !== true)
    throw new LedgerApiError(
      body?.error?.code ?? "SERVER_ERROR",
      response.status,
    );
  return body.data as T;
}
export type LedgerFilters = {
  from: string;
  to: string;
  kind: string;
  payment: string;
  status: string;
  search: string;
};
export function listLedger(
  businessId: string,
  filters: LedgerFilters,
  page: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ businessId, page: String(page) });
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  return ledgerRequest<LedgerList>(`/api/ledger?${params}`, { signal });
}
export function ledgerDetail(
  businessId: string,
  id: string,
  signal?: AbortSignal,
) {
  return ledgerRequest<LedgerDetail>(
    `/api/ledger/records/${encodeURIComponent(id)}?businessId=${encodeURIComponent(businessId)}`,
    { signal },
  );
}
export function ledgerSummary(
  businessId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
) {
  return ledgerRequest<LedgerSummary>(
    `/api/ledger/summary?${new URLSearchParams({ businessId, from, to })}`,
    { signal },
  );
}
export function readSnapshot(
  businessId: string,
  id: string,
  signal?: AbortSignal,
) {
  return ledgerRequest<LedgerSnapshot>(
    `/api/ledger/snapshots/${encodeURIComponent(id)}?businessId=${encodeURIComponent(businessId)}`,
    { signal },
  );
}
export function readPreparation(businessId: string, signal?: AbortSignal) {
  return ledgerRequest<{ profile: PreparationProfile | null }>(
    `/api/preparation/profile?businessId=${encodeURIComponent(businessId)}`,
    { signal },
  );
}
const allowedEndpoints = [
  "/api/ledger",
  "/api/ledger/snapshots",
  "/api/preparation/profile",
];
export async function sendReviewedOperation(
  command: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const { _endpoint = "/api/ledger", ...payload } = command;
  if (typeof _endpoint !== "string" || !allowedEndpoints.includes(_endpoint))
    throw new LedgerApiError("INVALID_LOCAL_OPERATION", 400);
  const data = await ledgerRequest<unknown>(_endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
  const profile = z.object({
    profile: z.object({
      revision: z.number().int().positive(),
      values: preparationValuesSchema,
      updatedAt: z.string().min(1),
    }),
  });
  const acknowledgement = z.strictObject({
    id: z.uuid(),
    revision: z.number().int().positive(),
  });
  const schema =
    _endpoint === "/api/ledger/snapshots"
      ? ledgerSnapshotSchema
      : _endpoint === "/api/preparation/profile"
        ? profile
        : acknowledgement;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new LedgerApiError("SERVER_ERROR", 503);
  return parsed.data as Record<string, unknown>;
}
export async function downloadLedgerCsv(
  businessId: string,
  snapshotId: string,
) {
  const response = await appFetch(
    `/api/ledger/export?${new URLSearchParams({ businessId, snapshotId })}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/csv")
  )
    throw new LedgerApiError("SERVER_ERROR", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "business-records.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
