import {
	CopyOption,
	DEFAULT_SETTINGS,
	ImportError,
	buildCopyText,
	buildWebGuiUrl,
	createExportData,
	loadSettings,
	parseBoolean,
	parseCopyOption,
	parseGroups,
	parseImportData,
	parseSystemUrl,
	sanitizeSettings,
	saveSettings,
	type Settings,
} from "de/kernich/tcode/util/settings";

const STORAGE_KEYS = ["copyOption", "sapSystemUrl", "resetSearchAfterCopy", "theme", "visibleGroups"];

QUnit.module("util/settings - parsing");

QUnit.test("parseCopyOption accepts keys and the display texts of older versions", (assert) => {
	assert.strictEqual(parseCopyOption("prefixO"), CopyOption.PrefixO);
	assert.strictEqual(parseCopyOption("Just copy T-Code"), CopyOption.Plain);
	assert.strictEqual(
		parseCopyOption("Copy T-Code with /n prefix by default and with /o if shift key is pressed"),
		CopyOption.Auto
	);
	assert.strictEqual(parseCopyOption("Open in WebGUI"), CopyOption.WebGui);
	assert.strictEqual(parseCopyOption("bogus"), undefined);
	assert.strictEqual(parseCopyOption("constructor"), undefined, "no prototype lookup");
	assert.strictEqual(parseCopyOption(null), undefined);
});

QUnit.test("parseBoolean accepts booleans and their string representation", (assert) => {
	assert.strictEqual(parseBoolean(true), true);
	assert.strictEqual(parseBoolean("false"), false);
	assert.strictEqual(parseBoolean("yes"), undefined);
	assert.strictEqual(parseBoolean(1), undefined);
});

QUnit.test("parseSystemUrl only accepts http(s) URLs", (assert) => {
	assert.strictEqual(parseSystemUrl(""), "");
	assert.strictEqual(parseSystemUrl(" https://sap.example.com:44300 "), "https://sap.example.com:44300");
	assert.strictEqual(parseSystemUrl("http://localhost:8000/"), "http://localhost:8000/");
	assert.strictEqual(parseSystemUrl("javascript:alert(1)"), undefined);
	assert.strictEqual(parseSystemUrl("sap.example.com"), undefined, "relative URLs are rejected");
	assert.strictEqual(parseSystemUrl(null), undefined);
});

QUnit.test("parseGroups keeps known groups in display order", (assert) => {
	assert.deepEqual(parseGroups(["CUSTOM", "BOGUS", "ABAP"]), ["ABAP", "CUSTOM"]);
	assert.deepEqual(parseGroups([]), []);
	assert.strictEqual(parseGroups("ABAP"), undefined);
});

QUnit.test("sanitizeSettings falls back to the base settings for invalid values", (assert) => {
	const base: Settings = { ...DEFAULT_SETTINGS, sapSystemUrl: "https://sap.example.com" };
	assert.deepEqual(
		sanitizeSettings(
			{
				copyOption: "bogus",
				sapSystemUrl: "javascript:alert(1)",
				resetSearchAfterCopy: "true",
				theme: "Dark",
				visibleGroups: ["UI5"],
			},
			base
		),
		{
			copyOption: CopyOption.Auto,
			sapSystemUrl: "https://sap.example.com",
			resetSearchAfterCopy: true,
			theme: "Dark",
			visibleGroups: ["UI5"],
		}
	);
});

QUnit.module("util/settings - copy behavior");

QUnit.test("buildCopyText", (assert) => {
	assert.strictEqual(buildCopyText("SE80", CopyOption.Plain, true), "SE80");
	assert.strictEqual(buildCopyText("SE80", CopyOption.PrefixN, true), "/nSE80");
	assert.strictEqual(buildCopyText("SE80", CopyOption.PrefixO, false), "/oSE80");
	assert.strictEqual(buildCopyText("SE80", CopyOption.Auto, false), "/nSE80");
	assert.strictEqual(buildCopyText("SE80", CopyOption.Auto, true), "/oSE80");
});

