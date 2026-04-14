import * as vscode from "vscode";
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY } from "./constants.js";
import { ProofreaderPanel } from "./proofreaderPanel.js";
import { ProofreaderViewProvider } from "./viewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
  // Sidebar view (activity bar icon → WebviewView)
  const viewProvider = new ProofreaderViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("jp-proofreader-view", viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Command: open the panel in the editor area
  context.subscriptions.push(
    vscode.commands.registerCommand("jp-proofreader.check", () => {
      ProofreaderPanel.createOrShow(context);
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
