// Removes files from the self-contained build that are never requested at runtime. This keeps the
// deployment small: most of the framework files are debug sources, source maps and theme sources.
import { readdir, rm, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

/**
 * Patterns for paths relative to the dist folder, with "/" as separator
 */
const REMOVE_PATTERNS = [
	// Test resources and test frameworks
	/^test-resources\//,
	/^resources\/sap\/ui\/(test|qunit)\//,
	/^resources\/sap\/ui\/thirdparty\/(qunit|sinon|blanket)[^/]*$/,
	// Debug sources and source maps of the framework, only used with sap-ui-debug=true
	/^resources\/.*-dbg(\.[\w-]+)*\.js$/,
	/^resources\/.*\.map$/,
	// Theme sources, the runtime uses the compiled CSS
	/^resources\/.*\.less$/,
	// Design time and support assistant modules
	/^resources\/.*\.(designtime|support)\.js$/,
	/^resources\/.*\/designtime\//,
	// High contrast themes, the app only applies sap_horizon and sap_horizon_dark
	/^resources\/.*\/themes\/(sap_hcb|sap_horizon_hcb|sap_horizon_hcw)\//,
];

/**
 * Files that must remain, the script fails otherwise
 */
const REQUIRED_FILES = ["index.html", "manifest.json", "resources/sap-ui-custom.js"];

async function removeEmptyFolders(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	await Promise.all(
		entries.filter((entry) => entry.isDirectory()).map((entry) => removeEmptyFolders(join(directory, entry.name)))
	);
	if (directory !== DIST && (await readdir(directory)).length === 0) {
		await rm(directory, { recursive: true });
	}
}

async function listFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true, recursive: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(DIST, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

/**
 * The theme library contains themes for libraries that are not part of the build. These libraries
 * consist of a themes folder only and can never be loaded.
 */
function isThemeOfMissingLibrary(file, files) {
	const match = /^(resources\/.+?\/)themes\//.exec(file);
	if (!match) {
		return false;
	}
	const libraryFolder = match[1];
	return files.every((other) => !other.startsWith(libraryFolder) || other.startsWith(`${libraryFolder}themes/`));
}

const files = await listFiles(DIST);
const obsolete = files.filter(
	(file) => REMOVE_PATTERNS.some((pattern) => pattern.test(file)) || isThemeOfMissingLibrary(file, files)
);
await Promise.all(obsolete.map((file) => rm(join(DIST, file))));
await removeEmptyFolders(DIST);

for (const file of REQUIRED_FILES) {
	if (!(await stat(join(DIST, file)).catch(() => undefined))) {
		throw new Error(`The build does not contain ${file}`);
	}
}

console.log(`Removed ${obsolete.length} of ${files.length} files from the build`);
