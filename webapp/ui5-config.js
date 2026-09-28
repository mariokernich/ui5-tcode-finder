// UI5 configuration that must be determined before the bootstrap.
//
// The app provides texts in English and German. UI5 starts in the first of these languages that the
// browser prefers, English otherwise, so that app and framework texts are in the same language. The
// URL parameter sap-ui-language overrides this.
(() => {
	const preferredLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
	const language = preferredLanguages
		.map((tag) => /^(de|en)\b/i.exec(tag ?? "")?.[1].toLowerCase())
		.find((match) => match !== undefined);
	window["sap-ui-config"] = { language: language ?? "en" };
})();
