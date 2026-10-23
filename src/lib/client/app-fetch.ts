/** Explicit demo transport. The ordinary app always uses its authenticated HTTP APIs. */
export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export async function appFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (isDemoMode()) {
    const { demoFetch } = await import("@/features/demo/demo-fetch");
    return demoFetch(input, init);
  }
  return fetch(input, init);
}
