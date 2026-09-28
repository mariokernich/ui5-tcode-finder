import Controller from "sap/ui/core/mvc/Controller";
import type Model from "sap/ui/model/Model";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import type AppComponent from "../Component";

/**
 * @namespace de.kernich.tcode.controller
 */
export default abstract class BaseController extends Controller {
	/**
	 * Convenience method for accessing the component of the controller's view.
	 */
	public getOwnerComponent(): AppComponent {
		return super.getOwnerComponent() as AppComponent;
	}

	/**
	 * Convenience method for setting a model on the view.
	 */
	public setModel(model: Model, name?: string): this {
		this.getView()?.setModel(model, name);
		return this;
	}

	/**
	 * Returns the i18n resource bundle of the component.
	 */
	public getResourceBundle(): ResourceBundle {
		const model = this.getOwnerComponent().getModel("i18n") as ResourceModel;
		return model.getResourceBundle() as ResourceBundle;
	}

	/**
	 * Returns the translated text for the given key.
	 */
	public getText(key: string, args?: unknown[]): string {
		return this.getResourceBundle().getText(key, args) ?? key;
	}
}
