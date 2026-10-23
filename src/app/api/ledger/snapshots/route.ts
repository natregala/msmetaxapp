import { failure, readMutation, success } from "@/lib/http/result";
import { createLedgerSnapshot } from "@/features/ledger/server/ledger-service";
export async function POST(request: Request) {
  try {
    return success(await createLedgerSnapshot(await readMutation(request)));
  } catch (error) {
    return failure(error);
  }
}
