import { failure } from "@/lib/http/result";
import { readLedgerSnapshot } from "@/features/ledger/server/ledger-service";
import { snapshotCSV } from "@/features/ledger/ledger.rules";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const snapshot = await readLedgerSnapshot(
      params.get("businessId") ?? "",
      params.get("snapshotId") ?? "",
    );
    return new Response(snapshotCSV(snapshot), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="business-records-' +
          snapshot.from +
          "-" +
          snapshot.to +
          '.csv"',
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
