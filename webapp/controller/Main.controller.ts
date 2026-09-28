import Log from "sap/base/Log";
import type { Button$PressEvent } from "sap/m/Button";
import type CheckBox from "sap/m/CheckBox";
import type Dialog from "sap/m/Dialog";
import type Input from "sap/m/Input";
import type { ListBase$BeforeOpenContextMenuEvent, ListBase$ItemPressEvent } from "sap/m/ListBase";
import type { MenuItem$PressEvent } from "sap/m/MenuItem";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type SearchField from "sap/m/SearchField";
import type { SearchField$LiveChangeEvent, SearchField$SearchEvent } from "sap/m/SearchField";
import type Table from "sap/m/Table";
import Device from "sap/ui/Device";
import { ValueState } from "sap/ui/core/library";
import Theming from "sap/ui/core/Theming";
import FileUtil from "sap/ui/core/util/File";
import type Context from "sap/ui/model/Context";
import Filter from "sap/ui/model/Filter";
import FilterType from "sap/ui/model/FilterType";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ListBinding from "sap/ui/model/ListBinding";
import Sorter from "sap/ui/model/Sorter";
import { ALL_GROUPS, CUSTOM_GROUP, GITHUB_URL, GROUPS, LINKEDIN_URL, RECENT_GROUP } from "../Constants";
import {
	SEARCH_FIELDS,
	containsQuery,
	countByGroup,
	isInAnyGroup,
	normalizeQuery,
	normalizeTcode,
	toCustomTransaction,
	type Transaction,
	type TransactionEntry,
} from "../model/transaction";
import Database, { type UsageRecord } from "../util/Database";
import { copyToClipboard, openUrl } from "../util/browser";
import { confirmAction, getErrorMessage } from "../util/messages";
import {
	CopyOption,
	buildCopyText,
	buildWebGuiUrl,
	createExportData,
	dismissWelcomeDialog,
	isWelcomeDialogDismissed,
	loadSettings,
	sanitizeSettings,
	saveSettings,
	type ImportData,
	type Settings,
} from "../util/settings";
import { isDarkTheme } from "../util/ThemeManager";
import BaseController from "./BaseController";
import SettingsDialog from "./SettingsDialog";

const LOG_COMPONENT = "de.kernich.tcode.controller.Main";

interface ViewState {
	busy: boolean;
	query: string;
	selectedGroup: string;
	counts: Record<string, number>;
	groupVisible: Record<string, boolean>;
	selectedCount: number;
	githubIcon: string;
	linkedinIcon: string;
}

interface ComponentData {
	databaseName?: string;
}

interface TransactionForm {
	mode: "add" | "edit";
	heading: string;
	tcode: string;
	title: string;
	description: string;
	tcodeState: ValueState;
	tcodeStateText: string;
}

function imageUrl(fileName: string): string {
	return sap.ui.require.toUrl(`de/kernich/tcode/img/${fileName}`);
}

/**
 * @namespace de.kernich.tcode.controller
 */
export default class Main extends BaseController {
	private database: Database;
	private readonly viewModel = new JSONModel();
	private readonly transactionModel = new JSONModel([]);
	private settings: Settings;
	private standardTransactions: Transaction[] = [];
	private entries: TransactionEntry[] = [];
	private shiftKeyPressed = false;
	private savingTransaction = false;
	private sortedByRecency?: boolean;
	private transactionDialog?: Promise<Dialog>;
	private settingsDialog?: SettingsDialog;

	/**
	 * Remembers whether Shift was pressed during the last user interaction; this decides between the
	 * /n and /o prefix. Registered in the capture phase to run before the press handlers.
	 */
	private readonly rememberShiftKey = (event: KeyboardEvent | PointerEvent): void => {
		this.shiftKeyPressed = event.shiftKey;
	};

	private readonly onThemeApplied = (): void => {
		const dark = isDarkTheme(Theming.getTheme());
		this.viewModel.setProperty("/githubIcon", imageUrl(dark ? "github-brands-w.svg" : "github-brands.svg"));
		this.viewModel.setProperty(
			"/linkedinIcon",
			imageUrl(dark ? "linkedin-brands-w.svg" : "linkedin-brands.svg")
		);
	};

