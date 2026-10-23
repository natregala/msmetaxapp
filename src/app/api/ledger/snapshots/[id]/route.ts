import { failure, success } from "@/lib/http/result";
import { readLedgerSnapshot } from "@/features/ledger/server/ledger-service";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return success(
      await readLedgerSnapshot(
        new URL(request.url).searchParams.get("businessId") ?? "",
        id,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
