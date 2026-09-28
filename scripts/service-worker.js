// Service worker of T-Code Quick Finder. scripts/generate-service-worker.mjs writes it to dist/sw.js
// and injects the cache version and the files to precache.

const CACHE_PREFIX = "tcode-finder-";
const CACHE_NAME = CACHE_PREFIX + "__CACHE_VERSION__";
const PRECACHE_URLS = [] /* __PRECACHE_URLS__ */;

const scope = new URL(self.registration.scope);
const appShellUrl = new URL("index.html", scope).href;

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) =>
			// Bypass the HTTP cache, the web server does not send cache headers
			cache.addAll(PRECACHE_URLS.map((url) => new Request(new URL(url, scope), { cache: "reload" })))
		)
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

// The app activates a waiting version after the user agreed to reload
self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") {
		void self.skipWaiting();
	}
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (
		request.method !== "GET" ||
		url.origin !== scope.origin ||
		!url.pathname.startsWith(scope.pathname) ||
		request.headers.has("range")
	) {
		return;
	}
	const isAppShell = request.mode === "navigate" && (url.pathname === scope.pathname || url.href.startsWith(appShellUrl));
	event.respondWith(respond(request, isAppShell));
});

/**
 * Serves the files of this version from the cache. Other files are loaded from the network and
 * cached for offline use.
 */
async function respond(request, isAppShell) {
	const cache = await caches.open(CACHE_NAME);
	// UI5 adds query parameters like sap-ui-dist-version to its requests
	const cached = await cache.match(isAppShell ? appShellUrl : request, { ignoreSearch: true });
	if (cached) {
		return cached;
	}
	const response = await fetch(request);
	if (response.ok && response.type === "basic") {
		await cache.put(request, response.clone());
	}
	return response;
}
