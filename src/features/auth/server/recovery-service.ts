import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OperationError } from "@/lib/http/result";

export async function requestRecovery(input: unknown, origin: string) {
  const { email } = z.strictObject({ email: z.email().max(254) }).parse(input);
  const db = await createSupabaseServerClient();
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: origin + "/api/auth/callback?flow=recovery",
  });
  if (error)
    throw new OperationError(
      error.status === 429 ? "RATE_LIMITED" : "RECOVERY_UNAVAILABLE",
      error.status === 429 ? 429 : 503,
    );
  // Same response regardless of whether the account exists.
  return { requested: true };
}
export async function exchangeEmailCode(code: string, flow: string | null) {
  if (!code || !["recovery", "confirm"].includes(flow ?? ""))
    throw new OperationError("INVALID_RECOVERY", 400);
  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error || !data.user || !data.session)
    throw new OperationError("INVALID_RECOVERY", 400);
  if (flow === "recovery") {
    const jar = await cookies();
    jar.set("msme-recovery", data.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 600,
    });
  }
  return { recovery: flow === "recovery" };
}
export async function updateRecoveredPassword(input: unknown) {
  const { password } = z
    .strictObject({ password: z.string().min(8).max(128) })
    .parse(input);
  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.getUser();
  const jar = await cookies();
  if (error || !data.user || jar.get("msme-recovery")?.value !== data.user.id)
    throw new OperationError("INVALID_RECOVERY", 401);
  const result = await db.auth.updateUser({ password });
  if (result.error) throw new OperationError("RECOVERY_UNAVAILABLE", 503);
  jar.delete("msme-recovery");
  return { updated: true };
}
