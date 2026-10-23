import { signOut } from "@/features/auth/server/auth-service";
import { success, failure, readMutation } from "@/lib/http/result";
export async function POST(request: Request) {
  try {
    await readMutation(request);
    return success(await signOut());
  } catch (error) {
    return failure(error);
  }
}
