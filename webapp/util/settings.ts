import Log from "sap/base/Log";
import { GROUPS, type Group } from "../Constants";
import { normalizeTcode, toCustomTransaction, type Transaction } from "../model/transaction";

export const CopyOption = {
	Plain: "plain",
	Auto: "auto",
	PrefixN: "prefixN",
	PrefixO: "prefixO",
	WebGui: "webGui",
} as const;
export type CopyOption = (typeof CopyOption)[keyof typeof CopyOption];

/**
 * Copy options in display order
 */
export const COPY_OPTIONS: readonly CopyOption[] = [
	CopyOption.Plain,
	CopyOption.Auto,
	CopyOption.PrefixN,
	CopyOption.PrefixO,
	CopyOption.WebGui,
];

export const ThemeSetting = {
	System: "System",
	Light: "Light",
	Dark: "Dark",
} as const;
export type ThemeSetting = (typeof ThemeSetting)[keyof typeof ThemeSetting];

export interface Settings {
	copyOption: CopyOption;
	sapSystemUrl: string;
	resetSearchAfterCopy: boolean;
	theme: ThemeSetting;
	visibleGroups: Group[];
}

/**
 * Untrusted setting values, e.g. read from the local storage or from an import file
 */
export type SettingsInput = Partial<Record<keyof Settings, unknown>>;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	copyOption: CopyOption.Auto,
	sapSystemUrl: "",
	resetSearchAfterCopy: false,
	theme: ThemeSetting.System,
	visibleGroups: [...GROUPS],
});

/**
 * Up to version 1.1.0 the copy option was persisted with its display text.
 */
const LEGACY_COPY_OPTIONS = new Map<string, CopyOption>([
	["Just copy T-Code", CopyOption.Plain],
	["Copy T-Code with /n prefix", CopyOption.PrefixN],
	["Copy T-Code with /o prefix", CopyOption.PrefixO],
	["Copy T-Code with /n prefix by default and with /o if shift key is pressed", CopyOption.Auto],
	["Open in WebGUI", CopyOption.WebGui],
]);

const WELCOME_DIALOG_DISMISSED_KEY = "doNotShowWelcomeDialog";

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
	return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCopyOption(value: unknown): CopyOption | undefined {
	if (isOneOf(COPY_OPTIONS, value)) {
		return value;
	}
	return typeof value === "string" ? LEGACY_COPY_OPTIONS.get(value) : undefined;
}

export function parseTheme(value: unknown): ThemeSetting | undefined {
	return isOneOf(Object.values(ThemeSetting), value) ? value : undefined;
}

export function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	if (value === "true" || value === "false") {
		return value === "true";
	}
	return undefined;
}

export function isValidSystemUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

/**
 * Accepts an empty string or an absolute http(s) URL. Other protocols like `javascript:` are rejected.
 */
export function parseSystemUrl(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const url = value.trim();
	return url === "" || isValidSystemUrl(url) ? url : undefined;
}

export function parseGroups(value: unknown): Group[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return GROUPS.filter((group) => value.includes(group));
}

/**
 * Validates untrusted setting values. Invalid or missing values are taken from the base settings.
 */
export function sanitizeSettings(
	input: SettingsInput,
	base: Readonly<Settings> = DEFAULT_SETTINGS
): Settings {
	return {
		copyOption: parseCopyOption(input.copyOption) ?? base.copyOption,
		sapSystemUrl: parseSystemUrl(input.sapSystemUrl) ?? base.sapSystemUrl,
		resetSearchAfterCopy:
			parseBoolean(input.resetSearchAfterCopy) ?? base.resetSearchAfterCopy,
		theme: parseTheme(input.theme) ?? base.theme,
		visibleGroups: parseGroups(input.visibleGroups) ?? [...base.visibleGroups],
	};
}

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

function readItem(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch (error) {
		Log.warning(`Cannot read '${key}' from the local storage`, String(error));
		return null;
	}
}

function writeItem(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value);
	} catch (error) {
		Log.warning(`Cannot write '${key}' to the local storage`, String(error));
	}
}