	public onInit(): void {
		// Tests pass a separate database name to keep the data of the user untouched
		const componentData = this.getOwnerComponent().getComponentData() as ComponentData | undefined;
		this.database = new Database(componentData?.databaseName);
		this.settings = loadSettings();
		this.viewModel.setData({
			busy: true,
			query: "",
			selectedGroup: ALL_GROUPS,
			counts: {},
			groupVisible: {},
			selectedCount: 0,
			githubIcon: "",
			linkedinIcon: "",
		} satisfies ViewState);
		this.setModel(this.viewModel, "view");
		// List bindings show only 100 entries by default
		this.transactionModel.setSizeLimit(Number.MAX_SAFE_INTEGER);
		this.setModel(this.transactionModel);
		this.updateGroupVisibility();

		document.addEventListener("pointerdown", this.rememberShiftKey, true);
		document.addEventListener("keydown", this.rememberShiftKey, true);
		Theming.attachApplied(this.onThemeApplied);

		void this.initialize();
	}

	public onExit(): void {
		document.removeEventListener("pointerdown", this.rememberShiftKey, true);
		document.removeEventListener("keydown", this.rememberShiftKey, true);
		Theming.detachApplied(this.onThemeApplied);
		this.settingsDialog?.destroy();
		this.database.close();
		this.viewModel.destroy();
		this.transactionModel.destroy();
	}

	// -----------------------------------------------------------------------------------------
	// Search, groups and table
	// -----------------------------------------------------------------------------------------

	public onSearch(event: SearchField$LiveChangeEvent | SearchField$SearchEvent): void {
		this.viewModel.setProperty("/query", event.getSource().getValue());
		this.applyFilters();
	}

	public onGroupSelect(): void {
		// The table mode is bound to the selected group. Switching to a mode without selection has
		// removed the selection already.
		this.updateSelectedCount();
		this.applyFilters();
		this.focusSearch();
	}

	public onSelectionChange(): void {
		this.updateSelectedCount();
	}

	public async onItemPress(event: ListBase$ItemPressEvent): Promise<void> {
		const entry = this.getEntry(event.getParameter("listItem")?.getBindingContext());
		if (entry) {
			await this.copyOrOpen(entry.tcode);
		}
	}

	public async onToggleFavorite(event: Button$PressEvent): Promise<void> {
		const entry = this.getEntry(event.getSource().getBindingContext());
		if (!entry) {
			return;
		}
		const favorite = !entry.favorite;
		try {
			await this.database.setFavorite(entry.tcode, favorite);
		} catch (error) {
			this.showError("favoriteFailed", error);
			return;
		}
		this.entries
			.filter((candidate) => candidate.tcode === entry.tcode)
			.forEach((candidate) => (candidate.favorite = favorite));
		// Forces the table to sort the favorites to the top
		this.transactionModel.refresh(true);
	}

	public onBeforeOpenContextMenu(event: ListBase$BeforeOpenContextMenuEvent): void {
		const entry = this.getEntry(event.getParameter("listItem")?.getBindingContext());
		// Only custom transactions can be edited; show the browser menu for the others
		if (!entry?.custom) {
			event.preventDefault();
		}
	}

	// -----------------------------------------------------------------------------------------
	// Custom transactions
	// -----------------------------------------------------------------------------------------

	public onAddTransaction(): void {
		void this.openTransactionDialog({
			mode: "add",
			heading: this.getText("transactionDialogAddTitle"),
			tcode: "",
			title: "",
			description: "",
		});
	}

	public onEditTransaction(event: MenuItem$PressEvent): void {
		const entry = this.getEntry(event.getSource().getBindingContext());
		if (!entry?.custom) {
			return;
		}
		void this.openTransactionDialog({
			mode: "edit",
			heading: this.getText("transactionDialogEditTitle", [entry.tcode]),
			tcode: entry.tcode,
			title: entry.title,
			description: entry.description,
		});
	}

	public onTransactionDialogAfterOpen(): void {
		const form = this.getTransactionForm();
		const inputId = form.mode === "add" ? "transactionCodeInput" : "transactionTitleInput";
		(this.byId(inputId) as Input).focus();
	}

	public onTransactionCodeChange(): void {
		this.getTransactionFormModel().setProperty("/tcodeState", ValueState.None);
	}

	public async onTransactionDialogSave(): Promise<void> {
		if (this.savingTransaction) {
			return;
		}
		this.savingTransaction = true;
		try {
			await this.saveTransaction();
		} finally {
			this.savingTransaction = false;
		}
	}

	public async onTransactionDialogCancel(): Promise<void> {
		(await this.getTransactionDialog()).close();
	}

