import { readSession } from "@/features/auth/server/session";
import { success, failure } from "@/lib/http/result";
export async function GET() {
  try {
    const { user } = await readSession();
    return success({ user });
  } catch (error) {
    return failure(error);
  }
}
