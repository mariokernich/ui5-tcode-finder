import { normalizeTcode, type Transaction } from "../model/transaction";

const DEFAULT_NAME = "TCodeDB_2";
/**
 * Version history:
 * 1. Stores for custom transactions and favorites
 * 2. Transaction codes are stored in upper case
 */
const VERSION = 2;

const TRANSACTIONS = "transactions";
const FAVORITES = "favorites";
type StoreName = typeof TRANSACTIONS | typeof FAVORITES;

interface FavoriteRecord {
	tcode: string;
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
	 * Deletes custom transactions and the given favorites in one database transaction.
	 */
	public deleteCustomTransactions(
		tcodes: readonly string[],
		favoritesToRemove: readonly string[] = []
	): Promise<void> {
		return this.run([TRANSACTIONS, FAVORITES], "readwrite", (tx) => {
			const transactions = tx.objectStore(TRANSACTIONS);
			tcodes.forEach((tcode) => transactions.delete(tcode));
			const favorites = tx.objectStore(FAVORITES);
			favoritesToRemove.forEach((tcode) => favorites.delete(tcode));
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
