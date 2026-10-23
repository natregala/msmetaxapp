import "server-only";
import { z } from "zod";
import { requireSession } from "@/features/auth/server/session";
import { requireBusiness } from "@/features/businesses/server/business-service";
import { OperationError } from "@/lib/http/result";
import type { Json } from "@/lib/supabase/database.types";
import {
  preparationCommandSchema,
  preparationValuesSchema,
} from "../preparation.schema";

const profileSchema = z.strictObject({
  revision: z.number().int().positive(),
  values: preparationValuesSchema,
  updatedAt: z.string(),
});
export async function readPreparationProfile(businessId: string) {
  const id = z.uuid().parse(businessId);
  const { database, user } = await requireSession();
  await requireBusiness(database, id, user.id);
  const { data, error } = await database
    .from("preparation_profiles")
    .select("revision,profile_data,updated_at")
    .eq("business_id", id)
    .maybeSingle();
  if (error) throw new OperationError("SERVER_ERROR", 503);
  return {
    profile: data
      ? profileSchema.parse({
          revision: data.revision,
          values: data.profile_data,
          updatedAt: data.updated_at,
        })
      : null,
  };
}
export async function savePreparationProfile(input: unknown) {
  const command = preparationCommandSchema.parse(input);
  const { database, user } = await requireSession();
  await requireBusiness(database, command.businessId, user.id);
  const { data, error } = await database.rpc("save_preparation_profile", {
    p_business_id: command.businessId,
    p_operation_id: command.operationId,
    p_expected_revision: command.expectedRevision,
    p_values: command.values as Json,
  });
  if (error) {
    if (error.code === "42501") throw new OperationError("FORBIDDEN", 403);
    if (error.code === "P0001") throw new OperationError("CONFLICT", 409);
    if (error.code === "22023")
      throw new OperationError("VALIDATION_ERROR", 422);
    throw new OperationError("SERVER_ERROR", 503);
  }
  return { profile: profileSchema.parse(data) };
}
