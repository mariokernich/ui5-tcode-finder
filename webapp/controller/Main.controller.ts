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
import CheckBox from "sap/m/CheckBox";
import FormattedText from "sap/m/FormattedText";
import { MenuItem$PressEvent } from "sap/m/MenuItem";
import { Button$PressEvent } from "sap/m/Button";
import { SearchField$LiveChangeEvent } from "sap/m/SearchField";
import Table from "sap/m/Table";
import ListBinding from "sap/ui/model/ListBinding";
import Util from "../util/Util";
import Database, { Transaction } from "../util/Database";
import VBox from "sap/m/VBox";
import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";

type Action = keyof MessageBox["Action"];

/**
 * @namespace de.kernich.tcode.controller
 */
export default class Main extends BaseController {
	private db: Database;
	private standardTransactions: Transaction[];

	private local = {
		selectedTag: "ALL",
		allCount: 0,
		generalCount: 0,
		ui5Count: 0,
		abapCount: 0,
		ewmCount: 0,
		erpCount: 0,
		customCount: 0,
	};

	public onInit() {
		this.db = new Database();
		void this.handleInit();
		this.showWelcomeDialog();
		this.setModel(new JSONModel(this.local, true), "local");
	}

	private async handleInit() {
		const model = new JSONModel();
		await model.loadData("model/transactions.json");
		this.standardTransactions = model.getData() as Transaction[];

		await this.db.open();
		const customTransactions = await this.db.getTransactions();
		const favoriteTransactions = await this.db.getFavoriteTransactions();
		const transactions = [...this.standardTransactions, ...customTransactions];

		// Merge favorite status
		transactions.forEach((transaction) => {
			transaction.favorite = favoriteTransactions.some(
				(fav) => fav.tcode === transaction.tcode
			);
		});

		const viewModel = new JSONModel(transactions);
		this.getView().setModel(viewModel);

		this.updateTabCounts(transactions);
		this.sortTable();
		this.updateDeleteButtonState();
		this.focusSearch();
	}

	private async handleResetFactory() {
		const model = new JSONModel();
		await model.loadData("model/transactions.json");
		const data = model.getData() as Transaction[];
		await this.db.resetFactoryDefaults(data);
		await this.refresh();
	}

	private async refresh(): Promise<void> {
		const customTransactions = await this.db.getTransactions();
		const transactions = [...this.standardTransactions, ...customTransactions];
		const favoriteTransactions = await this.db.getFavoriteTransactions();

		transactions.forEach((transaction) => {
			transaction.favorite = favoriteTransactions.some(
				(fav) => fav.tcode === transaction.tcode
			);
		});

		const model = new JSONModel(transactions);
		this.getView().setModel(model);

		this.updateTabCounts(transactions);
		this.filterTable();
		this.sortTable();
		this.updateDeleteButtonState();
		this.focusSearch();
	}

	private focusSearch() {
		this.getView().byId("IdSearchField").focus();
	}

	private showWelcomeDialog(): void {
		const doNotShowAgain = localStorage.getItem("doNotShowWelcomeDialog");
		if (doNotShowAgain === "true") {
			return;
		}

		const checkBox = new CheckBox({
			text: "Do not show again",
			selected: false,
		});

		const dialog = new Dialog({
			title: "Welcome to UI5/Fiori T-Code Quick Search! 🎉",
			contentWidth: "500px",
			content: new VBox({
				items: [
					new FormattedText({
						htmlText: `
							<p>This tool helps you quickly find and manage transaction codes (T-Codes) relevant to UI5 and Fiori development. You can search, copy, and favorite T-Codes for easy access. Enjoy your development journey! 🌟</p>
							<p>Simply <strong>click</strong> on a T-Code <strong>to copy</strong> it to your clipboard. You can also <strong>add your own T-Codes</strong>, delete them, or reset to factory defaults.</p>
							<p>To edit a T-Code, just right click any cell item.</p>
							<p>If you have any feedback or feature requests, feel free to open an <a href="https://github.com/marioke/de.kernich.tcode/issues" target="_blank">issue on GitHub</a> 🚀</p>
						`,
					}).addStyleClass("sapUiSmallMarginBegin sapUiSmallMarginEnd"),
					checkBox,
				],
			}),
			beginButton: new Button({
				text: "Close",
				press: () => {
					if (checkBox.getSelected()) {
						localStorage.setItem("doNotShowWelcomeDialog", "true");
					}
					dialog.close();
					dialog.destroy();
				},
			}),
			draggable: true,
		});

		this.getView().addDependent(dialog);
		dialog.open();
	}

	public async onRowPress(event: Button$PressEvent): Promise<void> {
		const source = event.getSource();
		const context = source.getBindingContext();
		const tcode = context.getProperty("tcode") as string;

		await this.handleCopy(tcode);
	}

	private async handleCopy(tcode: string) {
		const prefix =
			localStorage.getItem("copyWithPrefix") === "true" ? "/n" : "";
		await Util.copy2Clipboard(prefix + tcode);
		MessageToast.show(`Transaction ${tcode} copied.`);
		this.focusSearch();
	}

