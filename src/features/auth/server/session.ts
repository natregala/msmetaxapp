import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OperationError } from "@/lib/http/result";

export async function readSession() {
  const database = await createSupabaseServerClient();
  const { data, error } = await database.auth.getUser();
  if (error?.status === 429) throw new OperationError("RATE_LIMITED", 429);
  if (
    error &&
    ((error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError")
  )
    throw new OperationError("SERVER_ERROR", 503);
  if (error || !data.user) return { database, user: null };
  return {
    database,
    user: { id: data.user.id, email: data.user.email ?? null },
  };
}

export async function requireSession() {
  const session = await readSession();
  if (!session.user) throw new OperationError("UNAUTHENTICATED", 401);
  return { database: session.database, user: session.user };
}
