import Database from "de/kernich/tcode/util/Database";

let counter = 0;

function uniqueName(): string {
	counter++;
	return `TCodeDB_unit_${Date.now()}_${counter}`;
}

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
		request.onblocked = () => resolve();
	});
}

/**
 * Creates a database with the schema and data layout of version 1.1.0 of the app.
 */
function createVersion1Database(
	name: string,
	data: { transactions: object[]; favorites: object[] }
): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			const transactions = db.createObjectStore("transactions", { keyPath: "tcode" });
			transactions.createIndex("tcode", "tcode", { unique: true });
			transactions.createIndex("description", "description", { unique: false });
			transactions.createIndex("favorite", "favorite", { unique: false });
			const favorites = db.createObjectStore("favorites", { keyPath: "tcode" });
			favorites.createIndex("tcode", "tcode", { unique: true });
			data.transactions.forEach((record) => transactions.add(record));
			data.favorites.forEach((record) => favorites.add(record));
		};
		request.onsuccess = () => {
			request.result.close();
			resolve();
		};
		request.onerror = () => reject(request.error ?? new Error("open failed"));
	});
}

/**
 * QUnit 2.3 of UI5 has no assert.rejects
 */
async function assertRejects(
	assert: Assert,
	promise: Promise<unknown>,
	isExpected: (error: Error) => boolean,
	message: string
): Promise<void> {
	try {
		await promise;
		assert.ok(false, `${message}: the promise was fulfilled`);
	} catch (error) {
		assert.ok(error instanceof Error && isExpected(error), message);
	}
}

interface Context {
	name: string;
	database: Database;
}

QUnit.module("util/Database", {
	beforeEach(this: Context) {
		this.name = uniqueName();
		this.database = new Database(this.name);
	},
	async afterEach(this: Context) {
		this.database.close();
		await deleteDatabase(this.name);
	},
});

QUnit.test("fails if the database is not open", async function (this: Context, assert) {
	await assertRejects(
		assert,
		this.database.getFavorites(),
		(error) => error.message.includes("not available"),
		"reading fails"
	);
});

QUnit.test("adds, updates and deletes custom transactions", async function (this: Context, assert) {
	await this.database.open();
	await this.database.addCustomTransaction({ tcode: "ZFOO", title: "Foo", description: "", tags: "CUSTOM" });
	await this.database.addCustomTransaction({ tcode: "ZBAR", title: "Bar", description: "", tags: "CUSTOM" });
	await assertRejects(
		assert,
		this.database.addCustomTransaction({ tcode: "ZFOO", title: "Again", description: "", tags: "CUSTOM" }),
		(error) => error.name === "ConstraintError",
		"a transaction code can only be added once"
	);

	await this.database.updateCustomTransaction("ZFOO", { title: "Foo 2", description: "Changed" });
	await assertRejects(
		assert,
		this.database.updateCustomTransaction("ZMISSING", { title: "", description: "" }),
		(error) => error.message.includes("does not exist"),
		"a missing transaction cannot be updated"
	);

	await this.database.setFavorite("ZFOO", true);
	await this.database.setFavorite("SE80", true);
	await this.database.deleteCustomTransactions(["ZFOO"], ["ZFOO"]);

	assert.deepEqual(await this.database.getCustomTransactions(), [
		{ tcode: "ZBAR", title: "Bar", description: "", tags: "CUSTOM" },
	]);
	assert.deepEqual(await this.database.getFavorites(), ["SE80"]);
});

QUnit.test("sets favorites idempotently", async function (this: Context, assert) {
	await this.database.open();
	await this.database.setFavorite("SE80", true);
	await this.database.setFavorite("SE80", true);
	await this.database.setFavorite("SE11", true);
	await this.database.setFavorite("SE11", false);
	await this.database.setFavorite("SE11", false);
	assert.deepEqual(await this.database.getFavorites(), ["SE80"]);
});

QUnit.test("replaces the data atomically", async function (this: Context, assert) {
	await this.database.open();
	await this.database.addCustomTransaction({ tcode: "ZOLD", title: "", description: "", tags: "CUSTOM" });
	await this.database.setFavorite("ZOLD", true);

	await this.database.replaceAll({
		customTransactions: [{ tcode: "ZNEW", title: "New", description: "", tags: "CUSTOM" }],
		favorites: ["ZNEW", "SE80"],
	});
	assert.deepEqual(
		(await this.database.getCustomTransactions()).map((transaction) => transaction.tcode),
		["ZNEW"]
	);
	assert.deepEqual(await this.database.getFavorites(), ["SE80", "ZNEW"]);

	await this.database.replaceAll({ favorites: [] });
	assert.deepEqual(await this.database.getFavorites(), []);
	assert.strictEqual((await this.database.getCustomTransactions()).length, 1, "only the given data is replaced");
});

QUnit.test("migrates a database of version 1 to upper case transaction codes", async function (this: Context, assert) {
	await createVersion1Database(this.name, {
		transactions: [
			{ tcode: "zmy_report", title: "My report", description: "Custom", tags: "CUSTOM" },
			{ tcode: "ZUPPER", title: "Upper", description: "", tags: "CUSTOM" },
		],
		favorites: [{ tcode: "stms" }, { tcode: "/ui2/flp" }, { tcode: "SE80" }],
	});

	await this.database.open();

	assert.deepEqual(
		(await this.database.getCustomTransactions()).map((transaction) => transaction.tcode),
		["ZMY_REPORT", "ZUPPER"]
	);
	assert.deepEqual(await this.database.getFavorites(), ["/UI2/FLP", "SE80", "STMS"]);

	await this.database.setFavorite("STMS", false);
	assert.deepEqual(await this.database.getFavorites(), ["/UI2/FLP", "SE80"], "migrated keys can be deleted");
});