	public onSearch(event: SearchField$LiveChangeEvent): void {
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		const query = event.getParameter("newValue");

		const filters = [];

		if (query.length === 0) {
			binding.filter([]);
			return;
		}

		filters.push(new Filter("tcode", FilterOperator.Contains, query));
		filters.push(new Filter("title", FilterOperator.Contains, query));
		filters.push(new Filter("description", FilterOperator.Contains, query));

		binding.filter(
			new Filter({
				filters: filters,
				and: false,
			}),
			"Application"
		);
	}

	public async onToggleFavorite(event: Button$PressEvent): Promise<void> {
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

	private sortTable() {
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		const sorters = [new Sorter("favorite", true), new Sorter("tcode", false)];
		binding.sort(sorters);
	}

	public onAddTransaction(): void {
		const inputCode = new Input({ width: "100%" }).addStyleClass(
			"sapUiSmallMarginBottom"
		);
		const inputTitle = new Input("titleInput", { width: "100%" });
		const inputDescription = new Input("descriptionInput", { width: "100%" });
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
				text: "Add",
				press: () => {
					if (inputCode.getValue().trim().length === 0) {
						MessageToast.show("Transaktionscode darf nicht leer sein.");
						return;
					}
					void this.handleAddTransaction(
						inputCode.getValue(),
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

		this.getView().addDependent(dialog);
		dialog.open();
	}

	private async handleAddTransaction(
		tcode: string,
		title: string,
		description: string
	): Promise<void> {
		if (await this.transactionExists(tcode)) {
			MessageToast.show(`Transaktionscode ${tcode} existiert bereits.`);
		} else {
			await this.addTransaction(tcode, title, description);
		}
	}

	private async transactionExists(tcode: string): Promise<boolean> {
		const transactions = await this.db.getTransactions();
		return transactions.some((item) => item.tcode === tcode);
	}

	private async addTransaction(
		tcode: string,
		title: string,
		description: string
	): Promise<void> {
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
						for (const item of selectedItems) {
							const context = item.getBindingContext();
							const tcode = context.getProperty("tcode") as string;
							await this.db.deleteTransaction(tcode);
						}
						await this.refresh();
					}
				},
			}
		);
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
		const copyWithPrefix = localStorage.getItem("copyWithPrefix") === "true";
		const checkBox = new CheckBox({
			text: "Copy T-Codes with /n prefix",
			selected: copyWithPrefix,
		});

		const dialog = new Dialog({
			title: "Settings",
			content: [
				new VBox({
					items: [checkBox],
				}).addStyleClass("sapUiSmallMargin"),
			],
			beginButton: new Button({
				text: "Save",
				press: () => {
					localStorage.setItem(
						"copyWithPrefix",
						checkBox.getSelected().toString()
					);
					dialog.close();
					dialog.destroy();
				},
			}),
			endButton: new Button({
				text: "Close",
				press: () => {
					dialog.close();
					dialog.destroy();
				},
			}),
			draggable: true,
		});

		this.getView().addDependent(dialog);
		dialog.open();
	}

	private handleEditTransaction(
		tcode: string,
		title: string,
		description: string
	): void {
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

		this.getView().addDependent(dialog);
		dialog.open();
	}

	private async handleUpdateTransaction(
		tcode: string,
		title: string,
		description: string
	): Promise<void> {
		await this.db.updateTransaction(tcode, title, description);
		await this.refresh();
	}

	private filterTable() {
		const table = this.byId("transactionTable") as Table;
		const binding = table.getBinding("items") as ListBinding;
		const selectedTag = this.local.selectedTag;

		if (selectedTag === "ALL") {
			binding.filter([]);
			return;
		}

		const filter = new Filter("tags", FilterOperator.Contains, selectedTag);
		binding.filter([filter], "Application");
	}

	public onIconTabBarSelect(event: IconTabBar$SelectEvent): void {
		const selectedKey = event.getSource().getSelectedKey();
		const table = this.byId("transactionTable") as Table;

		if (selectedKey === "CUSTOM") {
			table.setMode("MultiSelect");
		} else {
			table.setMode("None");
		}

		this.filterTable();
		this.focusSearch();
	}

	private updateTabCounts(transactions: Transaction[]): void {
		const counts = {
			allCount: transactions.length,
			generalCount: transactions.filter((t) => t.tags.includes("GENERAL"))
				.length,
			ui5Count: transactions.filter((t) => t.tags.includes("UI5")).length,
			abapCount: transactions.filter((t) => t.tags.includes("ABAP")).length,
			ewmCount: transactions.filter((t) => t.tags.includes("EWM")).length,
			erpCount: transactions.filter((t) => t.tags.includes("ERP")).length,
			customCount: transactions.filter((t) => t.tags.includes("CUSTOM")).length,
		};

		this.local.allCount = counts.allCount;
		this.local.generalCount = counts.generalCount;
		this.local.ui5Count = counts.ui5Count;
		this.local.abapCount = counts.abapCount;
		this.local.ewmCount = counts.ewmCount;
		this.local.erpCount = counts.erpCount;
	}
}
