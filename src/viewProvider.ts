import * as crypto from "node:crypto";
import * as vscode from "vscode";

/**
 * WebviewViewProvider for the JP Proofreader sidebar.
 * Provides a quick editor for project-specific custom rules / glossary.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "jp-proofreader-view";

  private _view: vscode.WebviewView | undefined;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview")],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg: { type: string; rules?: string; command?: string }) => {
        if (msg.type === "getSidebarData") {
          const customRules = vscode.workspace.getConfiguration("vscode-jp-proofreader").get<string>("customRules", "");
          void webviewView.webview.postMessage({ type: "sidebarData", customRules });
        } else if (msg.type === "updateCustomRules" && typeof msg.rules === "string") {
          const target = vscode.workspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
          void vscode.workspace.getConfiguration("vscode-jp-proofreader").update("customRules", msg.rules, target);
        } else if (msg.type === "executeCommand" && typeof msg.command === "string") {
          void vscode.commands.executeCommand(msg.command);
        }
      },
      undefined,
      this._context.subscriptions,
    );

    // Refresh the sidebar data when the configuration changes externally
    // (e.g., the user edits the setting via the main panel or settings UI).
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration("vscode-jp-proofreader.customRules") && this._view?.visible) {
          const customRules = vscode.workspace.getConfiguration("vscode-jp-proofreader").get<string>("customRules", "");
          void this._view.webview.postMessage({ type: "sidebarData", customRules });
        }
      },
      undefined,
      this._context.subscriptions,
    );
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview", "sidebar.js"),
    );
    const slBase = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview")).toString();
    const nonce = crypto.randomBytes(16).toString("hex");
    const csp = webview.cspSource;
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${csp} 'unsafe-inline'; img-src ${csp} data: blob:; font-src ${csp}; connect-src ${csp};">
  <meta name="sl-base" content="${slBase}">
  <title>JP Proofreader Sidebar</title>
  <style>
    html, body { height: 100%; margin: 0; padding: 0; background: var(--vscode-sideBar-background); color: var(--vscode-foreground); }
    jp-sidebar-app { display: block; height: 100%; }
  </style>
</head>
<body>
  <jp-sidebar-app></jp-sidebar-app>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
