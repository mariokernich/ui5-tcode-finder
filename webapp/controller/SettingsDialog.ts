import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
import Input from "sap/m/Input";
import CheckBox from "sap/m/CheckBox";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Panel from "sap/m/Panel";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import RadioButton from "sap/m/RadioButton";
import RadioButtonGroup from "sap/m/RadioButtonGroup";
import FileUploader from "sap/ui/unified/FileUploader";
import { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Constants from "../Constants";
import { Transaction } from "../util/Database";

export interface ImportData {
	settings?: {
		copyOption?: string;
		sapSystemUrl?: string;
		resetSearchAfterCopy?: string;
		theme?: string;
		visibleGroups?: string[];
	};
	customTransactions?: Transaction[];
	favoriteTransactions?: Transaction[];
}

export interface SettingsDialogOptions {
	onSave: (settings: {
		copyOption: string;
		sapSystemUrl: string;
		resetSearchAfterCopy: boolean;
		visibleGroups: string[];
		theme: string;
	}) => void;
	onImport: (data: ImportData) => Promise<void>;
	onExport: () => Promise<void>;
}

export const COPY_OPTIONS = {
	JUST_COPY: "Just copy T-Code",
	N_PREFIX: "Copy T-Code with /n prefix",
	O_PREFIX: "Copy T-Code with /o prefix",
	DEFAULT:
		"Copy T-Code with /n prefix by default and with /o if shift key is pressed",
	WEB_GUI: "Open in WebGUI",
};

type Action = keyof MessageBox["Action"];

/**
 * @namespace de.kernich.tcode.controller
 */
export default class SettingsDialog {
	private dialog: Dialog;
	private options: SettingsDialogOptions;
	private visibleGroups: string[];
	private sapSystemUrlInput: Input;
	private fileUploader: FileUploader;

	constructor(options: SettingsDialogOptions) {
		this.options = options;
		this.visibleGroups = JSON.parse(
			localStorage.getItem("visibleGroups") || "[]"
		) as string[];
		this.dialog = this.createDialog();
	}

	private createDialog(): Dialog {
		const copyOption =
			localStorage.getItem("copyOption") || COPY_OPTIONS.DEFAULT;
		const sapSystemUrl = localStorage.getItem("sapSystemUrl") || "";
		const resetSearchAfterCopy =
			localStorage.getItem("resetSearchAfterCopy") !== "false";
		const currentTheme = localStorage.getItem("theme") || "System";

		const radioButtonGroup = this.createRadioButtonGroup(copyOption);
		this.sapSystemUrlInput = this.createSapSystemUrlInput(
			sapSystemUrl,
			copyOption
		);
		const checkBoxResetSearch =
			this.createResetSearchCheckBox(resetSearchAfterCopy);
		const themeSelect = this.createThemeSelect(currentTheme);
		const groupSelect = this.createGroupSelect();
		this.fileUploader = this.createFileUploader();

		return new Dialog({
			title: "Settings",
			contentWidth: "550px",
			content: [
				new VBox({
					items: [
						this.createGeneralPanel(themeSelect),
						this.createTransactionBehaviorPanel(
							radioButtonGroup,
							checkBoxResetSearch
						),
						this.createVisibleGroupsPanel(groupSelect),
						this.createImportExportPanel(),
					],
				}).addStyleClass("sapUiSmallMargin"),
			],
			beginButton: this.createSaveButton(
				radioButtonGroup,
				checkBoxResetSearch,
				themeSelect
			),
			endButton: this.createCancelButton(),
			draggable: true,
		});
	}

	private createRadioButtonGroup(copyOption: string): RadioButtonGroup {
		return new RadioButtonGroup({
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
				const buttons = event.getSource().getButtons();
				const selectedText = buttons[selectedIndex].getText();
				this.sapSystemUrlInput.setVisible(
					selectedText === COPY_OPTIONS.WEB_GUI
				);
			},
		});
	}

	private createSapSystemUrlInput(
		sapSystemUrl: string,
		copyOption: string
	): Input {
		return new Input({
			width: "100%",
			placeholder:
				"Enter base SAP System URL like https://example.com:50000...",
			value: sapSystemUrl,
			visible: copyOption === COPY_OPTIONS.WEB_GUI,
		});
	}

	private createResetSearchCheckBox(resetSearchAfterCopy: boolean): CheckBox {
		return new CheckBox({
			text: "Reset search after copy",
			selected: resetSearchAfterCopy,
		}).addStyleClass("sapUiSmallMarginTop");
	}

	private createThemeSelect(currentTheme: string): Select {
		return new Select({
			selectedKey: currentTheme,
			items: [
				new Item({ key: "Light", text: "Light" }),
				new Item({ key: "Dark", text: "Dark" }),
				new Item({ key: "System", text: "System" }),
			],
		});
	}

	private createGroupSelect(): VBox {
		return new VBox({
			items: Constants.TCODE_GROUPS.map(
				(group) =>
					new CheckBox({
						text: group,
						selected: this.visibleGroups.includes(group),
						select: (event) => {
							const selected = event.getParameter("selected");
							if (selected) {
								this.visibleGroups.push(group);
							} else {
								const index = this.visibleGroups.indexOf(group);
								if (index > -1) {
									this.visibleGroups.splice(index, 1);
								}
							}
						},
					})
			),
		});
	}

	private createFileUploader(): FileUploader {
		return new FileUploader({
			fileType: ["json"],
			buttonOnly: true,
			buttonText: "Import Settings",
			icon: "sap-icon://upload",
			uploadOnChange: true,
			change: (event: FileUploader$ChangeEvent) => {
				const file = event.getParameter("files")[0];
				if (file) {
					const reader = new FileReader();
					reader.onload = (e) => {
						try {
							const data = JSON.parse(e.target?.result as string) as ImportData;

							if (!this.validateImportData(data)) {
								MessageBox.error("Invalid settings file format");
								return;
							}

							MessageBox.confirm(
								"Are you sure you want to import these settings? This will overwrite all your current settings.",
								{
									actions: [MessageBox.Action.YES, MessageBox.Action.NO],
									onClose: (action: Action) => {
										if (action === MessageBox.Action.YES) {
											this.options
												.onImport(data)
												.then(() => {
													this.dialog.close();
													this.dialog.destroy();
													MessageToast.show("Settings imported successfully");
												})
												.catch((error: Error) => {
													MessageBox.error(
														`Failed to import settings: ${error.message}`
													);
												});
										}
									},
								}
							);
						} catch {
							MessageBox.error("Invalid JSON file");
						}
					};
					reader.onerror = () => {
						MessageBox.error("Failed to read the file");
					};
					reader.readAsText(file as Blob);
				}
			},
			uploadComplete: () => {
				this.fileUploader.setValue("");
			},
		});
	}

	private createGeneralPanel(themeSelect: Select): Panel {
		return new Panel({
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
		});
	}

	private createTransactionBehaviorPanel(
		radioButtonGroup: RadioButtonGroup,
		checkBoxResetSearch: CheckBox
	): Panel {
		return new Panel({
			headerText: "Transaction click behavior",
			expandable: true,
			expanded: false,
			content: [
				new VBox({
					items: [
						new Label({
							text: "Choose what happens when you click on a transaction:",
						}),
						radioButtonGroup,
						this.sapSystemUrlInput,
						checkBoxResetSearch,
					],
				}),
			],
		});
	}

	private createVisibleGroupsPanel(groupSelect: VBox): Panel {
		return new Panel({
			headerText: "Visible Groups",
			expandable: true,
			expanded: false,
			content: [groupSelect],
		});
	}

	private createImportExportPanel(): Panel {
		return new Panel({
			headerText: "Import/Export",
			expandable: true,
			expanded: false,
			content: [
				new VBox({
					items: [
						new HBox({
							items: [
								new Button({
									text: "Export Settings",
									icon: "sap-icon://download",
									press: () => void this.options.onExport(),
								}).addStyleClass("sapUiSmallMarginEnd"),
								this.fileUploader,
							],
						}),
					],
				}),
			],
		});
	}

	private createSaveButton(
		radioButtonGroup: RadioButtonGroup,
		checkBoxResetSearch: CheckBox,
		themeSelect: Select
	): Button {
		return new Button({
			text: "Save",
			icon: "sap-icon://save",
			press: () => {
				const selectedIndex = radioButtonGroup.getSelectedIndex();
				const buttons = radioButtonGroup.getButtons();
				const selectedText = buttons[selectedIndex].getText();

				this.options.onSave({
					copyOption: selectedText,
					sapSystemUrl: this.sapSystemUrlInput.getValue(),
					resetSearchAfterCopy: checkBoxResetSearch.getSelected(),
					visibleGroups: this.visibleGroups,
					theme: themeSelect.getSelectedKey(),
				});

				this.dialog.close();
				this.dialog.destroy();
				MessageToast.show("Settings saved.");
			},
		});
	}

	private createCancelButton(): Button {
		return new Button({
			text: "Cancel",
			icon: "sap-icon://decline",
			press: () => {
				this.dialog.close();
				this.dialog.destroy();
			},
		});
	}

	private validateImportData(data: ImportData): boolean {
		if (data.settings) {
			const requiredSettings = ["copyOption", "theme", "visibleGroups"];
			if (!requiredSettings.every((setting) => setting in data.settings)) {
				return false;
			}
			if (
				data.settings.visibleGroups &&
				!Array.isArray(data.settings.visibleGroups)
			) {
				return false;
			}
		}

		if (data.customTransactions) {
			if (!Array.isArray(data.customTransactions)) {
				return false;
			}
			if (
				!data.customTransactions.every(
					(t) =>
						typeof t.tcode === "string" &&
						typeof t.title === "string" &&
						typeof t.description === "string"
				)
			) {
				return false;
			}
		}

		if (data.favoriteTransactions) {
			if (!Array.isArray(data.favoriteTransactions)) {
				return false;
			}
			if (
				!data.favoriteTransactions.every((t) => typeof t.tcode === "string")
			) {
				return false;
			}
		}

		return true;
	}

	public open(): void {
		this.dialog.open();
	}
}
