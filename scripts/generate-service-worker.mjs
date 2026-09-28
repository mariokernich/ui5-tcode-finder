// Generates the service worker for the self-contained build: dist/sw.js precaches the files the app
// needs to start offline, and index.html gets the meta tag that makes the app register it.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const TEMPLATE = fileURLToPath(new URL("./service-worker.js", import.meta.url));
const SERVICE_WORKER = "sw.js";
const META_TAG = `<meta name="tcode-service-worker" content="${SERVICE_WORKER}" />`;

/**
 * Files the app loads when it starts, for both themes and languages. Other files are cached at
 * runtime when they are requested for the first time.
 */
const PRECACHE_PATTERNS = [
	/^index\.html$/,
	/^manifest\.webmanifest$/,
	/^model\/transactions\.json$/,
	/^i18n\/i18n(_de)?\.properties$/,
	/^img\/(?!og-image).+\.(svg|png|ico)$/,
	/^resources\/sap-ui-(custom\.js|version\.json)$/,
	/^resources\/sap\/ui\/core\/(ComponentSupport|date\/Gregorian|boot\/\w+Endpoint)\.js$/,
	/^resources\/sap\/ui\/(layout|unified)\/library-preload-lazy\.js$/,
	/^resources\/sap\/ui\/core\/cldr\/(en|de)\.json$/,
	/^resources\/sap\/(m|ui\/core|ui\/layout|ui\/unified)\/messagebundle(_en|_de)?\.properties$/,
	/^resources\/sap\/(m|ui\/core|ui\/layout|ui\/unified)\/themes\/sap_horizon(_dark)?\/library\.css$/,
	/^resources\/sap\/ui\/core\/themes\/sap_horizon(_dark)?\/fonts\/(72-(Regular|Bold|SemiboldDuplex)(-full)?|SAP-icons)\.woff2$/,
];

/**
 * The service worker is useless without these files
 */
const REQUIRED_FILES = [
	"index.html",
	"manifest.webmanifest",
	"resources/sap-ui-custom.js",
	"resources/sap/ui/core/themes/sap_horizon/library.css",
	"resources/sap/m/themes/sap_horizon/library.css",
];

async function listFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true, recursive: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(DIST, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

function replaceOnce(text, search, replacement) {
	if (!text.includes(search)) {
		throw new Error(`Cannot find "${search}"`);
	}
	return text.replace(search, () => replacement);
}

const indexHtmlPath = join(DIST, "index.html");
const indexHtml = await readFile(indexHtmlPath, "utf8");
if (!indexHtml.includes(META_TAG)) {
	await writeFile(indexHtmlPath, replaceOnce(indexHtml, "</head>", `\t${META_TAG}\n\t</head>`));
}

const files = (await listFiles(DIST))
	.filter((file) => PRECACHE_PATTERNS.some((pattern) => pattern.test(file)))
	.sort();
const missing = REQUIRED_FILES.filter((file) => !files.includes(file));
if (missing.length > 0) {
	throw new Error(`The build does not contain ${missing.join(", ")}`);
}

// The version changes with the content of any precached file, which makes browsers update the worker
const hash = createHash("sha256");
for (const file of files) {
	hash.update(file);
	hash.update(await readFile(join(DIST, file)));
}
const version = hash.digest("hex").slice(0, 16);

const template = await readFile(TEMPLATE, "utf8");
const serviceWorker = replaceOnce(
	replaceOnce(template, "__CACHE_VERSION__", version),
	"[] /* __PRECACHE_URLS__ */",
	JSON.stringify(files, null, "\t")
);
await writeFile(join(DIST, SERVICE_WORKER), serviceWorker);

console.log(`Generated ${SERVICE_WORKER} (version ${version}) precaching ${files.length} files`);
