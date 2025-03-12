export default {
	name: "QUnit test suite for the UI5 Application: ch.kerni.tcode",
	defaults: {
		page: "ui5://test-resources/ch/kerni/tcode/Test.qunit.html?testsuite={suite}&test={name}",
		qunit: {
			version: 2,
		},
		sinon: {
			version: 4,
		},
		ui5: {
			language: "EN",
			theme: "sap_horizon",
		},
		coverage: {
			only: "ch/kerni/tcode/",
			never: "test-resources/ch/kerni/tcode/",
		},
		loader: {
			paths: {
				"ch/kerni/tcode": "../",
			},
		},
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for ch.kerni.tcode",
		},
		"integration/opaTests": {
			title: "Integration tests for ch.kerni.tcode",
		},
	},
};
