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
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import HBox from "sap/m/HBox";
import DialogManager from "../util/DialogManager";
import Constants from "../Constants";
import { IconTab } from "sap/m/library";
import IconTabFilter from "sap/m/IconTabFilter";
import Panel from "sap/m/Panel";
import RadioButton from "sap/m/RadioButton";
import RadioButtonGroup from "sap/m/RadioButtonGroup";

type Action = keyof MessageBox["Action"];

const COPY_OPTIONS = {
	JUST_COPY: "Just copy T-Code",
	N_PREFIX: "Copy T-Code with /n prefix",
	O_PREFIX: "Copy T-Code with /o prefix",
	DEFAULT:
		"Copy T-Code with /n prefix by default and with /o if shift key is pressed",
	WEB_GUI: "Open in WebGUI",
};

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
		fiCount: 0,
		customCount: 0,
		busy: false,
		shiftPressed: false,
	};

	public onInit() {
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

	private handleShift() {
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

	private setDefaultSettings() {
		if (localStorage.getItem("copyWithPrefix") === null) {
			localStorage.setItem("copyWithPrefix", "true");
		}
		if (localStorage.getItem("resetSearchAfterCopy") === null) {
			localStorage.setItem("resetSearchAfterCopy", "false");
		}
		if (localStorage.getItem("theme") === null) {
			localStorage.setItem("theme", "System");
		}
		// set visibleGroups to all groups by default
		if (localStorage.getItem("visibleGroups") === null) {
			localStorage.setItem(
				"visibleGroups",
				JSON.stringify(Constants.TCODE_GROUPS)
			);
		}
	}

	private handleTheme() {
		const theme = localStorage.getItem("theme") || "System";
		this.applyTheme(theme);

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", (e) => {
			const darkMode = e.matches;
			if (darkMode) {
				this.applyTheme("Dark");
			} else {
				this.applyTheme("Light");
			}
		});
	}

	private async refresh(): Promise<void> {
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

	private focusSearch() {
		this.getView().byId("IdSearchField").focus();
	}

	private showWelcomeDialog(): void {
		const doNotShowAgain = localStorage.getItem("doNotShowWelcomeDialog");
		if (doNotShowAgain === "true") {
			return;
		}

		DialogManager.showWelcome();
	}

	public async onRowPress(event: Button$PressEvent): Promise<void> {
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
				MessageToast.show(`Transaction ${tcode} copied.`);
				break;
			case COPY_OPTIONS.DEFAULT:
				if (this.local.shiftPressed) {
					textToCopy = `/o${tcode}`;
				} else {
					textToCopy = `/n${tcode}`;
				}
				MessageToast.show(`Transaction ${tcode} copied.`);
				break;
			case COPY_OPTIONS.WEB_GUI:
				if (sapSystemUrl.length === 0) {
					MessageToast.show("Please set SAP System URL in settings.");
					return;
				}
				if (sapSystemUrl.endsWith("/")) {
					sapSystemUrl = sapSystemUrl.slice(0, -1);
				}
				tcode = encodeURIComponent(tcode);
				window.open(
					`${sapSystemUrl}/sap/bc/gui/sap/its/webgui?~transaction=${tcode}`,
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

	private resetSearch() {
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
		const onSubmit = () => {
			if (inputCode.getValue().trim().length === 0) {
				MessageToast.show("Transaction code cannot be empty.");
				return;
			}
			void this.handleAddTransaction(
				inputCode.getValue(),
				inputTitle.getValue(),
				inputDescription.getValue(),
				dialog
			);
		};
		const inputCode = new Input({
			width: "100%",
			placeholder: "Enter transaction...",
			submit: onSubmit,
		}).addStyleClass("sapUiSmallMarginBottom");
		const inputTitle = new Input("titleInput", {
			width: "100%",
			placeholder: "Enter title...",
			submit: onSubmit,
		}).addStyleClass("sapUiSmallMarginBottom");
		const inputDescription = new Input("descriptionInput", {
			width: "100%",
			placeholder: "Enter description...",
			submit: onSubmit,
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
					onSubmit();
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

		this.getView().addDependent(dialog);
		dialog.open();
		inputCode.focus();
	}

	private async handleAddTransaction(
		tcode: string,
		title: string,
		description: string,
		dialog: Dialog
	): Promise<void> {
		if (await this.transactionExists(tcode)) {
			MessageToast.show(`Transaction ${tcode} exists already.`);
		} else {
			await this.addTransaction(tcode, title, description);
			dialog.close();
			dialog.destroy();
		}
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
		const copyOption =
			localStorage.getItem("copyOption") || COPY_OPTIONS.DEFAULT;
		const sapSystemUrl = localStorage.getItem("sapSystemUrl") || "";
		const resetSearchAfterCopy =
			localStorage.getItem("resetSearchAfterCopy") !== "false";
		const currentTheme = localStorage.getItem("theme") || "System";
		const visibleGroups: string[] = JSON.parse(
			localStorage.getItem("visibleGroups") || "[]"
		) as string[];
		const radioButtonGroup = new RadioButtonGroup({
			selectedIndex: [
				COPY_OPTIONS.JUST_COPY,
				COPY_OPTIONS.DEFAULT,
				COPY_OPTIONS.O_PREFIX,
				COPY_OPTIONS.WEB_GUI,
			].indexOf(copyOption),
			buttons: [
				new RadioButton({ text: COPY_OPTIONS.JUST_COPY }),
				new RadioButton({ text: COPY_OPTIONS.DEFAULT }),
				new RadioButton({ text: COPY_OPTIONS.O_PREFIX }),
				new RadioButton({ text: COPY_OPTIONS.WEB_GUI }),
			],
			select: (event) => {
				const selectedIndex = event.getParameter("selectedIndex");
				const buttons = radioButtonGroup.getButtons();
				const selectedText = buttons[selectedIndex].getText();
				if (selectedText === COPY_OPTIONS.WEB_GUI) {
					sapSystemUrlInput.setVisible(true);
				} else {
					sapSystemUrlInput.setVisible(false);
				}
			},
		});
		const sapSystemUrlInput = new Input({
			width: "100%",
			placeholder:
				"Enter base SAP System URL like https://example.com:50000...",
			value: sapSystemUrl,
			visible: copyOption === COPY_OPTIONS.WEB_GUI,
		});
		const checkBoxResetSearch = new CheckBox({
			text: "Reset search after copy",
			selected: resetSearchAfterCopy,
		}).addStyleClass("sapUiSmallMarginTop");
		const themeSelect = new Select({
			selectedKey: currentTheme,
			items: [
				new Item({ key: "Light", text: "Light" }),
				new Item({ key: "Dark", text: "Dark" }),
				new Item({ key: "System", text: "System" }),
			],
		});
		const groupSelect = new VBox({
			items: Constants.TCODE_GROUPS.map(
				(group) =>
					new CheckBox({
						text: group,
						selected: visibleGroups.includes(group),
						select: (event) => {
							const selected = event.getParameter("selected");
							if (selected) {
								visibleGroups.push(group);
							} else {
								const index = visibleGroups.indexOf(group);
								if (index > -1) {
									visibleGroups.splice(index, 1);
								}
							}
						},
					})
			),
		});

		const dialog = new Dialog({
			title: "Settings",
			contentWidth: "550px",
			content: [
				new VBox({
					items: [
						new Panel({
							headerText: "General",
							expandable: true,
							expanded: true,
							content: [
								new VBox({
									items: [
										new HBox({
											items: [
												new Label({ text: "Design:" }).addStyleClass(
													"sapUiTinyMarginEnd"
												),
												themeSelect,
											],
											alignItems: "Center",
											alignContent: "Center",
										}).addStyleClass("sapUiTinyMarginBegin"),
									],
								}),
							],
						}),
						new Panel({
							headerText: "Copy behavior",
							expandable: true,
							expanded: false,
							content: [
								new VBox({
									items: [
										radioButtonGroup,
										sapSystemUrlInput,
										checkBoxResetSearch,
									],
								}),
							],
						}),
						new Panel({
							headerText: "Visible Groups",
							expandable: true,
							expanded: false,
							content: [groupSelect],
						}),
					],
				}).addStyleClass("sapUiSmallMargin"),
			],
			beginButton: new Button({
				text: "Save",
				icon: "sap-icon://save",
				press: () => {
					const selectedIndex = radioButtonGroup.getSelectedIndex();
					const buttons = radioButtonGroup.getButtons();
					const selectedText = buttons[selectedIndex].getText();
					localStorage.setItem("copyOption", selectedText);
					localStorage.setItem("sapSystemUrl", sapSystemUrlInput.getValue());
					localStorage.setItem(
						"resetSearchAfterCopy",
						checkBoxResetSearch.getSelected().toString()
					);
					localStorage.setItem("visibleGroups", JSON.stringify(visibleGroups));
					const selectedTheme = themeSelect.getSelectedKey();
					localStorage.setItem("theme", selectedTheme);
					this.applyTheme(selectedTheme);
					this.updateVisibleGroups();
					void this.updateTabCounts();
					dialog.close();
					dialog.destroy();
					this.focusSearch();
					MessageToast.show("Settings saved.");
				},
			}),
			endButton: new Button({
				text: "Cancel",
				icon: "sap-icon://decline",
				press: () => {
					dialog.close();
					dialog.destroy();
					this.focusSearch();
				},
			}),
			draggable: true,
		});

		dialog.open();
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
				break;
			case "Dark":
				DarkModeHelper.toDark();
				break;
			case "System":
			default: {
				const prefersDarkScheme = window.matchMedia(
					"(prefers-color-scheme: dark)"
				).matches;
				if (prefersDarkScheme) {
					DarkModeHelper.toDark();
				} else {
					DarkModeHelper.toLight();
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
						filters: filters,
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

		if (selectedKey === "CUSTOM") {
			table.setMode("MultiSelect");
		} else {
			table.setMode("None");
		}

		this.filterTable();
		this.focusSearch();
	}

	private async updateTabCounts() {
		const customTransactions = await this.db.getTransactions();
		const transactions = [...this.standardTransactions, ...customTransactions];

		const counts = {
			allCount: 0,
			generalCount: transactions.filter((t) => t.tags.includes("GENERAL"))
				.length,
			ui5Count: transactions.filter((t) => t.tags.includes("UI5")).length,
			abapCount: transactions.filter((t) => t.tags.includes("ABAP")).length,
			ewmCount: transactions.filter((t) => t.tags.includes("EWM")).length,
			erpCount: transactions.filter((t) => t.tags.includes("ERP")).length,
			fiCount: transactions.filter((t) => t.tags.includes("FI")).length,
			customCount: transactions.filter((t) => t.tags.includes("CUSTOM")).length,
		};

		const visibleGroups: string[] = JSON.parse(
			localStorage.getItem("visibleGroups") || "[]"
		) as string[];

		transactions.forEach((transaction) => {
			const groups = transaction.tags.split(",");
			if (groups.some((group) => visibleGroups.includes(group))) {
				counts.allCount++;
			}
		});

		this.local.allCount = counts.allCount;
		this.local.generalCount = counts.generalCount;
		this.local.ui5Count = counts.ui5Count;
		this.local.abapCount = counts.abapCount;
		this.local.ewmCount = counts.ewmCount;
		this.local.erpCount = counts.erpCount;
		this.local.fiCount = counts.fiCount;
		this.local.customCount = counts.customCount;

		this.filterTable();
	}

	public onOpenGitHub() {
		Util.openUrl(Constants.GITHUB_URL);
	}

	public onOpenLinkedIn() {
		Util.openUrl(Constants.LINKEDIN_URL);
	}
}
