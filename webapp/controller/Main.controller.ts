import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import { MenuItem$PressEvent } from "sap/m/MenuItem";
import { Button$PressEvent } from "sap/m/Button";
import SearchField, { SearchField$LiveChangeEvent } from "sap/m/SearchField";
import Table from "sap/m/Table";
import ListBinding from "sap/ui/model/ListBinding";
import Util from "../util/Util";
import Database, { Transaction } from "../util/Database";
import VBox from "sap/m/VBox";
import IconTabBar, { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import DarkModeHelper from "../util/DarkModeHelper";
import DialogManager from "../util/DialogManager";
import Constants from "../Constants";
import { IconTab } from "sap/m/library";
import IconTabFilter from "sap/m/IconTabFilter";
import SettingsDialog, { ImportData, COPY_OPTIONS } from "./SettingsDialog";

type Action = keyof MessageBox["Action"];

interface LocalModel {
	selectedTag: string;
	allCount: number;
	generalCount: number;
	ui5Count: number;
	abapCount: number;
	ewmCount: number;
	erpCount: number;
	fiCount: number;
	customCount: number;
	busy: boolean;
	shiftPressed: boolean;
	dark: boolean;
}

interface TableItem {
	getBindingContext(): {
		getProperty(key: string): unknown;
	};
}

/**
 * @namespace de.kernich.tcode.controller
 */
export default class Main extends BaseController {
	private db: Database;
	private standardTransactions: Transaction[];
	private local: LocalModel;

	public onInit(): void {
		this.local = {
			selectedTag: "ALL",
			allCount: 0,
			generalCount: 0,
			ui5Count: 0,
			abapCount: 0,
			ewmCount: 0,
			erpCount: 0,
			fiCount: 0,
			customCount: 0,
			busy: false,
			shiftPressed: false,
			dark: false,
		};
		void this.handleInit();
	}

	private async handleInit() {
		this.db = new Database();
		this.setDefaultSettings();
		this.setModel(new JSONModel(this.local, true), "local");

		const model = new JSONModel();
		await model.loadData("model/transactions.json");
		this.standardTransactions = model.getData() as Transaction[];

		await this.db.open();
		await this.refresh();

		this.handleTheme();
		this.updateVisibleGroups();
		this.handleShift();
		this.showWelcomeDialog();
	}

	private handleShift(): void {
		document.addEventListener("keydown", (event) => {
			if (event.shiftKey) {
				this.local.shiftPressed = true;
			}
		});

		document.addEventListener("keyup", (event) => {
			if (!event.shiftKey) {
				this.local.shiftPressed = false;
			}
		});
	}

	private setDefaultSettings(): void {
		const defaultSettings = {
			copyWithPrefix: "true",
			resetSearchAfterCopy: "false",
			theme: "System",
			visibleGroups: JSON.stringify(Constants.TCODE_GROUPS),
		};

		Object.entries(defaultSettings).forEach(([key, value]) => {
			if (localStorage.getItem(key) === null) {
				localStorage.setItem(key, value);
			}
		});
	}

	private handleTheme(): void {
		const theme = localStorage.getItem("theme") || "System";
		this.applyTheme(theme);

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", (e) => {
			const darkMode = e.matches;
			this.applyTheme(darkMode ? "Dark" : "Light");
			this.local.dark = darkMode;
		});
	}

	private async refresh() {
		this.local.busy = true;
		try {
			const customTransactions = await this.db.getTransactions();
			const transactions = [
				...this.standardTransactions,
				...customTransactions,
			];
			const favoriteTransactions = await this.db.getFavoriteTransactions();

			transactions.forEach((transaction) => {
				transaction.favorite = favoriteTransactions.some(
					(fav) => fav.tcode === transaction.tcode
				);
			});

			const model = new JSONModel(transactions);
			this.getView().setModel(model);

			this.filterTable();
			this.sortTable();
			this.updateDeleteButtonState();
			void this.updateTabCounts();
			this.focusSearch();
		} finally {
			this.local.busy = false;
		}
	}

	private focusSearch(): void {
		this.getView().byId("IdSearchField").focus();
	}

	private showWelcomeDialog(): void {
		if (localStorage.getItem("doNotShowWelcomeDialog") !== "true") {
			DialogManager.showWelcome();
		}
	}

	public async onRowPress(event: Button$PressEvent) {
		const source = event.getSource();
		const context = source.getBindingContext();
		const tcode = context.getProperty("tcode") as string;
		await this.handleCopy(tcode);
	}

	private async handleCopy(tcode: string) {
		const copyOption =
			localStorage.getItem("copyOption") || COPY_OPTIONS.DEFAULT;
		let sapSystemUrl = localStorage.getItem("sapSystemUrl") || "";
		let textToCopy = tcode;

		switch (copyOption) {
			case COPY_OPTIONS.O_PREFIX:
				textToCopy = `/o${tcode}`;
				break;
			case COPY_OPTIONS.DEFAULT:
				textToCopy = this.local.shiftPressed ? `/o${tcode}` : `/n${tcode}`;
				break;
			case COPY_OPTIONS.WEB_GUI:
				if (!sapSystemUrl) {
					MessageToast.show("Please set SAP System URL in settings.");
					return;
				}
				sapSystemUrl = sapSystemUrl.replace(/\/$/, "");
				window.open(
					`${sapSystemUrl}/sap/bc/gui/sap/its/webgui?~transaction=${encodeURIComponent(
						tcode
					)}`,
					"_blank"
				);
				return;
		}

		await Util.copy2Clipboard(textToCopy);
		MessageToast.show(`Transaction ${tcode} copied.`);

		if (localStorage.getItem("resetSearchAfterCopy") === "true") {
			this.resetSearch();
		}
		this.focusSearch();
	}

	private resetSearch(): void {
		const searchField = this.getView().byId("IdSearchField") as SearchField;
		searchField.setValue("");
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		binding.filter([]);
		this.local.selectedTag = "ALL";
	}

	public onSearch(event: SearchField$LiveChangeEvent): void {
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		const query = event.getParameter("newValue");

		if (query.length === 0) {
			binding.filter([]);
			void this.updateTabCounts();
			return;
		}

		const filters = [
			new Filter("tcode", FilterOperator.Contains, query),
			new Filter("title", FilterOperator.Contains, query),
			new Filter("description", FilterOperator.Contains, query),
		];

		binding.filter(
			new Filter({
				filters,
				and: false,
			}),
			"Application"
		);

		void this.updateTabCounts(query);
	}

	public async onToggleFavorite(event: Button$PressEvent) {
		const source = event.getSource();
		const context = source.getBindingContext();
		const tcode = context.getProperty("tcode") as string;
		const favorite = context.getProperty("favorite") as boolean;

		if (favorite) {
			await this.db.removeFavorite(tcode);
		} else {
			await this.db.addFavorite(tcode);
		}
		await this.refresh();
	}

	private sortTable(): void {
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		const sorters = [new Sorter("favorite", true), new Sorter("tcode", false)];
		binding.sort(sorters);
	}

	public onAddTransaction(): void {
		const dialog = this.createAddTransactionDialog();
		this.getView().addDependent(dialog);
		dialog.open();
	}

	private createAddTransactionDialog(): Dialog {
		const inputCode = new Input({
			id: "tcodeInput",
			width: "100%",
			placeholder: "Enter transaction...",
			submit: () => {
				void this.handleAddTransactionSubmit(
					inputCode,
					inputTitle,
					inputDescription,
					dialog
				);
			},
		}).addStyleClass("sapUiSmallMarginBottom");

		const inputTitle = new Input({
			id: "titleInput",
			width: "100%",
			placeholder: "Enter title...",
			submit: () => {
				void this.handleAddTransactionSubmit(
					inputCode,
					inputTitle,
					inputDescription,
					dialog
				);
			},
		}).addStyleClass("sapUiSmallMarginBottom");

		const inputDescription = new Input({
			id: "descriptionInput",
			width: "100%",
			placeholder: "Enter description...",
			submit: () => {
				void this.handleAddTransactionSubmit(
					inputCode,
					inputTitle,
					inputDescription,
					dialog
				);
			},
		});

		const dialog = new Dialog({
			title: "Add Transaction",
			content: [
				new VBox({
					items: [
						new Label({ text: "Transaction Code", labelFor: "tcodeInput" }),
						inputCode,
						new Label({ text: "Title", labelFor: "titleInput" }),
						inputTitle,
						new Label({ text: "Description", labelFor: "descriptionInput" }),
						inputDescription,
					],
				}).addStyleClass("sapUiSmallMargin"),
			],
			beginButton: new Button({
				text: "Save",
				icon: "sap-icon://save",
				press: () => {
					void this.handleAddTransactionSubmit(
						inputCode,
						inputTitle,
						inputDescription,
						dialog
					);
				},
			}),
			endButton: new Button({
				text: "Cancel",
				icon: "sap-icon://decline",
				press: () => {
					dialog.close();
					dialog.destroy();
				},
			}),
		});

		dialog.attachAfterOpen(() => {
			inputCode.focus();
		});

		return dialog;
	}

	private async handleAddTransactionSubmit(
		inputCode: Input,
		inputTitle: Input,
		inputDescription: Input,
		dialog: Dialog
	) {
		const tcode = inputCode.getValue().trim();
		if (!tcode) {
			MessageToast.show("Transaction code cannot be empty.");
			return;
		}

		if (await this.transactionExists(tcode)) {
			MessageToast.show(`Transaction ${tcode} exists already.`);
			return;
		}

		await this.addTransaction(
			tcode,
			inputTitle.getValue(),
			inputDescription.getValue()
		);
		dialog.close();
		dialog.destroy();
	}

	private async transactionExists(tcode: string): Promise<boolean> {
		const customTransactions = await this.db.getTransactions();
		const transactions = [...this.standardTransactions, ...customTransactions];
		return transactions.some((item) => item.tcode === tcode);
	}

	private async addTransaction(
		tcode: string,
		title: string,
		description: string
	) {
		const newTransaction = { tcode, title, description, tags: "CUSTOM" };
		await this.db.addTransaction(newTransaction);
		await this.refresh();
	}

	public onDeleteTransaction(): void {
		const table = this.byId("transactionTable") as Table;
		const selectedItems = table.getSelectedItems();

		if (selectedItems.length === 0) {
			MessageToast.show("Please select at least one transaction to delete.");
			return;
		}

		MessageBox.confirm(
			"Are you sure you want to delete the selected transactions?",
			{
				actions: [MessageBox.Action.YES, MessageBox.Action.NO],
				onClose: async (action: Action) => {
					if (action === MessageBox.Action.YES) {
						await this.deleteSelectedTransactions(selectedItems);
					}
				},
			}
		);
	}

	private async deleteSelectedTransactions(selectedItems: TableItem[]) {
		for (const item of selectedItems) {
			const context = item.getBindingContext();
			const tcode = context.getProperty("tcode") as string;
			await this.db.deleteTransaction(tcode);
		}
		await this.refresh();
	}

	private updateDeleteButtonState(): void {
		const table = this.byId("transactionTable") as Table;
		const deleteButton = this.byId("deleteButton") as Button;
		const selectedItems = table.getSelectedItems();
		const canDelete = selectedItems.every((item) => {
			const context = item.getBindingContext();
			const tags = context.getProperty("tags") as string;
			return tags.includes("CUSTOM");
		});
		deleteButton.setEnabled(canDelete);
	}

	public onSelectionChange(): void {
		this.updateDeleteButtonState();
	}

	public onEditTransaction(event: MenuItem$PressEvent): void {
		const item = event.getSource();
		const context = item.getBindingContext();
		const tcode = context.getProperty("tcode") as string;
		const title = context.getProperty("title") as string;
		const description = context.getProperty("description") as string;
		const tags = context.getProperty("tags") as string;

		if (tags.includes("CUSTOM")) {
			this.handleEditTransaction(tcode, title, description);
		} else {
			MessageToast.show("Standard transactions cannot be edited.");
		}
	}

	public onOpenSettings(): void {
		const settingsDialog = new SettingsDialog({
			onSave: (settings) => this.handleSettingsSave(settings),
			onImport: (data) => this.handleImport(data),
			onExport: () => this.handleExport(),
		});
		settingsDialog.open();
	}

	private handleSettingsSave(settings: {
		copyOption: string;
		sapSystemUrl: string;
		resetSearchAfterCopy: boolean;
		visibleGroups: string[];
		theme: string;
	}): void {
		localStorage.setItem("copyOption", settings.copyOption);
		localStorage.setItem("sapSystemUrl", settings.sapSystemUrl);
		localStorage.setItem(
			"resetSearchAfterCopy",
			settings.resetSearchAfterCopy.toString()
		);
		localStorage.setItem(
			"visibleGroups",
			JSON.stringify(settings.visibleGroups)
		);
		localStorage.setItem("theme", settings.theme);

		this.applyTheme(settings.theme);
		this.updateVisibleGroups();
		void this.updateTabCounts();
		this.local.dark = settings.theme === "Dark";
		this.focusSearch();
	}

	private updateVisibleGroups(): void {
		const visibleGroups: string[] = JSON.parse(
			localStorage.getItem("visibleGroups") || "[]"
		) as string[];
		const iconTabBar = this.byId("iconTabBar") as IconTabBar;
		iconTabBar.getItems().forEach((item: IconTab) => {
			if ((item as IconTabFilter).getKey() === "ALL") {
				(item as IconTabFilter).setVisible(true);
				return;
			}
			(item as IconTabFilter).setVisible(
				visibleGroups.includes((item as IconTabFilter).getKey())
			);
		});
	}

	private applyTheme(theme: string): void {
		switch (theme) {
			case "Light":
				DarkModeHelper.toLight();
				this.local.dark = false;
				break;
			case "Dark":
				DarkModeHelper.toDark();
				this.local.dark = true;
				break;
			case "System":
			default: {
				const prefersDarkScheme = window.matchMedia(
					"(prefers-color-scheme: dark)"
				).matches;
				if (prefersDarkScheme) {
					DarkModeHelper.toDark();
					this.local.dark = true;
				} else {
					DarkModeHelper.toLight();
					this.local.dark = false;
				}
				break;
			}
		}
	}

	private handleEditTransaction(
		tcode: string,
		title: string,
		description: string
	): void {
		const dialog = this.createEditTransactionDialog(tcode, title, description);
		this.getView().addDependent(dialog);
		dialog.open();
	}

	private createEditTransactionDialog(
		tcode: string,
		title: string,
		description: string
	): Dialog {
		const inputTitle = new Input({
			width: "100%",
			value: title,
		});
		const inputDescription = new Input({
			width: "100%",
			value: description,
		});

		const dialog = new Dialog({
			title: `Edit Transaction ${tcode}`,
			content: [
				new VBox({
					items: [
						new Label({ text: "Title", labelFor: "titleInput" }),
						inputTitle,
						new Label({ text: "Description", labelFor: "descriptionInput" }),
						inputDescription,
					],
				}).addStyleClass("sapUiSmallMargin"),
			],
			beginButton: new Button({
				text: "Save",
				press: () => {
					void this.handleUpdateTransaction(
						tcode,
						inputTitle.getValue(),
						inputDescription.getValue()
					);
					dialog.close();
					dialog.destroy();
				},
			}),
			endButton: new Button({
				text: "Cancel",
				press: () => {
					dialog.close();
					dialog.destroy();
				},
			}),
			draggable: true,
		});

		return dialog;
	}

	private async handleUpdateTransaction(
		tcode: string,
		title: string,
		description: string
	) {
		await this.db.updateTransaction(tcode, title, description);
		await this.refresh();
	}

	private filterTable(): void {
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		const selectedTag = this.local.selectedTag;

		if (selectedTag === "ALL") {
			const availableTags = JSON.parse(
				localStorage.getItem("visibleGroups") || "[]"
			) as string[];
			const filters: Filter[] = [];
			availableTags.forEach((tag) => {
				filters.push(new Filter("tags", FilterOperator.Contains, tag));
			});
			binding.filter(
				[
					new Filter({
						filters,
						and: false,
					}),
				],
				"Application"
			);
			return;
		}

		const filter = new Filter("tags", FilterOperator.Contains, selectedTag);
		binding.filter([filter], "Application");
	}

	public onIconTabBarSelect(event: IconTabBar$SelectEvent): void {
		const selectedKey = event.getSource().getSelectedKey();
		const table = this.byId("transactionTable") as Table;

		table.setMode(selectedKey === "CUSTOM" ? "MultiSelect" : "None");
		this.filterTable();
		this.focusSearch();
	}

	private async updateTabCounts(searchQuery?: string) {
		const customTransactions = await this.db.getTransactions();
		const transactions = [...this.standardTransactions, ...customTransactions];

		const filteredTransactions = searchQuery
			? transactions.filter(
					(t) =>
						t.tcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
						t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
						t.description.toLowerCase().includes(searchQuery.toLowerCase())
			  )
			: transactions;

		const counts = {
			allCount: 0,
			generalCount: filteredTransactions.filter((t) =>
				t.tags.includes("GENERAL")
			).length,
			ui5Count: filteredTransactions.filter((t) => t.tags.includes("UI5"))
				.length,
			abapCount: filteredTransactions.filter((t) => t.tags.includes("ABAP"))
				.length,
			ewmCount: filteredTransactions.filter((t) => t.tags.includes("EWM"))
				.length,
			erpCount: filteredTransactions.filter((t) => t.tags.includes("ERP"))
				.length,
			fiCount: filteredTransactions.filter((t) => t.tags.includes("FI")).length,
			customCount: filteredTransactions.filter((t) => t.tags.includes("CUSTOM"))
				.length,
		};

		const visibleGroups: string[] = JSON.parse(
			localStorage.getItem("visibleGroups") || "[]"
		) as string[];

		filteredTransactions.forEach((transaction) => {
			const groups = transaction.tags.split(",");
			if (groups.some((group) => visibleGroups.includes(group))) {
				counts.allCount++;
			}
		});

		Object.assign(this.local, counts);
	}

	public onOpenGitHub(): void {
		Util.openUrl(Constants.GITHUB_URL);
	}

	public onOpenLinkedIn(): void {
		Util.openUrl(Constants.LINKEDIN_URL);
	}

	private async handleExport() {
		try {
			const settings = {
				copyOption: localStorage.getItem("copyOption"),
				sapSystemUrl: localStorage.getItem("sapSystemUrl"),
				resetSearchAfterCopy: localStorage.getItem("resetSearchAfterCopy"),
				theme: localStorage.getItem("theme"),
				visibleGroups: JSON.parse(
					localStorage.getItem("visibleGroups") || "[]"
				) as string[],
			};

			const customTransactions = await this.db.getTransactions();
			const favoriteTransactions = await this.db.getFavoriteTransactions();

			const exportData = {
				settings,
				customTransactions,
				favoriteTransactions,
			};

			const jsonString = JSON.stringify(exportData, null, 2);
			const blob = new Blob([jsonString], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "tcode-settings.json";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			MessageToast.show("Settings exported successfully");
		} catch (error) {
			MessageBox.error(
				`Failed to export settings: ${
					error instanceof Error ? error.message : "Unknown error occurred"
				}`
			);
		}
	}

	private async handleImport(data: ImportData) {
		try {
			if (data.settings) {
				Object.entries(data.settings).forEach(([key, value]) => {
					if (typeof value === "object") {
						localStorage.setItem(key, JSON.stringify(value));
					} else if (value !== undefined && value !== null) {
						localStorage.setItem(key, String(value));
					}
				});
			}

			if (data.customTransactions) {
				await this.db.clearTransactions();
				for (const transaction of data.customTransactions) {
					await this.db.addTransaction(transaction);
				}
			}

			if (data.favoriteTransactions) {
				await this.db.clearFavorites();
				for (const transaction of data.favoriteTransactions) {
					await this.db.addFavorite(transaction.tcode);
				}
			}

			this.applyTheme(data.settings?.theme || "System");
			await this.refresh();
		} catch (error) {
			throw new Error(
				error instanceof Error ? error.message : "Unknown error occurred"
			);
		}
	}
}
