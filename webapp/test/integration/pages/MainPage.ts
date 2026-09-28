import type IconTabBar from "sap/m/IconTabBar";
import type IconTabFilter from "sap/m/IconTabFilter";
import type Input from "sap/m/Input";
import type ListItemBase from "sap/m/ListItemBase";
import type SearchField from "sap/m/SearchField";
import type Table from "sap/m/Table";
import type UI5Element from "sap/ui/core/Element";
import type JSONModel from "sap/ui/model/json/JSONModel";
import Opa5 from "sap/ui/test/Opa5";
import EnterText from "sap/ui/test/actions/EnterText";
import Press from "sap/ui/test/actions/Press";
import PropertyStrictEquals from "sap/ui/test/matchers/PropertyStrictEquals";
import type { Transaction } from "de/kernich/tcode/model/transaction";

const viewName = "de.kernich.tcode.view.Main";

/**
 * The tests use their own database and restore the settings afterwards to keep the data of the app untouched.
 */
const TEST_DATABASE = "TCodeDB_opa";
const STORAGE_KEYS = [
	"copyOption",
	"sapSystemUrl",
	"resetSearchAfterCopy",
	"theme",
	"visibleGroups",
	"doNotShowWelcomeDialog",
];
let storageBackup: Record<string, string | null> = {};
let originalWriteText: Clipboard["writeText"] | undefined;

function deleteDatabase(name: string): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
		request.onblocked = () => resolve();
	});
}

function getTransaction(item: ListItemBase): Transaction {
	return item.getBindingContext()?.getObject() as Transaction;
}

function getTcodes(table: Table): string[] {
	return table.getItems().map((item) => getTransaction(item).tcode);
}

function getGroupCount(table: Table, group: string): number {
	const viewModel = table.getModel("view") as JSONModel;
	return viewModel.getProperty(`/counts/${group}`) as number;
}

export default class MainPage extends Opa5 {
	// Arrangements

