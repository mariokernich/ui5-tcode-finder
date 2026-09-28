export async function copyToClipboard(text: string): Promise<void> {
	// The Clipboard API is only available in secure contexts (HTTPS or localhost)
	if (!("clipboard" in navigator)) {
		throw new Error("The clipboard is not available");
	}
	await navigator.clipboard.writeText(text);
}

/**
 * Opens an external URL in a new tab without granting it access to this window.
 */
export function openUrl(url: string): void {
	window.open(url, "_blank", "noopener,noreferrer");
}
