import { ALL_GROUPS, CUSTOM_GROUP, GROUPS } from "../Constants";

export interface Transaction {
	tcode: string;
	title: string;
	description: string;
	/**
	 * Comma-separated list of group keys, e.g. "ABAP,GENERAL"
	 */
	tags: string;
}

/**
 * Transaction as displayed in the table
 */
export interface TransactionEntry extends Transaction {
	favorite: boolean;
	custom: boolean;
}

/**
 * Fields of a transaction that are searched
 */
export const SEARCH_FIELDS = ["tcode", "title", "description"] as const;

/**
 * Maximum length of a transaction code in SAP
 */
export const TCODE_MAX_LENGTH = 20;

export function normalizeTcode(tcode: string): string {
	return tcode.trim().toUpperCase();
}

/**
 * Returns the unique group keys of a comma-separated tag list.
 */
export function getGroups(tags: string): string[] {
	const groups = tags
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
	return [...new Set(groups)];
}

export function isInAnyGroup(tags: string, groups: readonly string[]): boolean {
	return getGroups(tags).some((group) => groups.includes(group));
}

/**
 * Creates a custom transaction from untrusted data, e.g. from an import file or from records that
 * older versions stored without validation. Known groups are kept, the custom group is always added.
 *
 * @returns `undefined` if the data has no transaction code
 */
export function toCustomTransaction(value: unknown): Transaction | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	const { tcode, title, description, tags } = value as Record<string, unknown>;
	if (typeof tcode !== "string" || tcode.trim() === "") {
		return undefined;
	}
	const knownGroups = typeof tags === "string" ? getGroups(tags).filter((group) => (GROUPS as readonly string[]).includes(group)) : [];
	return {
		tcode: normalizeTcode(tcode),
		title: typeof title === "string" ? title : "",
		description: typeof description === "string" ? description : "",
		tags: [...new Set([...knownGroups, CUSTOM_GROUP])].join(","),
	};
}

/**
 * Normalizes a search query so that it can be passed to {@link containsQuery}.
 */
export function normalizeQuery(query: string): string {
	return query.trim().normalize("NFC").toLowerCase();
}

/**
 * Case-insensitive check whether a value contains an already normalized query.
 */
export function containsQuery(value: unknown, normalizedQuery: string): boolean {
	return (
		typeof value === "string" &&
		value.normalize("NFC").toLowerCase().includes(normalizedQuery)
	);
}

export function matchesQuery(transaction: Transaction, query: string): boolean {
	const normalizedQuery = normalizeQuery(query);
	return (
		normalizedQuery === "" ||
		SEARCH_FIELDS.some((field) => containsQuery(transaction[field], normalizedQuery))
	);
}

/**
 * Counts the transactions matching the query per group. The pseudo group {@link ALL_GROUPS}
 * counts the transactions that belong to at least one visible group.
 */
export function countByGroup(
	transactions: readonly Transaction[],
	query: string,
	visibleGroups: readonly string[]
): Record<string, number> {
	const counts: Record<string, number> = { [ALL_GROUPS]: 0 };
	GROUPS.forEach((group) => (counts[group] = 0));

	transactions
		.filter((transaction) => matchesQuery(transaction, query))
		.forEach((transaction) => {
			const groups = getGroups(transaction.tags);
			groups.forEach((group) => {
				if (group in counts && group !== ALL_GROUPS) {
					counts[group]++;
				}
			});
			if (groups.some((group) => visibleGroups.includes(group))) {
				counts[ALL_GROUPS]++;
			}
		});

	return counts;
}
