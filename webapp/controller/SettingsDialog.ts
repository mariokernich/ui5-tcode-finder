import type Dialog from "sap/m/Dialog";
import type Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type Panel from "sap/m/Panel";
import type { RadioButtonGroup$SelectEvent } from "sap/m/RadioButtonGroup";
import Fragment from "sap/ui/core/Fragment";
import { ValueState } from "sap/ui/core/library";
import type View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import type { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import { GROUPS, type Group } from "../Constants";
import { confirmAction, getErrorMessage } from "../util/messages";
import {
	COPY_OPTIONS,
	CopyOption,
	DEFAULT_SETTINGS,
	ImportError,
	isValidSystemUrl,
	parseImportData,
	parseSystemUrl,
	parseTheme,
	type ImportData,
	type Settings,
} from "../util/settings";

export interface SettingsDialogHandlers {
	getText(key: string, args?: unknown[]): string;
	save(settings: Settings): void;
	export(): Promise<void>;
	import(data: ImportData): Promise<void>;
}

interface SettingsForm {
	theme: string;
	copyOptionIndex: number;
	webGuiSelected: boolean;
	sapSystemUrl: string;
	sapSystemUrlState: ValueState;
	sapSystemUrlStateText: string;
	resetSearchAfterCopy: boolean;
	groups: { key: Group; text: string; visible: boolean }[];
}

/**
 * Dialog to edit the settings and to import or export them. The dialog is created on first use
 * and reused afterwards.
 */
export default class SettingsDialog {
	private readonly view: View;
	private readonly handlers: SettingsDialogHandlers;
	private readonly model = new JSONModel();
	private dialog?: Promise<Dialog>;

	public constructor(view: View, handlers: SettingsDialogHandlers) {
		this.view = view;
		this.handlers = handlers;
	}

	public async open(settings: Settings): Promise<void> {
		this.model.setData(this.toForm(settings));
		(await this.getDialog()).open();
	}

	public destroy(): void {
		void this.dialog?.then((dialog) => dialog.destroy());
		this.dialog = undefined;
		this.model.destroy();
	}

	public onCopyOptionSelect(event: RadioButtonGroup$SelectEvent): void {
		const copyOption = COPY_OPTIONS[event.getParameter("selectedIndex") ?? -1];
		this.model.setProperty("/webGuiSelected", copyOption === CopyOption.WebGui);
	}

	public onSystemUrlChange(): void {
		this.model.setProperty("/sapSystemUrlState", ValueState.None);
	}

	public onSave(): void {
		const form = this.model.getData() as SettingsForm;
		const copyOption = COPY_OPTIONS[form.copyOptionIndex] ?? DEFAULT_SETTINGS.copyOption;
		const sapSystemUrl = form.sapSystemUrl.trim();

		if (copyOption === CopyOption.WebGui && !isValidSystemUrl(sapSystemUrl)) {
			this.showSystemUrlError(sapSystemUrl === "" ? "settingsSystemUrlRequired" : "settingsSystemUrlInvalid");
			return;
		}

		this.handlers.save({
			copyOption,
			sapSystemUrl: parseSystemUrl(sapSystemUrl) ?? "",
			resetSearchAfterCopy: form.resetSearchAfterCopy,
			theme: parseTheme(form.theme) ?? DEFAULT_SETTINGS.theme,
			visibleGroups: form.groups.filter((group) => group.visible).map((group) => group.key),
		});
		void this.close();
		MessageToast.show(this.getText("settingsSaved"));
	}

	public onCancel(): void {
		void this.close();
	}

	public async onExport(): Promise<void> {
		try {
			await this.handlers.export();
			MessageToast.show(this.getText("exportSuccess"));
		} catch (error) {
			MessageBox.error(this.getText("exportFailed"), { details: getErrorMessage(error) });
		}
	}

	public async onImportFileChange(event: FileUploader$ChangeEvent): Promise<void> {
		const fileUploader = event.getSource();
		const file = (event.getParameter("files") as File[] | undefined)?.[0];
		if (!file) {
			return;
		}

		try {
			let data: ImportData;
			try {
				data = parseImportData(JSON.parse(await file.text()));
			} catch (error) {
				const invalidFile = error instanceof SyntaxError || error instanceof ImportError;
				MessageBox.error(this.getText(invalidFile ? "importInvalidFile" : "importFailed"), {
					details: getErrorMessage(error),
				});
				return;
			}

			if (!(await confirmAction(this.getText("importConfirm"), MessageBox.Action.OK))) {
				return;
			}

			try {
				await this.handlers.import(data);
			} catch (error) {
				MessageBox.error(this.getText("importFailed"), { details: getErrorMessage(error) });
				return;
			}
			await this.close();
			MessageToast.show(this.getText("importSuccess"));
		} finally {
			// Allows selecting the same file again
			fileUploader.clear();
		}
	}

	private getDialog(): Promise<Dialog> {
		this.dialog ??= Fragment.load({
			id: this.view.getId(),
			name: "de.kernich.tcode.view.fragments.SettingsDialog",
			controller: this,
		}).then((content) => {
			const dialog = content as Dialog;
			dialog.setModel(this.model, "settings");
			this.view.addDependent(dialog);
			return dialog;
		});
		return this.dialog;
	}

	private async close(): Promise<void> {
		(await this.getDialog()).close();
	}

	private showSystemUrlError(textKey: string): void {
		this.model.setProperty("/sapSystemUrlState", ValueState.Error);
		this.model.setProperty("/sapSystemUrlStateText", this.getText(textKey));
		(this.view.byId("copyBehaviorPanel") as Panel).setExpanded(true);
		(this.view.byId("sapSystemUrlInput") as Input).focus();
	}

	private toForm(settings: Settings): SettingsForm {
		return {
			theme: settings.theme,
			copyOptionIndex: COPY_OPTIONS.indexOf(settings.copyOption),
			webGuiSelected: settings.copyOption === CopyOption.WebGui,
			sapSystemUrl: settings.sapSystemUrl,
			sapSystemUrlState: ValueState.None,
			sapSystemUrlStateText: "",
			resetSearchAfterCopy: settings.resetSearchAfterCopy,
			groups: GROUPS.map((key) => ({
				key,
				text: this.getText(`group.${key}`),
				visible: settings.visibleGroups.includes(key),
			})),
		};
	}

	private getText(key: string, args?: unknown[]): string {
		return this.handlers.getText(key, args);
	}
}