	iStartTheAppWithoutData(): void {
		storageBackup = Object.fromEntries(STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
		STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
		localStorage.setItem("doNotShowWelcomeDialog", "true");

		this.iWaitForPromise(deleteDatabase(TEST_DATABASE));
		this.iStartMyUIComponent({
			componentConfig: {
				name: "de.kernich.tcode",
				componentData: { databaseName: TEST_DATABASE },
			},
		});
	}

	iStubTheClipboard(): void {
		this.waitFor({
			success: () => {
				// The headless browser does not grant the permission to write to the clipboard
				originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
				navigator.clipboard.writeText = () => Promise.resolve();
			},
		});
	}

	iTeardownTheApp(): void {
		this.iTeardownMyUIComponent();
		this.waitFor({
			success: () => {
				if (originalWriteText) {
					navigator.clipboard.writeText = originalWriteText;
				}
				Object.entries(storageBackup).forEach(([key, value]) => {
					if (value === null) {
						localStorage.removeItem(key);
					} else {
						localStorage.setItem(key, value);
					}
				});
				// Create the promise only now, deleting the database earlier would close the connection of the app
				this.iWaitForPromise(deleteDatabase(TEST_DATABASE));
			},
		});
	}

	// Actions

	iSearchFor(query: string): void {
		this.waitFor({
			id: "searchField",
			viewName,
			actions: (control: UI5Element | null) => {
				const searchField = control as SearchField;
				searchField.setValue(query);
				searchField.fireLiveChange({ newValue: query });
			},
			errorMessage: "Did not find the search field",
		});
	}

	iSelectTheGroup(key: string): void {
		this.waitFor({
			id: "groupTabBar",
			viewName,
			actions: (control: UI5Element | null) => {
				// Uses the API instead of pressing the tab, which may be in the overflow on small screens
				const tabBar = control as IconTabBar;
				const tab = tabBar.getItems().find((item) => (item as IconTabFilter).getKey() === key) as IconTabFilter;
				tabBar.setSelectedKey(key);
				tabBar.fireSelect({ key, selectedKey: key, item: tab, selectedItem: tab });
			},
			errorMessage: `Did not find the group ${key}`,
		});
	}

	iPressTheNewButton(): void {
		this.waitFor({
			controlType: "sap.m.Button",
			viewName,
			matchers: new PropertyStrictEquals({ name: "icon", value: "sap-icon://add-document" }),
			actions: new Press(),
			errorMessage: "Did not find the New button",
		});
	}

	iEnterTheTransaction(tcode: string, title: string): void {
		this.enterTextInDialog("--transactionCodeInput", tcode);
		this.enterTextInDialog("--transactionTitleInput", title);
	}

	iPressTheDialogButton(text: string): void {
		this.waitFor({
			controlType: "sap.m.Button",
			searchOpenDialogs: true,
			matchers: new PropertyStrictEquals({ name: "text", value: text }),
			actions: new Press(),
			errorMessage: `Did not find the ${text} button in the dialog`,
		});
	}

	iPressTheTransaction(tcode: string): void {
		this.waitFor({
			controlType: "sap.m.ColumnListItem",
			viewName,
			matchers: (control: UI5Element) => getTransaction(control as ListItemBase).tcode === tcode,
			actions: new Press(),
			errorMessage: `Did not find the transaction ${tcode}`,
		});
	}

	iSelectTheTransaction(tcode: string): void {
		this.waitFor({
			controlType: "sap.m.ColumnListItem",
			viewName,
			matchers: (control: UI5Element) => getTransaction(control as ListItemBase).tcode === tcode,
			actions: new Press({ idSuffix: "selectMulti" }),
			errorMessage: `Did not find the transaction ${tcode}`,
		});
	}

	iPressTheClearListButton(): void {
		this.waitFor({
			id: "clearRecentButton",
			viewName,
			actions: new Press(),
			errorMessage: "Did not find the Clear List button",
		});
	}

	iPressTheDeleteButton(): void {
		this.waitFor({
			id: "deleteButton",
			viewName,
			actions: new Press(),
			errorMessage: "Did not find the Delete button",
		});
	}

	// Assertions

	theTableShouldHaveAsManyItemsAsTheGroupCount(group: string): void {
		this.waitFor({
			id: "transactionTable",
			viewName,
			check: (control: UI5Element) => (control as Table).getItems().length > 0,
			success: (control: UI5Element) => {
				const table = control as Table;
				Opa5.assert.strictEqual(
					table.getItems().length,
					getGroupCount(table, group),
					`The table shows as many transactions as the count of group ${group}`
				);
			},
			errorMessage: "The table has no items",
		});
	}

	theTableShouldOnlyShowTheGroup(group: string): void {
		this.waitFor({
			id: "transactionTable",
			viewName,
			check: (control: UI5Element) => (control as Table).getItems().length > 0,
			success: (control: UI5Element) => {
				const table = control as Table;
				const inGroup = table
					.getItems()
					.every((item) => getTransaction(item).tags.split(",").includes(group));
				Opa5.assert.ok(inGroup, `All transactions belong to group ${group}`);
			},
			errorMessage: "The table has no items",
		});
	}

	theTableShouldOnlyShowMatchesFor(query: string): void {
		this.waitFor({
			id: "transactionTable",
			viewName,
			check: (control: UI5Element) => (control as Table).getItems().length > 0,
			success: (control: UI5Element) => {
				const table = control as Table;
				const lowerCaseQuery = query.toLowerCase();
				const allMatch = table.getItems().every((item) => {
					const { tcode, title, description } = getTransaction(item);
					return [tcode, title, description].some((value) => value.toLowerCase().includes(lowerCaseQuery));
				});
				Opa5.assert.ok(allMatch, `All transactions match "${query}"`);
			},
			errorMessage: "The table has no items",
		});
	}

	theTableShouldContain(tcode: string): void {
		this.waitFor({
			id: "transactionTable",
			viewName,
			check: (control: UI5Element) => getTcodes(control as Table).includes(tcode),
			success: () => Opa5.assert.ok(true, `The table contains ${tcode}`),
			errorMessage: `The table does not contain ${tcode}`,
		});
	}

	theTableShouldNotContain(tcode: string): void {
		this.waitFor({
			id: "transactionTable",
			viewName,
			check: (control: UI5Element) => !getTcodes(control as Table).includes(tcode),
			success: () => Opa5.assert.ok(true, `The table does not contain ${tcode}`),
			errorMessage: `The table still contains ${tcode}`,
		});
	}

	private enterTextInDialog(idSuffix: string, text: string): void {
		this.waitFor({
			controlType: "sap.m.Input",
			searchOpenDialogs: true,
			matchers: (control: UI5Element) => (control as Input).getId().endsWith(idSuffix),
			actions: new EnterText({ text }),
			errorMessage: `Did not find the input ${idSuffix}`,
		});
	}
}
