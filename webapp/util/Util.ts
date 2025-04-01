import UI5Element from "sap/ui/core/Element";

/**
 * @namespace de.kernich.tcode.util
 */
export default class Util extends UI5Element {
	static async copy2Clipboard(text: string) {
		await navigator.clipboard.writeText(text);
	}

	static openUrl(url: string) {
		window.open(url, "_blank");
	}
}