	public async onDeleteTransactions(): Promise<void> {
		const tcodes = this.getTable()
			.getSelectedContexts()
			.flatMap((context) => {
				const entry = this.getEntry(context);
				return entry?.custom ? [entry.tcode] : [];
			});

		if (tcodes.length === 0) {
			MessageToast.show(this.getText("deleteNothingSelected"));
			return;
		}
		if (!(await confirmAction(this.getText("deleteConfirm", [tcodes.length]), MessageBox.Action.DELETE))) {
			return;
		}

		// Keep favorite and usage if a standard transaction with the same code exists
		const standardTcodes = new Set(this.standardTransactions.map((transaction) => transaction.tcode));
		try {
			await this.database.deleteCustomTransactions(
				tcodes,
				tcodes.filter((tcode) => !standardTcodes.has(tcode))
			);
		} catch (error) {
			this.showError("deleteFailed", error);
			return;
		}
		MessageToast.show(this.getText("transactionsDeleted", [tcodes.length]));
		await this.refresh();
	}

	public async onClearRecent(): Promise<void> {
		try {
			await this.database.clearUsage();
			await this.updateUsage();
		} catch (error) {
			this.showError("clearRecentFailed", error);
			return;
		}
		MessageToast.show(this.getText("recentCleared"));
	}

	// -----------------------------------------------------------------------------------------
	// Settings, welcome dialog and links
	// -----------------------------------------------------------------------------------------

	public onOpenSettings(): void {
		// The view is always available after the controller is initialized
		this.settingsDialog ??= new SettingsDialog(this.getView()!, {
			getText: (key, args) => this.getText(key, args),
			save: (settings) => this.applySettings(settings),
			export: () => this.exportData(),
			import: (data) => this.importData(data),
		});
		void this.settingsDialog.open(this.settings);
	}

	public onWelcomeDialogClose(): void {
		(this.byId("welcomeDialog") as Dialog).close();
	}

	public onWelcomeDialogAfterClose(): void {
		if ((this.byId("welcomeDoNotShowAgain") as CheckBox).getSelected()) {
			dismissWelcomeDialog();
		}
		(this.byId("welcomeDialog") as Dialog).destroy();
	}

	public onOpenGitHub(): void {
		openUrl(GITHUB_URL);
	}

	public onOpenLinkedIn(): void {
		openUrl(LINKEDIN_URL);
	}

	// -----------------------------------------------------------------------------------------
	// Implementation
	// -----------------------------------------------------------------------------------------

	private async initialize(): Promise<void> {
		try {
			this.standardTransactions = await this.loadStandardTransactions();
			await this.openDatabase();
			await this.refresh();
		} catch (error) {
			this.showError("loadFailed", error);
		} finally {
			this.viewModel.setProperty("/busy", false);
		}
		this.focusSearch();
		await this.showWelcomeDialog();
	}

	private async loadStandardTransactions(): Promise<Transaction[]> {
		const model = this.getOwnerComponent().getModel("standardTransactions") as JSONModel;
		await model.dataLoaded();
		const data: unknown = model.getData();
		if (!Array.isArray(data)) {
			throw new Error("The standard transactions could not be loaded");
		}
		return data as Transaction[];
	}

	private async openDatabase(): Promise<void> {
		try {
			await this.database.open(() => MessageBox.warning(this.getText("databaseBlocked")));
		} catch (error) {
			// The app remains usable without favorites and custom transactions
			Log.error("The database could not be opened", getErrorMessage(error), LOG_COMPONENT);
			MessageBox.warning(this.getText("databaseUnavailable"));
		}
	}

	/**
	 * Reloads the custom transactions and favorites from the database.
	 */
	private async refresh(): Promise<void> {
		let customTransactions: Transaction[] = [];
		let favorites: string[] = [];
		let usage: UsageRecord[] = [];
		if (this.database.isOpen()) {
			[customTransactions, favorites, usage] = await Promise.all([
				this.database.getCustomTransactions(),
				this.database.getFavorites(),
				this.database.getUsage(),
			]);
		}

		const favoriteTcodes = new Set(favorites);
		const lastUsed = new Map(usage.map((record) => [record.tcode, record.lastUsed]));
		const toEntry = (transaction: Transaction, custom: boolean): TransactionEntry => ({
			...transaction,
			custom,
			favorite: favoriteTcodes.has(transaction.tcode),
			lastUsed: lastUsed.get(transaction.tcode),
		});
		this.entries = [
			...this.standardTransactions.map((transaction) => toEntry(transaction, false)),
			...customTransactions
				.map(toCustomTransaction)
				.filter((transaction) => transaction !== undefined)
				.map((transaction) => toEntry(transaction, true)),
		];

		// Selections are remembered by binding path, which may point to another entry now
		this.getTable().removeSelections(true);
		this.viewModel.setProperty("/selectedCount", 0);
		this.transactionModel.setData(this.entries);
		this.applyFilters();
	}

