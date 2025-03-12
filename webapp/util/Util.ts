import UI5Element from "sap/ui/core/Element";

/**
 * @namespace ch.kerni.tcode.util
 */
export default class Util extends UI5Element {
	static async copy2Clipboard(text: string): Promise<void> {
		await navigator.clipboard.writeText(text);
	}
}