QUnit.test("buildWebGuiUrl", (assert) => {
	assert.strictEqual(
		buildWebGuiUrl("https://sap.example.com:44300//", "/SCWM/MON"),
		"https://sap.example.com:44300/sap/bc/gui/sap/its/webgui?~transaction=%2FSCWM%2FMON"
	);
});

QUnit.module("util/settings - import and export");

QUnit.test("parseImportData reads files of version 1.1.0", (assert) => {
	const data = parseImportData({
		settings: {
			copyOption: "Copy T-Code with /o prefix",
			sapSystemUrl: null,
			resetSearchAfterCopy: "false",
			theme: "System",
			visibleGroups: ["UI5"],
		},
		customTransactions: [
			{ tcode: "zfoo", title: "Foo", description: "Bar", tags: "CUSTOM", favorite: true },
			{ tcode: "ZFOO", title: "Duplicate", description: "", tags: "CUSTOM" },
		],
		favoriteTransactions: [{ tcode: "se80" }, { tcode: "SE80" }],
	});
	assert.deepEqual(
		data.customTransactions,
		[{ tcode: "ZFOO", title: "Duplicate", description: "", tags: "CUSTOM" }],
		"transaction codes are normalized and duplicates are removed"
	);
	assert.deepEqual(data.favorites, ["SE80"]);
	assert.strictEqual(
		sanitizeSettings(data.settings ?? {}).copyOption,
		CopyOption.PrefixO,
		"legacy setting values are migrated"
	);
});

QUnit.test("parseImportData rejects invalid files", (assert) => {
	assert.throws(() => parseImportData([]), ImportError);
	assert.throws(() => parseImportData(null), ImportError);
	assert.throws(() => parseImportData({}), ImportError, "the file must contain data");
	assert.throws(() => parseImportData({ settings: "x" }), ImportError);
	assert.throws(() => parseImportData({ customTransactions: {} }), ImportError);
	assert.throws(() => parseImportData({ customTransactions: [{ title: "No code" }] }), ImportError);
	assert.throws(() => parseImportData({ favoriteTransactions: [42] }), ImportError);
});

QUnit.test("an export can be imported again", (assert) => {
	const settings: Settings = { ...DEFAULT_SETTINGS, theme: "Dark", resetSearchAfterCopy: true };
	const customTransactions = [{ tcode: "ZFOO", title: "Foo", description: "Bar", tags: "CUSTOM" }];
	const exported = createExportData(settings, customTransactions, ["SE80"]);
	const imported = parseImportData(JSON.parse(JSON.stringify(exported)));

	assert.deepEqual(sanitizeSettings(imported.settings ?? {}), settings);
	assert.deepEqual(imported.customTransactions, customTransactions);
	assert.deepEqual(imported.favorites, ["SE80"]);
});

QUnit.module("util/settings - persistence", {
	beforeEach(this: { backup: Record<string, string | null> }) {
		this.backup = Object.fromEntries(STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
		STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
	},
	afterEach(this: { backup: Record<string, string | null> }) {
		Object.entries(this.backup).forEach(([key, value]) => {
			if (value === null) {
				localStorage.removeItem(key);
			} else {
				localStorage.setItem(key, value);
			}
		});
	},
});

QUnit.test("loadSettings returns the defaults without stored settings", (assert) => {
	assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
});

QUnit.test("saveSettings and loadSettings", (assert) => {
	const settings: Settings = {
		copyOption: CopyOption.WebGui,
		sapSystemUrl: "https://sap.example.com",
		resetSearchAfterCopy: true,
		theme: "Light",
		visibleGroups: ["ABAP", "CUSTOM"],
	};
	saveSettings(settings);
	assert.deepEqual(loadSettings(), settings);
});

QUnit.test("loadSettings ignores corrupt values", (assert) => {
	localStorage.setItem("visibleGroups", "{corrupt");
	localStorage.setItem("theme", "Purple");
	assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
});
