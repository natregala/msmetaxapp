import { failure, success } from "@/lib/http/result";
import { ledgerSummary } from "@/features/ledger/server/ledger-service";
export async function GET(request: Request) {
  try {
    return success(
      await ledgerSummary(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
