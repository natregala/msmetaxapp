import {
  createOwnedBusiness,
  listOwnedBusinesses,
  renameOwnedBusiness,
} from "@/features/businesses/server/business-service";
import { success, failure, readMutation } from "@/lib/http/result";
export async function GET() {
  try {
    return success(await listOwnedBusinesses());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return success(await createOwnedBusiness(await readMutation(request)));
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    return success(await renameOwnedBusiness(await readMutation(request)));
  } catch (error) {
    return failure(error);
  }
}
