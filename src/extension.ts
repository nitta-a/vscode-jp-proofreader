import * as vscode from "vscode";
import { ProofreaderCodeActionProvider } from "./codeActionProvider.js";
import { DEFAULT_SYSTEM_PROMPT, DIAGNOSTIC_SOURCE, SYSTEM_PROMPT_KEY } from "./constants.js";
import { ProofreaderPanel } from "./proofreaderPanel.js";
import { ReviewOutlineProvider } from "./reviewOutlineProvider.js";
import { SidebarViewProvider } from "./viewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
  // DiagnosticCollection for editor wave-underline annotations
  const diagnosticCollection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  context.subscriptions.push(diagnosticCollection);

  // CodeActionProvider for quick-fix replacements
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider("*", new ProofreaderCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );

  // Sidebar WebviewView: custom rules quick editor
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewId, new SidebarViewProvider(context)),
  );

  // Review outline TreeView in the activity bar sidebar
  const reviewOutlineProvider = new ReviewOutlineProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("vscode-jp-proofreader.outlineView", reviewOutlineProvider),
  );

  // Command: jump to the flagged location from a tree item click
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-jp-proofreader.focusFromTree",
      (line: number, targetText?: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          void vscode.window.showInformationMessage(
            "JP Proofreader: 文字列の特定に失敗しました（アクティブなエディタが見つかりません）",
          );
          return;
        }

        // If a targetText is provided, try to find it in the document first.
        if (targetText) {
          const docText = editor.document.getText();
          const index = docText.indexOf(targetText);
          if (index !== -1) {
            const start = editor.document.positionAt(index);
            const end = editor.document.positionAt(index + targetText.length);
            const range = new vscode.Range(start, end);
            void vscode.window.showTextDocument(editor.document, {
              selection: range,
              preserveFocus: false,
              viewColumn: editor.viewColumn,
            });
            return;
          }
        }

        // Fall back to line number.
        if (typeof line === "number" && line > 0) {
          const lineIndex = line - 1;
          if (lineIndex < editor.document.lineCount) {
            const range = editor.document.lineAt(lineIndex).range;
            void vscode.window.showTextDocument(editor.document, {
              selection: range,
              preserveFocus: false,
              viewColumn: editor.viewColumn,
            });
          }
        }
      },
    ),
  );

  // Command: open the panel in the editor area
  context.subscriptions.push(
    vscode.commands.registerCommand("jp-proofreader.check", () => {
      ProofreaderPanel.createOrShow(context, diagnosticCollection, reviewOutlineProvider);
    }),
  );

  // Custom Copilot chat participant
  const participant = vscode.chat.createChatParticipant(
    "jp-proofreader.proofreader",
    async (request, _chatContext, stream, token) => {
      const text = request.prompt.trim();
      if (!text) {
        stream.markdown("校閲したいテキストを入力してください。\n\n例: `@proofreader 本日は晴天なりこちら。`");
        return;
      }
      const systemPrompt = context.globalState.get<string>(SYSTEM_PROMPT_KEY) ?? DEFAULT_SYSTEM_PROMPT;
      const prompt = `${systemPrompt}\n\nテキスト:\n${text}`;
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      try {
        const response = await request.model.sendRequest(messages, {}, token);
        for await (const part of response.stream) {
          if (part instanceof vscode.LanguageModelTextPart) {
            stream.markdown(part.value);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stream.markdown(`エラーが発生しました: ${message}`);
      }
    },
  );
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "images", "icon.svg");
  context.subscriptions.push(participant);
}

export function deactivate(): void {
  ProofreaderPanel.disposeOutputChannel();
}
