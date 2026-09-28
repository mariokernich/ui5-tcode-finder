import MessageBox from "sap/m/MessageBox";

export type MessageBoxAction = (typeof MessageBox.Action)[keyof typeof MessageBox.Action];

/**
 * Asks the user to confirm an action. Resolves with `true` if the given action was chosen.
 */
export function confirmAction(message: string, action: MessageBoxAction): Promise<boolean> {
	return new Promise((resolve) => {
		MessageBox.confirm(message, {
			actions: [action, MessageBox.Action.CANCEL],
			emphasizedAction: action,
			onClose: (chosenAction: string | null) => resolve(chosenAction === (action as string)),
		});
	});
}

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