	private applyFilters(): void {
		const { query, selectedGroup } = this.viewModel.getData() as ViewState;
		const filters = [this.createGroupFilter(selectedGroup)];

		const normalizedQuery = normalizeQuery(query);
		if (normalizedQuery) {
			filters.push(
				new Filter({
					filters: SEARCH_FIELDS.map(
						(path) =>
							new Filter({
								path,
								test: (value: unknown) => containsQuery(value, normalizedQuery),
								caseSensitive: true,
							})
					),
					and: false,
				})
			);
		}

		this.getItemsBinding().filter(new Filter({ filters, and: true }), FilterType.Application);
		this.applySorting(selectedGroup === RECENT_GROUP);
		this.updateCounts();
	}

	private createGroupFilter(group: string): Filter {
		if (group === RECENT_GROUP) {
			// Transactions that were not used recently have no value and are filtered out
			return new Filter({ path: "lastUsed", test: (lastUsed: unknown) => typeof lastUsed === "number" });
		}
		const groups = group === ALL_GROUPS ? this.settings.visibleGroups : [group];
		return new Filter({
			path: "tags",
			test: (tags: unknown) => typeof tags === "string" && isInAnyGroup(tags, groups),
			caseSensitive: true,
		});
	}

	/**
	 * Sorts recently used transactions by the time of use, all others alphabetically with the favorites first.
	 */
	private applySorting(byRecency: boolean): void {
		if (this.sortedByRecency === byRecency) {
			return;
		}
		this.sortedByRecency = byRecency;
		this.getItemsBinding().sort(
			byRecency ? [new Sorter("lastUsed", true)] : [new Sorter("favorite", true), new Sorter("tcode")]
		);
	}

	private updateCounts(): void {
		const { query } = this.viewModel.getData() as ViewState;
		this.viewModel.setProperty("/counts", countByGroup(this.entries, query, this.settings.visibleGroups));
	}

	/**
	 * Remembers the use of a transaction for the list of recently used transactions.
	 */
	private async recordUsage(tcode: string): Promise<void> {
		if (!this.database.isOpen()) {
			return;
		}
		try {
			await this.database.recordUsage(tcode);
			await this.updateUsage();
		} catch (error) {
			// The list is a convenience, the transaction was copied or opened anyway
			Log.warning("The usage could not be recorded", getErrorMessage(error), LOG_COMPONENT);
		}
	}

	private async updateUsage(): Promise<void> {
		const usage = await this.database.getUsage();
		const lastUsed = new Map(usage.map((record) => [record.tcode, record.lastUsed]));
		this.entries.forEach((entry) => (entry.lastUsed = lastUsed.get(entry.tcode)));
		// Forces the table to filter and sort again
		this.transactionModel.refresh(true);
		this.updateCounts();
	}

	private async copyOrOpen(tcode: string): Promise<void> {
		const { copyOption, sapSystemUrl, resetSearchAfterCopy } = this.settings;

		if (copyOption === CopyOption.WebGui) {
			if (sapSystemUrl) {
				openUrl(buildWebGuiUrl(sapSystemUrl, tcode));
				void this.recordUsage(tcode);
			} else {
				MessageToast.show(this.getText("systemUrlMissing"));
			}
			return;
		}

		const text = buildCopyText(tcode, copyOption, this.shiftKeyPressed);
		try {
			await copyToClipboard(text);
		} catch (error) {
			Log.warning("Copying to the clipboard failed", getErrorMessage(error), LOG_COMPONENT);
			MessageToast.show(this.getText("copyFailed", [text]));
			return;
		}
		MessageToast.show(this.getText("transactionCopied", [text]));
		void this.recordUsage(tcode);

		if (resetSearchAfterCopy) {
			this.resetSearch();
		}
		this.focusSearch();
	}

	private resetSearch(): void {
		this.viewModel.setProperty("/query", "");
		this.viewModel.setProperty("/selectedGroup", ALL_GROUPS);
		this.viewModel.setProperty("/selectedCount", 0);
		this.applyFilters();
	}

	private async saveTransaction(): Promise<void> {
		const model = this.getTransactionFormModel();
		const form = this.getTransactionForm();
		const title = form.title.trim();
		const description = form.description.trim();
		const tcode = normalizeTcode(form.tcode);

		if (form.mode === "add") {
			const errorText = this.validateTcode(tcode);
			if (errorText) {
				model.setProperty("/tcodeState", ValueState.Error);
				model.setProperty("/tcodeStateText", errorText);
				(this.byId("transactionCodeInput") as Input).focus();
				return;
			}
		}

		try {
			if (form.mode === "add") {
				await this.database.addCustomTransaction({ tcode, title, description, tags: CUSTOM_GROUP });
			} else {
				await this.database.updateCustomTransaction(tcode, { title, description });
			}
		} catch (error) {
			this.showError("transactionSaveFailed", error);
			return;
		}

		(await this.getTransactionDialog()).close();
		MessageToast.show(
			this.getText(form.mode === "add" ? "transactionAdded" : "transactionUpdated", [tcode])
		);
		await this.refresh();
	}

