import { signIn } from "@/features/auth/server/auth-service";
import { success, failure, readMutation } from "@/lib/http/result";
export async function POST(request: Request) {
  try {
    return success(await signIn(await readMutation(request)));
  } catch (error) {
    return failure(error);
  }
}
