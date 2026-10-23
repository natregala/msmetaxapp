import { appFetch } from "@/lib/client/app-fetch";
import type {
  Acceptance,
  AcceptedTransaction,
  Business,
  BusinessActivity,
  ConfirmTransactionCommand,
  SessionUser,
} from "../transaction.types";
import { acceptanceSchema } from "../transaction.schema";
import type { LedgerCommand } from "@/features/ledger/ledger.types";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; fields?: Record<string, string> } };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await appFetch(url, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("NETWORK_ERROR");
  }
  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError("SERVER_ERROR");
  }
  if (!body || typeof body !== "object" || typeof body.ok !== "boolean")
    throw new ApiError("SERVER_ERROR");
  if (!body.ok)
    throw new ApiError(body.error?.code ?? "SERVER_ERROR", body.error?.fields);
  if (!response.ok) throw new ApiError("SERVER_ERROR");
  return body.data;
}

export function getSession(signal?: AbortSignal) {
  return request<{ user: SessionUser | null }>("/api/session", { signal });
}
export function signIn(email: string, password: string) {
  return request<{ user: SessionUser }>("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}
export function signUp(email: string, password: string) {
  return request<{ user: SessionUser | null; confirmationRequired: boolean }>(
    "/api/auth/sign-up",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
}
export function signOut() {
  return request<{ signedOut: true }>("/api/auth/sign-out", {
    method: "POST",
    body: "{}",
  });
}
export async function listBusinesses(
  signal?: AbortSignal,
): Promise<Business[]> {
  return (
    await request<{ businesses: Business[] }>("/api/businesses", { signal })
  ).businesses;
}
export async function createBusiness(
  name: string,
  id = crypto.randomUUID(),
): Promise<Business> {
  return (
    await request<{ business: Business }>("/api/businesses", {
      method: "POST",
      body: JSON.stringify({ id, name }),
    })
  ).business;
}
export async function createGuidedBusiness(
  name: string,
  activity: BusinessActivity,
  id = crypto.randomUUID(),
): Promise<Business> {
  return (
    await request<{ business: Business }>("/api/businesses", {
      method: "POST",
      body: JSON.stringify({ id, name, activity }),
    })
  ).business;
}
export async function renameBusiness(
  id: string,
  name: string,
  expectedRevision: number,
): Promise<Business> {
  return (
    await request<{ business: Business }>("/api/businesses", {
      method: "PATCH",
      body: JSON.stringify({ id, name, expectedRevision }),
    })
  ).business;
}
export async function listTransactions(
  businessId: string,
  signal?: AbortSignal,
): Promise<AcceptedTransaction[]> {
  return (
    await request<{ records: AcceptedTransaction[] }>(
      `/api/transactions?businessId=${encodeURIComponent(businessId)}`,
      { signal },
    )
  ).records;
}
export async function confirmTransaction(
  command: ConfirmTransactionCommand,
  signal?: AbortSignal,
): Promise<Acceptance> {
  const result = await request<unknown>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(command),
    signal,
  });
  const parsed = acceptanceSchema.safeParse(result);
  if (!parsed.success) throw new ApiError("SERVER_ERROR");
  return parsed.data;
}

export async function confirmLedgerTransaction(
  command: LedgerCommand,
  signal?: AbortSignal,
) {
  const result = await request<unknown>("/api/ledger", {
    method: "POST",
    body: JSON.stringify(command),
    signal,
  });
  const parsed = z
    .strictObject({ id: z.uuid(), revision: z.number().int().positive() })
    .safeParse(result);
  if (!parsed.success) throw new ApiError("SERVER_ERROR");
  return parsed.data;
}
