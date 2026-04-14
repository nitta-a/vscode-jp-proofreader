import * as vscode from "vscode";
import * as crypto from "node:crypto";
import { ProofreaderPanel } from "./proofreaderPanel.js";

/**
 * Activity bar sidebar provider.
 * Renders a single button that opens the main ProofreaderPanel in the editor area.
 */
export class ProofreaderViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._buildHtml();

    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      if (msg.type === "openPanel") {
        ProofreaderPanel.createOrShow(this._context);
      }
    });
  }

  private _buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}';">
  <style>
    body {
      padding: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
    }
    button {
      width: 100%;
      padding: 8px 12px;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 600;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
  </style>
</head>
<body>
  <button id="btn-open">JP Proofreaderを開く</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-open').addEventListener('click', () => {
      vscode.postMessage({ type: 'openPanel' });
    });
  </script>
</body>
</html>`;
  }
}
