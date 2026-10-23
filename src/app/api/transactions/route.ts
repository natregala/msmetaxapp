import {
  confirmReviewedTransaction,
  listAcceptedTransactions,
} from "@/features/transactions/server/confirm-transaction";
import { success, failure, readMutation } from "@/lib/http/result";
export async function GET(request: Request) {
  try {
    return success(
      await listAcceptedTransactions(
        new URL(request.url).searchParams.get("businessId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return success(
      await confirmReviewedTransaction(await readMutation(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
