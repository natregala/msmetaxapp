import {
  requestRecovery,
  updateRecoveredPassword,
} from "@/features/auth/server/recovery-service";
import { failure, success, readMutation } from "@/lib/http/result";
export async function POST(request: Request) {
  try {
    return success(
      await requestRecovery(
        await readMutation(request),
        new URL(request.url).origin,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    return success(await updateRecoveredPassword(await readMutation(request)));
  } catch (e) {
    return failure(e);
  }
}
