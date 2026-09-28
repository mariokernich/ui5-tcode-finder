// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
	globalIgnores(["dist/", "coverage/", "report/"]),
	eslint.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			globals: globals.browser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// QUnit supports promises as test callbacks and hooks, its typings do not declare them
		files: ["webapp/test/**/*.ts"],
		rules: {
			"@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
		},
	},
	{
		files: ["**/*.{js,mjs,cjs}"],
		extends: [tseslint.configs.disableTypeChecked],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		files: ["scripts/service-worker.js"],
		languageOptions: {
			globals: globals.serviceworker,
		},
	}
);
