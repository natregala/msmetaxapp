import { failure, success } from "@/lib/http/result";
import { ledgerDetail } from "@/features/ledger/server/ledger-service";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return success(
      await ledgerDetail(
        new URL(request.url).searchParams.get("businessId") ?? "",
        id,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
