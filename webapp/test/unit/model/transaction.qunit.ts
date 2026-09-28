import {
	countByGroup,
	getGroups,
	isInAnyGroup,
	matchesQuery,
	normalizeTcode,
	toCustomTransaction,
	type Transaction,
} from "de/kernich/tcode/model/transaction";

const transactions: Transaction[] = [
	{ tcode: "SE80", title: "Object Navigator", description: "Manage classes", tags: "ABAP" },
	{ tcode: "/UI2/FLP", title: "Fiori Launchpad", description: "Open the launchpad", tags: "UI5" },
	{ tcode: "SU01", title: "User Maintenance", description: "Maintain users", tags: "UI5,GENERAL" },
	{ tcode: "ZTEST", title: "Custom", description: "Mine", tags: "CUSTOM" },
];

QUnit.module("model/transaction");

QUnit.test("normalizeTcode trims and converts to upper case", (assert) => {
	assert.strictEqual(normalizeTcode("  se80 "), "SE80");
	assert.strictEqual(normalizeTcode("/iwfnd/maint_service"), "/IWFND/MAINT_SERVICE");
});

QUnit.test("getGroups returns unique and trimmed groups", (assert) => {
	assert.deepEqual(getGroups("ABAP, GENERAL,,ABAP"), ["ABAP", "GENERAL"]);
	assert.deepEqual(getGroups(""), []);
});

QUnit.test("isInAnyGroup matches complete group names only", (assert) => {
	assert.ok(isInAnyGroup("UI5,GENERAL", ["GENERAL"]));
	assert.notOk(isInAnyGroup("FIORI", ["FI"]), "a group name is no substring match");
	assert.notOk(isInAnyGroup("ABAP", []));
});

QUnit.test("matchesQuery searches code, title and description case-insensitively", (assert) => {
	const [se80] = transactions;
	assert.ok(matchesQuery(se80, "se8"));
	assert.ok(matchesQuery(se80, "NAVIGATOR"));
	assert.ok(matchesQuery(se80, " classes "), "the query is trimmed");
	assert.ok(matchesQuery(se80, ""), "an empty query matches everything");
	assert.notOk(matchesQuery(se80, "launchpad"));
});

QUnit.test("countByGroup counts all transactions per group", (assert) => {
	const counts = countByGroup(transactions, "", ["ABAP", "UI5", "GENERAL", "CUSTOM"]);
	assert.strictEqual(counts.ALL, 4);
	assert.strictEqual(counts.ABAP, 1);
	assert.strictEqual(counts.UI5, 2);
	assert.strictEqual(counts.GENERAL, 1);
	assert.strictEqual(counts.CUSTOM, 1);
	assert.strictEqual(counts.EWM, 0);
});

QUnit.test("countByGroup applies the query and counts only visible groups for ALL", (assert) => {
	const counts = countByGroup(transactions, "u", ["UI5"]);
	assert.strictEqual(counts.ALL, 2, "/UI2/FLP and SU01 are visible");
	assert.strictEqual(counts.UI5, 2);
	assert.strictEqual(counts.CUSTOM, 1, "group counts ignore the visibility");
	assert.strictEqual(counts.ABAP, 0, "SE80 does not match the query");
});

QUnit.test("toCustomTransaction sanitizes untrusted data", (assert) => {
	assert.deepEqual(
		toCustomTransaction({
			tcode: " zfoo ",
			title: "Foo",
			description: 42,
			tags: "ABAP,BOGUS",
			favorite: true,
		}),
		{ tcode: "ZFOO", title: "Foo", description: "", tags: "ABAP,CUSTOM" }
	);
	assert.deepEqual(toCustomTransaction({ tcode: "ZBAR" }), {
		tcode: "ZBAR",
		title: "",
		description: "",
		tags: "CUSTOM",
	});
	assert.strictEqual(toCustomTransaction({ tcode: "  " }), undefined);
	assert.strictEqual(toCustomTransaction({ tcode: 42 }), undefined);
	assert.strictEqual(toCustomTransaction(null), undefined);
	assert.strictEqual(toCustomTransaction("SE80"), undefined);
});
