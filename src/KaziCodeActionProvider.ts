import * as vscode from 'vscode';

export const KAZI_PIN_COMMAND_ID = 'kaziflow.createItemFromPin';
export const KAZI_PIN_TEXT = '//:kazi'; 

export class KaziCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        const actions: vscode.CodeAction[] = [];
        for (let i = range.start.line; i <= range.end.line; i++) {
            const line = document.lineAt(i);
            const kaziPinIndex = line.text.indexOf(KAZI_PIN_TEXT);
            if (kaziPinIndex !== -1) {
                const pinLocationRange = new vscode.Range(
                    new vscode.Position(line.lineNumber, kaziPinIndex),
                    new vscode.Position(line.lineNumber, kaziPinIndex + KAZI_PIN_TEXT.length)
                );
                if (pinLocationRange.intersection(range) || (range.isEmpty && range.start.line === line.lineNumber)) {
                    const title = 'KaziFlow: Create item/task from pin...';
                    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                    action.command = {
                        command: KAZI_PIN_COMMAND_ID,
                        title: title,
                        tooltip: 'Create a new KaziFlow feature, bug, or task linked to this line.',
                        arguments: [document.uri, pinLocationRange]
                    };
                    actions.push(action);
                    break; 
                }
            }
        }
        return actions;
    }
}