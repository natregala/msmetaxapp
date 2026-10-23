import { NextResponse } from "next/server";
import { exchangeEmailCode } from "@/features/auth/server/recovery-service";
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await exchangeEmailCode(
      url.searchParams.get("code") ?? "",
      url.searchParams.get("flow"),
    );
    const response = NextResponse.redirect(
      new URL(result.recovery ? "/recover" : "/", url.origin),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL("/recover?invalid=1", url.origin),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
