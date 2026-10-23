import "server-only";
import {
  businessCreationSchema,
  businessProfileSchema,
  businessRenameSchema,
} from "../business.schema";
import { requireSession } from "@/features/auth/server/session";
import { OperationError } from "@/lib/http/result";
import type { UserDatabase } from "@/lib/supabase/server";

function databaseError(error: { code: string; message: string }): never {
  if (error.code === "42501") throw new OperationError("FORBIDDEN", 403);
  if (
    error.code === "23505" ||
    (error.code === "P0001" &&
      ["OPERATION_CONFLICT", "PROFILE_CONFLICT"].includes(error.message))
  )
    throw new OperationError("CONFLICT", 409);
  if (error.code === "22023") throw new OperationError("VALIDATION_ERROR", 422);
  throw new OperationError("SERVER_ERROR", 503);
}

export async function requireBusiness(
  database: UserDatabase,
  businessId: string,
  userId: string,
) {
  const { data, error } = await database
    .from("businesses")
    .select("id,name")
    .eq("id", businessId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new OperationError("SERVER_ERROR", 503);
  if (!data) throw new OperationError("FORBIDDEN", 403);
  return data;
}

type ProfileRow = {
  id: string;
  name: string;
  activity: string | null;
  setup_completed_at: string | null;
  profile_revision: number;
};
function profile(row: ProfileRow) {
  const result = businessProfileSchema.safeParse({
    id: row.id,
    name: row.name,
    activity: row.activity,
    setupCompleted: row.setup_completed_at !== null,
    profileRevision: row.profile_revision,
  });
  if (!result.success) throw new OperationError("SERVER_ERROR", 503);
  return result.data;
}

export async function listOwnedBusinesses() {
  const { database, user } = await requireSession();
  const { data, error } = await database
    .from("businesses")
    .select("id,name,activity,setup_completed_at,profile_revision")
    .eq("owner_id", user.id)
    .order("created_at");
  if (error) throw new OperationError("SERVER_ERROR", 503);
  return { businesses: data.map(profile) };
}

export async function createOwnedBusiness(input: unknown) {
  const { database, user } = await requireSession();
  const value = businessCreationSchema.parse(input);
  const result = value.activity
    ? await database.rpc("create_guided_business", {
        p_business_id: value.id,
        p_name: value.name,
        p_activity: value.activity,
      })
    : await database.rpc("create_business", {
        p_business_id: value.id,
        p_name: value.name,
      });
  if (result.error) databaseError(result.error);
  const { data, error } = await database
    .from("businesses")
    .select("id,name,activity,setup_completed_at,profile_revision")
    .eq("id", value.id)
    .eq("owner_id", user.id)
    .single();
  if (error || !data) throw new OperationError("SERVER_ERROR", 503);
  return { business: profile(data) };
}

export async function renameOwnedBusiness(input: unknown) {
  const { database, user } = await requireSession();
  const value = businessRenameSchema.parse(input);
  await requireBusiness(database, value.id, user.id);
  const { data, error } = await database.rpc("rename_business", {
    p_business_id: value.id,
    p_name: value.name,
    p_expected_revision: value.expectedRevision,
  });
  if (error) databaseError(error);
  const parsed = businessProfileSchema.safeParse(data);
  if (!parsed.success) throw new OperationError("SERVER_ERROR", 503);
  return { business: parsed.data };
}
