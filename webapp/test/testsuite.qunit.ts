export default {
	name: "QUnit test suite for the UI5 Application: de.kernich.tcode",
	defaults: {
		page: "ui5://test-resources/de/kernich/tcode/Test.qunit.html?testsuite={suite}&test={name}",
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
			only: "de/kernich/tcode/",
			never: "test-resources/de/kernich/tcode/",
		},
		loader: {
			paths: {
				"de/kernich/tcode": "../",
			},
		},
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for de.kernich.tcode",
		},
		"integration/opaTests": {
			title: "Integration tests for de.kernich.tcode",
		},
	},
};
