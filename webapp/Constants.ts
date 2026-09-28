export const GITHUB_URL = "https://github.com/mariokernich/ui5-tcode-finder";
export const LINKEDIN_URL = "https://www.linkedin.com/in/mariokernich";

/**
 * Transaction groups in display order. A group key equals the tag used in the transaction data.
 */
export const GROUPS = ["GENERAL", "UI5", "ABAP", "EWM", "ERP", "FI", "CUSTOM"] as const;
export type Group = (typeof GROUPS)[number];

/**
 * Group of the transactions maintained by the user
 */
export const CUSTOM_GROUP: Group = "CUSTOM";

/**
 * Key of the pseudo group that contains the transactions of all visible groups
 */
export const ALL_GROUPS = "ALL";

/**
 * Key of the pseudo group that contains the recently used transactions
 */
export const RECENT_GROUP = "RECENT";

/**
 * Maximum number of recently used transactions that are remembered
 */
export const RECENT_LIMIT = 20;