	private validateTcode(tcode: string): string | undefined {
		if (tcode === "") {
			return this.getText("tcodeRequired");
		}
		if (/\s/.test(tcode)) {
			return this.getText("tcodeInvalid");
		}
		if (this.entries.some((entry) => entry.tcode === tcode)) {
			return this.getText("tcodeExists", [tcode]);
		}
		return undefined;
	}

	private async openTransactionDialog(
		form: Omit<TransactionForm, "tcodeState" | "tcodeStateText">
	): Promise<void> {
		const dialog = await this.getTransactionDialog();
		this.getTransactionFormModel().setData({
			...form,
			tcodeState: ValueState.None,
			tcodeStateText: "",
		} satisfies TransactionForm);
		dialog.open();
	}

	private getTransactionDialog(): Promise<Dialog> {
		this.transactionDialog ??= this.loadFragment({
			name: "de.kernich.tcode.view.fragments.TransactionDialog",
		}).then((content) => {
			const dialog = content as Dialog;
			dialog.setModel(new JSONModel(), "dialog");
			return dialog;
		});
		return this.transactionDialog;
	}

	private getTransactionFormModel(): JSONModel {
		return (this.byId("transactionDialog") as Dialog).getModel("dialog") as JSONModel;
	}

	private getTransactionForm(): TransactionForm {
		return this.getTransactionFormModel().getData() as TransactionForm;
	}

	private applySettings(settings: Settings): void {
		this.settings = settings;
		saveSettings(settings);
		this.getOwnerComponent().getThemeManager().setThemeSetting(settings.theme);
		this.updateGroupVisibility();
		this.applyFilters();
		this.focusSearch();
	}

	private updateGroupVisibility(): void {
		const groupVisible = Object.fromEntries(
			GROUPS.map((group) => [group, this.settings.visibleGroups.includes(group)])
		);
		this.viewModel.setProperty("/groupVisible", groupVisible);

		const selectedGroup = this.viewModel.getProperty("/selectedGroup") as string;
		if (selectedGroup !== ALL_GROUPS && !groupVisible[selectedGroup]) {
			this.viewModel.setProperty("/selectedGroup", ALL_GROUPS);
			this.viewModel.setProperty("/selectedCount", 0);
		}
	}

	private async exportData(): Promise<void> {
		const [customTransactions, favorites] = this.database.isOpen()
			? await Promise.all([this.database.getCustomTransactions(), this.database.getFavorites()])
			: [[], []];
		const data = createExportData(this.settings, customTransactions, favorites);
		FileUtil.save(JSON.stringify(data, null, 2), "tcode-settings", "json", "application/json", "utf-8");
	}

	private async importData(data: ImportData): Promise<void> {
		if (data.customTransactions || data.favorites) {
			await this.database.replaceAll({
				customTransactions: data.customTransactions,
				favorites: data.favorites,
			});
		}
		if (data.settings) {
			this.applySettings(sanitizeSettings(data.settings, this.settings));
		}
		await this.refresh();
	}

	private async showWelcomeDialog(): Promise<void> {
		if (isWelcomeDialogDismissed()) {
			return;
		}
		const dialog = (await this.loadFragment({
			name: "de.kernich.tcode.view.fragments.WelcomeDialog",
		})) as Dialog;
		dialog.open();
	}

	private focusSearch(): void {
		// Avoid opening the on-screen keyboard on touch devices
		if (Device.system.desktop) {
			(this.byId("searchField") as SearchField).focus();
		}
	}

	private updateSelectedCount(): void {
		this.viewModel.setProperty("/selectedCount", this.getTable().getSelectedContexts().length);
	}

	private getEntry(context: Context | null | undefined): TransactionEntry | undefined {
		return context?.getObject() as TransactionEntry | undefined;
	}

	private getTable(): Table {
		return this.byId("transactionTable") as Table;
	}

	private getItemsBinding(): ListBinding {
		return this.getTable().getBinding("items") as ListBinding;
	}

	private showError(textKey: string, error: unknown): void {
		const message = getErrorMessage(error);
		Log.error(this.getText(textKey), message, LOG_COMPONENT);
		MessageBox.error(this.getText(textKey), { details: message });
	}
}
