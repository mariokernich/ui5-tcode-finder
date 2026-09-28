import UIComponent from "sap/ui/core/UIComponent";
import models from "./model/models";
import ThemeManager from "./util/ThemeManager";
import { loadSettings } from "./util/settings";

/**
 * @namespace de.kernich.tcode
 */
export default class Component extends UIComponent {
	public static metadata = {
		manifest: "json",
		interfaces: ["sap.ui.core.IAsyncContentCreation"],
	};

	private themeManager: ThemeManager;

	public init(): void {
		// Apply the theme before any content is created to avoid a flash of the default theme
		this.themeManager = new ThemeManager();
		this.themeManager.setThemeSetting(loadSettings().theme);

		super.init();

		this.setModel(models.createDeviceModel(), "device");
		this.getRouter().initialize();
	}

	public exit(): void {
		this.themeManager.destroy();
	}

	public getThemeManager(): ThemeManager {
		return this.themeManager;
	}
}
