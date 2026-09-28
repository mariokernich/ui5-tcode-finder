import { RECENT_LIMIT } from "../Constants";
import { normalizeTcode, type Transaction } from "../model/transaction";

const DEFAULT_NAME = "TCodeDB_2";
/**
 * Version history:
 * 1. Stores for custom transactions and favorites
 * 2. Transaction codes are stored in upper case
 * 3. Store for the recently used transactions
 */
const VERSION = 3;

const TRANSACTIONS = "transactions";
const FAVORITES = "favorites";
const USAGE = "usage";
type StoreName = typeof TRANSACTIONS | typeof FAVORITES | typeof USAGE;

interface FavoriteRecord {
	tcode: string;
}

export interface UsageRecord {
	tcode: string;
	/**
	 * Time of the last use in milliseconds
	 */
	lastUsed: number;
}

type Work<T> = (transaction: IDBTransaction, abort: (reason: Error) => void) => T;

function toError(value: unknown, fallbackMessage: string): Error {
	// DOMException inherits from Error
	return value instanceof Error ? value : new Error(fallbackMessage);
}

function normalizeKeys(store: IDBObjectStore): void {
	const request = store.openCursor();
	request.onsuccess = () => {
		const cursor = request.result;
		if (!cursor) {
			return;
		}
		const record = cursor.value as { tcode: unknown };
		if (typeof record.tcode === "string") {
			const tcode = normalizeTcode(record.tcode);
			if (tcode !== record.tcode) {
				cursor.delete();
				store.put({ ...record, tcode });
			}
		}
		cursor.continue();
	};
}

function upgrade(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
	if (oldVersion < 1) {
		db.createObjectStore(TRANSACTIONS, { keyPath: "tcode" });
		db.createObjectStore(FAVORITES, { keyPath: "tcode" });
	}
	if (oldVersion < 2) {
		normalizeKeys(transaction.objectStore(TRANSACTIONS));
		normalizeKeys(transaction.objectStore(FAVORITES));
	}
	if (oldVersion < 3) {
		db.createObjectStore(USAGE, { keyPath: "tcode" });
	}
}

/**
 * Persists the custom transactions and the favorites in the IndexedDB of the browser.
 */
export default class Database {
	private readonly name: string;
	private db?: IDBDatabase;

	public constructor(name = DEFAULT_NAME) {
		this.name = name;
	}