function parseJson(value: string | null): unknown {
	if (value === null) {
		return undefined;
	}
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

export function loadSettings(): Settings {
	return sanitizeSettings({
		copyOption: readItem("copyOption"),
		sapSystemUrl: readItem("sapSystemUrl"),
		resetSearchAfterCopy: readItem("resetSearchAfterCopy"),
		theme: readItem("theme"),
		visibleGroups: parseJson(readItem("visibleGroups")),
	});
}

export function saveSettings(settings: Settings): void {
	writeItem("copyOption", settings.copyOption);
	writeItem("sapSystemUrl", settings.sapSystemUrl);
	writeItem("resetSearchAfterCopy", String(settings.resetSearchAfterCopy));
	writeItem("theme", settings.theme);
	writeItem("visibleGroups", JSON.stringify(settings.visibleGroups));
}

export function isWelcomeDialogDismissed(): boolean {
	return readItem(WELCOME_DIALOG_DISMISSED_KEY) === "true";
}

export function dismissWelcomeDialog(): void {
	writeItem(WELCOME_DIALOG_DISMISSED_KEY, "true");
}

// ---------------------------------------------------------------------------------------------
// Copy behavior
// ---------------------------------------------------------------------------------------------

/**
 * Returns the text to copy for a transaction. The copy option {@link CopyOption.WebGui} opens the
 * transaction instead, the plain transaction code is returned for it.
 */
export function buildCopyText(tcode: string, copyOption: CopyOption, shiftKey: boolean): string {
	switch (copyOption) {
		case CopyOption.PrefixN:
			return `/n${tcode}`;
		case CopyOption.PrefixO:
			return `/o${tcode}`;
		case CopyOption.Auto:
			return shiftKey ? `/o${tcode}` : `/n${tcode}`;
		default:
			return tcode;
	}
}

export function buildWebGuiUrl(sapSystemUrl: string, tcode: string): string {
	const baseUrl = sapSystemUrl.trim().replace(/\/+$/, "");
	return `${baseUrl}/sap/bc/gui/sap/its/webgui?~transaction=${encodeURIComponent(tcode)}`;
}

// ---------------------------------------------------------------------------------------------
// Import and export
// ---------------------------------------------------------------------------------------------

export const EXPORT_FORMAT_VERSION = 2;

export interface ExportData {
	formatVersion: number;
	exportedAt: string;
	settings: Settings;
	customTransactions: Transaction[];
	favoriteTransactions: { tcode: string }[];
}

export interface ImportData {
	settings?: SettingsInput;
	customTransactions?: Transaction[];
	favorites?: string[];
}

/**
 * Thrown if an import file does not have the expected structure
 */
export class ImportError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "ImportError";
	}
}

export function createExportData(
	settings: Settings,
	customTransactions: readonly Transaction[],
	favorites: readonly string[]
): ExportData {
	return {
		formatVersion: EXPORT_FORMAT_VERSION,
		exportedAt: new Date().toISOString(),
		settings,
		customTransactions: [...customTransactions],
		favoriteTransactions: favorites.map((tcode) => ({ tcode })),
	};
}

function parseCustomTransaction(value: unknown): Transaction {
	const transaction = toCustomTransaction(value);
	if (!transaction) {
		throw new ImportError("Custom transactions must have a transaction code");
	}
	return transaction;
}

function parseFavorite(value: unknown): string {
	const tcode = isRecord(value) ? value.tcode : value;
	if (typeof tcode !== "string" || tcode.trim() === "") {
		throw new ImportError("Favorites must have a transaction code");
	}
	return normalizeTcode(tcode);
}

/**
 * Parses the content of a file created by the export function, including files of older versions.
 * Setting values are validated with {@link sanitizeSettings} when they are applied.
 *
 * @throws {ImportError} if the content does not have the expected structure
 */
export function parseImportData(json: unknown): ImportData {
	if (!isRecord(json)) {
		throw new ImportError("The file content must be an object");
	}

	const data: ImportData = {};
	const { settings, customTransactions, favoriteTransactions } = json;

	if (settings !== undefined) {
		if (!isRecord(settings)) {
			throw new ImportError("'settings' must be an object");
		}
		data.settings = settings;
	}
	if (customTransactions !== undefined) {
		if (!Array.isArray(customTransactions)) {
			throw new ImportError("'customTransactions' must be an array");
		}
		const byTcode = new Map<string, Transaction>();
		customTransactions
			.map(parseCustomTransaction)
			.forEach((transaction) => byTcode.set(transaction.tcode, transaction));
		data.customTransactions = [...byTcode.values()];
	}
	if (favoriteTransactions !== undefined) {
		if (!Array.isArray(favoriteTransactions)) {
			throw new ImportError("'favoriteTransactions' must be an array");
		}
		data.favorites = [...new Set(favoriteTransactions.map(parseFavorite))];
	}
	if (!data.settings && !data.customTransactions && !data.favorites) {
		throw new ImportError("The file does not contain any settings");
	}
	return data;
}
