import Button from "sap/m/Button";
import CheckBox from "sap/m/CheckBox";
import Dialog from "sap/m/Dialog";
import FormattedText from "sap/m/FormattedText";
import VBox from "sap/m/VBox";
import UI5Element from "sap/ui/core/Element";

/**
 * @namespace de.kernich.tcode.util
 */
export default class DialogManager extends UI5Element {
	static showWelcome() {
		const checkBox = new CheckBox({
			text: "Do not show again",
			selected: false,
		});

		const dialog = new Dialog({
			title: "Welcome to T-Code Quick Finder! 🎉",
			contentWidth: "500px",
			content: new VBox({
				items: [
					new FormattedText({
						htmlText: `
							<p>Welcome to <strong>T-Code Quick Finder</strong>, your ultimate tool for managing SAP T-Codes efficiently. This application is designed to help you quickly find, copy, and manage transaction codes (T-Codes).</p>
							<p>Here are some key features:</p>
							<ul>
								<li><strong>Search:</strong> Use the search bar to find T-Codes by code, title, or description.</li>
								<li><strong>Copy:</strong> Click on a T-Code to copy it to your clipboard. You can also choose to copy with a /n prefix which can be configured in settings.</li>
								<li><strong>Favorites:</strong> Mark T-Codes as favorites for quick access.</li>
								<li><strong>Custom T-Codes:</strong> Add, edit, and delete your own custom T-Codes in the CUSTOM group. Right click a cell to edit existing ones.</li>
								<li><strong>Settings:</strong> Customize your experience with options like theme selection and search reset behavior.</li>
							</ul>
							<p>Enjoy your development journey! 🌟</p>
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

		dialog.open();
	}
}
