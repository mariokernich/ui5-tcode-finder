export default {
	name: "QUnit test suite for the UI5 Application: de.kernich.tcodes",
	defaults: {
		page: "ui5://test-resources/de/kernich/tcodes/Test.qunit.html?testsuite={suite}&test={name}",
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
			only: "de/kernich/tcodes/",
			never: "test-resources/de/kernich/tcodes/",
		},
		loader: {
			paths: {
				"de/kernich/tcodes": "../",
			},
		},
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for de.kernich.tcodes",
		},
		"integration/opaTests": {
			title: "Integration tests for de.kernich.tcodes",
		},
	},
};
