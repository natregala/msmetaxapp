import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_DEMO_MODE !== "true" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export async function createSupabaseServerClient() {
  if (!isConfigured()) throw new Error("NOT_CONFIGURED");
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values)
            cookieStore.set(name, value, options);
        },
      },
    },
  );
}
export type UserDatabase = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
