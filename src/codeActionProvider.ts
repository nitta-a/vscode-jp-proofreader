import * as vscode from "vscode";
import { DIAGNOSTIC_SOURCE } from "./constants.js";

/**
 * Provides quick-fix code actions for diagnostics created by the JP Proofreader extension.
 * When a diagnostic has a non-empty replacementText stored in its `code` property,
 * a QuickFix action is offered that replaces the flagged range with the suggested text.
 */
export class ProofreaderCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE) {
        continue;
      }
      const replacementText = typeof diagnostic.code === "string" ? diagnostic.code : undefined;
      if (!replacementText) {
        continue;
      }
      const action = new vscode.CodeAction(`修正を適用: "${replacementText}"`, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, diagnostic.range, replacementText);
      action.edit = edit;
      actions.push(action);
    }
    return actions;
  }
}
