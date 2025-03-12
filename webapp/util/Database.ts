import UI5Element from "sap/ui/core/Element";

export interface Transaction {
	tcode: string;
	description: string;
	favorite: boolean;
}

/**
 * @namespace ch.kerni.tcode.util
 */
export default class Database extends UI5Element {
	private db: IDBDatabase | null = null;

	public async open(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open("TCodeDB", 1);

			request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
				const db = (event.target as IDBOpenDBRequest).result;
				const store = db.createObjectStore("transactions", {
					keyPath: "tcode",
				});
				store.createIndex("tcode", "tcode", { unique: true });
				store.createIndex("description", "description", { unique: false });
				store.createIndex("favorite", "favorite", { unique: false });
			};

			request.onsuccess = (event: Event) => {
				this.db = (event.target as IDBOpenDBRequest).result;
				resolve();
			};

			request.onerror = (event: Event) => {
				reject((event.target as IDBOpenDBRequest).error);
			};
		});
	}

	public async addTransaction(transaction: Transaction): Promise<void> {
		return new Promise((resolve, reject) => {
			const transactionRequest = this.db.transaction(
				"transactions",
				"readwrite"
			);
			const store = transactionRequest.objectStore("transactions");
			const request = store.add(transaction);

			request.onsuccess = () => resolve();
			request.onerror = (event: Event) =>
				reject((event.target as IDBRequest).error);
		});
	}

	public async getTransactions(): Promise<Transaction[]> {
		return new Promise((resolve, reject) => {
			const transactionRequest = this.db.transaction(
				"transactions",
				"readonly"
			);
			const store = transactionRequest.objectStore("transactions");
			const request = store.getAll();

			request.onsuccess = (event: Event) =>
				resolve((event.target as IDBRequest).result as Transaction[]);
			request.onerror = (event: Event) =>
				reject((event.target as IDBRequest).error);
		});
	}

	public async updateFavorite(tcode: string, favorite: boolean): Promise<void> {
		return new Promise((resolve, reject) => {
			const transactionRequest = this.db.transaction(
				"transactions",
				"readwrite"
			);
			const store = transactionRequest.objectStore("transactions");
			const request = store.get(tcode);

			request.onsuccess = (event: Event) => {
				const transaction = (event.target as IDBRequest).result as Transaction;
				transaction.favorite = favorite;
				const updateRequest = store.put(transaction);
				updateRequest.onsuccess = () => resolve();
				updateRequest.onerror = (event: Event) =>
					reject((event.target as IDBRequest).error);
			};

			request.onerror = (event: Event) =>
				reject((event.target as IDBRequest).error);
		});
	}

	public async updateTransactionDescription(
		tcode: string,
		description: string
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const transactionRequest = this.db.transaction(
				"transactions",
				"readwrite"
			);
			const store = transactionRequest.objectStore("transactions");
			const request = store.get(tcode);

			request.onsuccess = (event: Event) => {
				const transaction = (event.target as IDBRequest).result as Transaction;
				transaction.description = description;
				const updateRequest = store.put(transaction);
				updateRequest.onsuccess = () => resolve();
				updateRequest.onerror = (event: Event) =>
					reject((event.target as IDBRequest).error);
			};

			request.onerror = (event: Event) =>
				reject((event.target as IDBRequest).error);
		});
	}

	public async deleteTransaction(tcode: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const transactionRequest = this.db.transaction(
				"transactions",
				"readwrite"
			);
			const store = transactionRequest.objectStore("transactions");
			const request = store.delete(tcode);

			request.onsuccess = () => resolve();
			request.onerror = (event: Event) =>
				reject((event.target as IDBRequest).error);
		});
	}

	public async resetFactoryDefaults(defaults: Transaction[]): Promise<void> {
		return new Promise((resolve, reject) => {
			const transactionRequest = this.db.transaction(
				"transactions",
				"readwrite"
			);
			const store = transactionRequest.objectStore("transactions");
			store.clear();

			defaults.forEach((transaction) => {
				store.add(transaction);
			});

			transactionRequest.oncomplete = () => resolve();
			transactionRequest.onerror = (event: Event) =>
				reject((event.target as IDBRequest).error);
		});
	}
}
