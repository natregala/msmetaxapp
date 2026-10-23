import { signUp } from "@/features/auth/server/auth-service";
import { success, failure, readMutation } from "@/lib/http/result";
export async function POST(request: Request) {
  try {
    return success(
      await signUp(await readMutation(request), new URL(request.url).origin),
    );
  } catch (error) {
    return failure(error);
  }
}
