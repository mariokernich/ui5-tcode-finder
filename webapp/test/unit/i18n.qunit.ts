type Texts = Map<string, string>;

/**
 * Reads the keys and raw texts of a properties file. Continuation lines are joined, escape sequences
 * are irrelevant for the comparison.
 */
async function loadTexts(fileName: string): Promise<Texts> {
	const response = await fetch(sap.ui.require.toUrl(`de/kernich/tcode/i18n/${fileName}`));
	const content = (await response.text()).replace(/\\\r?\n[ \t]*/g, "");
	const texts: Texts = new Map();
	content.split(/\r?\n/).forEach((line) => {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("!")) {
			return;
		}
		const separator = trimmed.indexOf("=");
		texts.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1));
	});
	return texts;
}

function placeholders(text: string): string[] {
	return [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
}

QUnit.module("i18n");

QUnit.test("the German texts are complete and use the same placeholders", async (assert) => {
	const [english, german] = await Promise.all([loadTexts("i18n.properties"), loadTexts("i18n_de.properties")]);

	assert.ok(english.size > 0, "the English texts are loaded");
	assert.deepEqual(
		[...english.keys()].filter((key) => !german.has(key)),
		[],
		"no German text is missing"
	);
	assert.deepEqual(
		[...german.keys()].filter((key) => !english.has(key)),
		[],
		"there are no obsolete German texts"
	);
	english.forEach((text, key) => {
		const germanText = german.get(key);
		if (germanText !== undefined) {
			assert.deepEqual(placeholders(germanText), placeholders(text), `placeholders of ${key}`);
		}
	});
});