	/**
	 * Opens the database and migrates it to the current version.
	 *
	 * @param onBlocked Called if the migration waits for another tab to close the database
	 */
	public open(onBlocked?: () => void): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.name, VERSION);
			request.onupgradeneeded = (event) => {
				if (request.transaction) {
					upgrade(request.result, request.transaction, event.oldVersion);
				}
			};
			request.onblocked = () => onBlocked?.();
			request.onsuccess = () => {
				const db = request.result;
				// Let other tabs upgrade the database; this connection becomes unusable then
				db.onversionchange = () => {
					db.close();
					this.db = undefined;
				};
				this.db = db;
				resolve();
			};
			request.onerror = () => {
				reject(toError(request.error, `Cannot open the database ${this.name}`));
			};
		});
	}

	public close(): void {
		this.db?.close();
		this.db = undefined;
	}

	public isOpen(): boolean {
		return this.db !== undefined;
	}

	public async getCustomTransactions(): Promise<Transaction[]> {
		return (await this.readAll(TRANSACTIONS)) as Transaction[];
	}

	public async getFavorites(): Promise<string[]> {
		const records = (await this.readAll(FAVORITES)) as FavoriteRecord[];
		return records.map((record) => record.tcode);
	}

	public async getUsage(): Promise<UsageRecord[]> {
		return (await this.readAll(USAGE)) as UsageRecord[];
	}

	/**
	 * Adds a custom transaction. Fails with a `ConstraintError` if the transaction code exists already.
	 */
	public addCustomTransaction(transaction: Transaction): Promise<void> {
		return this.run([TRANSACTIONS], "readwrite", (tx) => {
			tx.objectStore(TRANSACTIONS).add(transaction);
		});
	}

	public updateCustomTransaction(
		tcode: string,
		changes: Pick<Transaction, "title" | "description">
	): Promise<void> {
		return this.run([TRANSACTIONS], "readwrite", (tx, abort) => {
			const store = tx.objectStore(TRANSACTIONS);
			const request = store.get(tcode);
			request.onsuccess = () => {
				const existing = request.result as Transaction | undefined;
				if (existing) {
					store.put({ ...existing, ...changes });
				} else {
					abort(new Error(`Transaction ${tcode} does not exist`));
				}
			};
		});
	}

	/**
	 * Deletes custom transactions in one database transaction.
	 *
	 * @param orphanedTcodes Transaction codes whose favorite and usage records are deleted as well
	 */
	public deleteCustomTransactions(
		tcodes: readonly string[],
		orphanedTcodes: readonly string[] = []
	): Promise<void> {
		return this.run([TRANSACTIONS, FAVORITES, USAGE], "readwrite", (tx) => {
			const transactions = tx.objectStore(TRANSACTIONS);
			tcodes.forEach((tcode) => transactions.delete(tcode));
			const favorites = tx.objectStore(FAVORITES);
			const usage = tx.objectStore(USAGE);
			orphanedTcodes.forEach((tcode) => {
				favorites.delete(tcode);
				usage.delete(tcode);
			});
		});
	}

	/**
	 * Records the use of a transaction and forgets the least recently used transactions that exceed the limit.
	 */
	public recordUsage(tcode: string, limit = RECENT_LIMIT, lastUsed = Date.now()): Promise<void> {
		return this.run([USAGE], "readwrite", (tx) => {
			const store = tx.objectStore(USAGE);
			store.put({ tcode, lastUsed } satisfies UsageRecord);
			const request = store.getAll();
			request.onsuccess = () => {
				(request.result as UsageRecord[])
					.sort((a, b) => b.lastUsed - a.lastUsed)
					.slice(limit)
					.forEach((record) => store.delete(record.tcode));
			};
		});
	}

	public clearUsage(): Promise<void> {
		return this.run([USAGE], "readwrite", (tx) => {
			tx.objectStore(USAGE).clear();
		});
	}

	public setFavorite(tcode: string, favorite: boolean): Promise<void> {
		return this.run([FAVORITES], "readwrite", (tx) => {
			const store = tx.objectStore(FAVORITES);
			if (favorite) {
				store.put({ tcode } satisfies FavoriteRecord);
			} else {
				store.delete(tcode);
			}
		});
	}

	/**
	 * Replaces the custom transactions and/or the favorites atomically.
	 */
	public replaceAll(data: {
		customTransactions?: readonly Transaction[];
		favorites?: readonly string[];
	}): Promise<void> {
		return this.run([TRANSACTIONS, FAVORITES], "readwrite", (tx) => {
			const { customTransactions, favorites } = data;
			if (customTransactions) {
				const store = tx.objectStore(TRANSACTIONS);
				store.clear();
				customTransactions.forEach((transaction) => store.put(transaction));
			}
			if (favorites) {
				const store = tx.objectStore(FAVORITES);
				store.clear();
				favorites.forEach((tcode) => store.put({ tcode } satisfies FavoriteRecord));
			}
		});
	}

	private async readAll(storeName: StoreName): Promise<unknown[]> {
		const request = await this.run([storeName], "readonly", (tx) =>
			tx.objectStore(storeName).getAll()
		);
		return request.result as unknown[];
	}

	/**
	 * Runs work in a database transaction. The promise resolves after the transaction is committed
	 * and rejects if the transaction is aborted.
	 */
	private run<T>(
		storeNames: StoreName[],
		mode: IDBTransactionMode,
		work: Work<T>
	): Promise<T> {
		const db = this.db;
		if (!db) {
			return Promise.reject(new Error("The database is not available"));
		}
		return new Promise((resolve, reject) => {
			let abortReason: Error | undefined;
			let result: T;
			let tx: IDBTransaction;
			try {
				tx = db.transaction(storeNames, mode);
				result = work(tx, (reason) => {
					abortReason = reason;
					tx.abort();
				});
			} catch (error) {
				reject(toError(error, "The database transaction failed"));
				return;
			}
			tx.oncomplete = () => resolve(result);
			tx.onabort = () => {
				reject(abortReason ?? toError(tx.error, "The database transaction was aborted"));
			};
		});
	}
}
