/* Public, account-independent shell only. Never cache API, recovery, or private documents. */
const SHELL = "msme-public-shell-v1";

async function cached(request) {
  try {
    return await (await caches.open(SHELL)).match(request);
  } catch {
    return undefined;
  }
}
async function remember(request, response) {
  try {
    await (await caches.open(SHELL)).put(request, response.clone());
  } catch {
    // A full/unavailable cache must never turn a successful online fetch into
    // a broken script or stylesheet response.
  }
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const response = await fetch("/offline", { cache: "reload" });
      if (!response.ok) throw new Error("Offline shell unavailable");
      await cache.put("/offline", response.clone());
      const html = await response.text();
      const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path.startsWith("/_next/static/"));
      await cache.addAll([
        ...new Set([
          ...paths,
          "/brand/buwis-folder-compact.svg",
          "/brand/buwis-folder-primary.svg",
        ]),
      ]);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        for (const key of await caches.keys()) {
          if (key.startsWith("msme-public-shell-") && key !== SHELL)
            await caches.delete(key);
        }
      } catch {
        // Cache cleanup is best effort. The network app must remain usable.
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/recover"))
    return;
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/")
  ) {
    event.respondWith(
      (async () => {
        const hit = await cached(event.request);
        if (hit) return hit;
        const response = await fetch(event.request);
        if (response.ok) await remember(event.request, response);
        return response;
      })(),
    );
    return;
  }
  if (
    event.request.mode === "navigate" &&
    (url.pathname === "/" || url.pathname === "/offline")
  ) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const hit = await cached("/offline");
        return (
          hit ??
          new Response(
            "Reconnect to open your records. / Kumonekta muli para mabuksan ang mga tala.",
            { status: 503 },
          )
        );
      }),
    );
  }
});
