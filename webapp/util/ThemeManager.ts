import Theming from "sap/ui/core/Theming";
import { ThemeSetting } from "./settings";

const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";

export function resolveTheme(setting: ThemeSetting, prefersDarkScheme: boolean): string {
	const dark =
		setting === ThemeSetting.Dark || (setting === ThemeSetting.System && prefersDarkScheme);
	return dark ? DARK_THEME : LIGHT_THEME;
}

export function isDarkTheme(theme: string): boolean {
	return theme.endsWith("_dark");
}

/**
 * Applies the theme setting of the user and follows the color scheme of the operating system if the
 * setting is {@link ThemeSetting.System}.
 */
export default class ThemeManager {
	private readonly darkSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
	private setting: ThemeSetting = ThemeSetting.System;

	private readonly onSchemeChange = (): void => {
		if (this.setting === ThemeSetting.System) {
			this.applyTheme();
		}
	};

	public constructor() {
		this.darkSchemeQuery.addEventListener("change", this.onSchemeChange);
	}

	public setThemeSetting(setting: ThemeSetting): void {
		this.setting = setting;
		this.applyTheme();
	}

	public destroy(): void {
		this.darkSchemeQuery.removeEventListener("change", this.onSchemeChange);
	}

	private applyTheme(): void {
		Theming.setTheme(resolveTheme(this.setting, this.darkSchemeQuery.matches));
	}
}
