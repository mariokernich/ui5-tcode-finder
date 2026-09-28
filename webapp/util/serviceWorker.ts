/**
 * Name of the meta tag that the build adds to index.html. Development servers and tests run without
 * the service worker.
 */
const META_NAME = "tcode-service-worker";

/**
 * Registers the service worker that caches the app for offline use.
 *
 * A new version is installed in the background and activated only when the user agrees, because
 * the running app loads further resources lazily and must not mix versions.
 *
 * @param onUpdateReady Called when a new version is ready; calling `activate` reloads the app
 */
export async function registerServiceWorker(
	onUpdateReady: (activate: () => void) => void
): Promise<void> {
	const scriptUrl = document.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`)?.content;
	if (!scriptUrl || !("serviceWorker" in navigator)) {
		return;
	}

	const registration = await navigator.serviceWorker.register(scriptUrl);

	const activate = (worker: ServiceWorker) => () => {
		let reloading = false;
		navigator.serviceWorker.addEventListener("controllerchange", () => {
			if (!reloading) {
				reloading = true;
				window.location.reload();
			}
		});
		worker.postMessage({ type: "SKIP_WAITING" });
	};

	const notifyIfWaiting = (): void => {
		// Without a controller, the worker is the first one and activates itself
		if (registration.waiting && navigator.serviceWorker.controller) {
			onUpdateReady(activate(registration.waiting));
		}
	};

	notifyIfWaiting();
	registration.addEventListener("updatefound", () => {
		const worker = registration.installing;
		worker?.addEventListener("statechange", () => {
			if (worker.state === "installed") {
				notifyIfWaiting();
			}
		});
	});

	// Tabs that stay open for a long time look for a new version when they become visible
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			registration.update().catch(() => undefined);
		}
	});
}
