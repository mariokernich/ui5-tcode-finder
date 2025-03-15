import ManagedObject from "sap/ui/base/ManagedObject";
import Theming from "sap/ui/core/Theming";

/**
 * @namespace de.kernich.tcode.util
 */
export default class DarkModeHelper extends ManagedObject {
	public static getCurrentThemeId(): string {
		const themeId = Theming.getTheme();

		return themeId;
	}

	public static isDarkMode(): boolean {
		const themeId = DarkModeHelper.getCurrentThemeId();

		return themeId.endsWith("_dark");
	}

	public static toggleTheme(): void {
		const isDarkMode = DarkModeHelper.isDarkMode();

		if (isDarkMode) {
			DarkModeHelper.toLight();
		} else {
			DarkModeHelper.toDark();
		}
	}

	public static toDark() {
		const themeRootId = DarkModeHelper.getRootThemeName();

		Theming.setTheme(`${themeRootId}_dark`);
	}

	public static toLight() {
		const themeRootId = DarkModeHelper.getRootThemeName();

		Theming.setTheme(themeRootId);
	}

	public static getRootThemeName(): string {
		const themeId = DarkModeHelper.getCurrentThemeId();

		if (themeId.endsWith("_dark")) {
			return themeId.slice(0, -5);
		}

		return themeId;
	}
}
