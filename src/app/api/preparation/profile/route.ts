import { failure, readMutation, success } from "@/lib/http/result";
import {
  readPreparationProfile,
  savePreparationProfile,
} from "@/features/preparation/server/preparation-service";
export async function GET(request: Request) {
  try {
    return success(
      await readPreparationProfile(
        new URL(request.url).searchParams.get("businessId") ?? "",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return success(await savePreparationProfile(await readMutation(request)));
  } catch (error) {
    return failure(error);
  }
}
