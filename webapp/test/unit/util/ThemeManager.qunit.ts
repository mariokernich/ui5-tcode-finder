import { isDarkTheme, resolveTheme } from "de/kernich/tcode/util/ThemeManager";

QUnit.module("util/ThemeManager");

QUnit.test("resolveTheme respects an explicit setting", (assert) => {
	assert.strictEqual(resolveTheme("Light", true), "sap_horizon");
	assert.strictEqual(resolveTheme("Dark", false), "sap_horizon_dark");
});

QUnit.test("resolveTheme follows the color scheme for the system setting", (assert) => {
	assert.strictEqual(resolveTheme("System", true), "sap_horizon_dark");
	assert.strictEqual(resolveTheme("System", false), "sap_horizon");
});

QUnit.test("isDarkTheme", (assert) => {
	assert.ok(isDarkTheme("sap_horizon_dark"));
	assert.notOk(isDarkTheme("sap_horizon"));
});
