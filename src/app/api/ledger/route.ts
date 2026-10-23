import { failure, readMutation, success } from "@/lib/http/result";
import {
  listLedger,
  mutateLedger,
} from "@/features/ledger/server/ledger-service";
export async function GET(request: Request) {
  try {
    return success(
      await listLedger(Object.fromEntries(new URL(request.url).searchParams)),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return success(await mutateLedger(await readMutation(request)));
  } catch (error) {
    return failure(error);
  }
}
