import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OperationError } from "@/lib/http/result";

const credentials = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
  .strict();
export async function signIn(input: unknown) {
  const value = credentials.parse(input);
  const database = await createSupabaseServerClient();
  const { data, error } = await database.auth.signInWithPassword(value);
  if (error || !data.user)
    throw new OperationError(
      error?.code === "email_not_confirmed"
        ? "EMAIL_CONFIRMATION_REQUIRED"
        : "AUTH_FAILED",
      401,
    );
  return { user: { id: data.user.id, email: data.user.email ?? null } };
}
export async function signUp(input: unknown, origin?: string) {
  const value = credentials
    .extend({ password: z.string().min(8).max(128) })
    .parse(input);
  const database = await createSupabaseServerClient();
  const { data, error } = await database.auth.signUp({
    ...value,
    ...(origin
      ? {
          options: {
            emailRedirectTo: origin + "/api/auth/callback?flow=confirm",
          },
        }
      : {}),
  });
  if (error)
    throw new OperationError(
      error.status === 429 ? "RATE_LIMITED" : "AUTH_FAILED",
      error.status === 429 ? 429 : 400,
    );
  return {
    user:
      data.session && data.user
        ? { id: data.user.id, email: data.user.email ?? null }
        : null,
    confirmationRequired: !data.session,
  };
}
export async function signOut() {
  const database = await createSupabaseServerClient();
  const { error } = await database.auth.signOut({ scope: "local" });
  if (error) throw new OperationError("SERVER_ERROR", 503);
  return { signedOut: true };
}
