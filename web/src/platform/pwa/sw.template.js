/* Fliper service worker. The version and file list below are placeholders filled in at build
 * time by the `pwaServiceWorker` plugin in vite.config.ts, so every deploy produces a different
 * worker file — that is what makes browsers notice the update. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `fliperama-${VERSION}`;
const FONT_CACHE = 'fliperama-fonts';
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page decides when it is safe to switch (see src/platform/pwa/register.ts).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fliperama-') && key !== CACHE && key !== FONT_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

/** Network first, so a new deploy shows up on the next open; the cached shell is the offline fallback. */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch {
    return (await cache.match('index.html')) ?? Response.error();
  }
}

/** Hashed build files never change, so the cache wins; anything new is stored on first use. */
async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

/** Google Fonts: serve the cached copy right away and refresh it in the background. */
async function handleFont(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The API (live data) and the admin panel (another app) must never be served from this cache.
  const own = url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin');
  if (url.origin === self.location.origin && !own) {
    event.respondWith(
      request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request),
    );
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleFont(request));
  }
  // Everything else (the API, the admin panel) goes straight to the network.
});
