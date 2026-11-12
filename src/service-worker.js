/* Build template: npm run build emits public/sw.js with a fresh revision. */
const VERSION = "__BUILD_VERSION__";
const PREFIX = "scholartrack-";
const CACHE = PREFIX + VERSION;
const OFFLINE = "/offline.html";
const PRECACHE = [
  OFFLINE, "/offline.js",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/apple-touch-icon.png", "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  // An incomplete precache rejects installation, preserving the working worker.
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload", credentials: "omit" })))
  ));
  // Only the user-approved message below activates a waiting update.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)));
    // Do not claim existing tabs: first install takes control on the next navigation.
    // This also avoids interrupting pages loaded with a different build.
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      request.headers.has("authorization")) return;

  if (request.mode === "navigate") {
    // Never cache document responses, including authenticated pages.
    event.respondWith(fetch(request).catch(async () =>
      (await caches.open(CACHE)).match(OFFLINE)
    ));
    return;
  }

  // Login navigations can use the same public offline screen. Authentication
  // requests and responses are never cached, including login page HTML.
  if (/^\/(api|auth|login|logout|callback)(\/|$)/.test(url.pathname)) return;

  // RSC, route data, query-bearing requests and third-party responses are excluded.
  if (url.search || request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return;
  const isStatic = url.pathname.startsWith("/_next/static/") &&
    /\.(js|css|woff2?)$/.test(url.pathname);
  if (!PRECACHE.includes(url.pathname) && !isStatic) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && !response.redirected && response.type === "basic" &&
        !/private|no-store/i.test(response.headers.get("cache-control") || "")) {
      // Keep runtime storage bounded; never evict the offline fallback.
      try {
        await cache.put(request, response.clone());
        const runtime = (await cache.keys()).filter((entry) =>
          !PRECACHE.includes(new URL(entry.url).pathname));
        await Promise.all(runtime.slice(0, Math.max(0, runtime.length - 80))
          .map((entry) => cache.delete(entry)));
      } catch {
        // Storage limits must not break successful network responses.
      }
    }
    return response;
  })());
});
