import * as vscode from "vscode";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Proofreader logic
// ---------------------------------------------------------------------------

function proofread(text: string): string {
  if (text.trim().length === 0) {
    return "文章が空です。";
  }

  const suggestions: string[] = [];

  if (text.trim().length < 10) {
    suggestions.push("文章が短すぎる可能性があります。");
  }

  if (!/[。！？]$/.test(text.trim())) {
    suggestions.push("文末に句点（。）または感嘆符（！／？）を付けることを検討してください。");
  }

  if (suggestions.length === 0) {
    return "問題は見つかりませんでした。";
  }

  return suggestions.join("\n");
}

// ---------------------------------------------------------------------------
// WebviewPanel
// ---------------------------------------------------------------------------

class ProofreaderPanel {
  private static _current: ProofreaderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): void {
    if (ProofreaderPanel._current) {
      ProofreaderPanel._current._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("jpProofreader", "JP Proofreader", vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "webview")],
    });
    ProofreaderPanel._current = new ProofreaderPanel(panel, context);
  }

  constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.webview.html = this._buildHtml(panel.webview, context);

    this._panel.webview.onDidReceiveMessage(
      (msg: { type: string; text: string }) => {
        if (msg.type === "review") {
          const result = proofread(msg.text);
          void panel.webview.postMessage({ type: "reviewResult", result });
        }
      },
      undefined,
      this._disposables,
    );

    this._panel.onDidDispose(() => this._disposePanel(), undefined, this._disposables);
  }

  private _buildHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "dashboard.js"),
    );
    const nonce = crypto.randomBytes(16).toString("hex");
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}';">
  <title>JP Proofreader</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex;
      height: 100vh;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    .pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 16px;
      gap: 8px;
      overflow: hidden;
    }
    .pane + .pane {
      border-left: 1px solid var(--vscode-panel-border, #444);
    }
    h2 {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.7;
      flex-shrink: 0;
    }
    #input-text {
      flex: 1;
      width: 100%;
      resize: none;
      background: var(--vscode-input-background, #1e1e1e);
      color: var(--vscode-input-foreground, #d4d4d4);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: 4px;
      padding: 10px;
      font-family: inherit;
      font-size: inherit;
      line-height: 1.6;
      outline: none;
    }
    #input-text:focus {
      border-color: var(--vscode-focusBorder, #007fd4);
    }
    #btn-review {
      flex-shrink: 0;
      padding: 8px 16px;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 600;
    }
    #btn-review:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    #btn-review:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #review-result {
      flex: 1;
      overflow-y: auto;
      white-space: pre-wrap;
      padding: 10px;
      background: var(--vscode-input-background, #1e1e1e);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: 4px;
      line-height: 1.6;
      font-size: 12px;
    }
    #review-result:empty::before {
      content: "レビュー結果がここに表示されます";
      opacity: 0.4;
    }
  </style>
</head>
<body>
  <div class="pane">
    <h2>テキスト入力</h2>
    <textarea id="input-text" placeholder="校閲したいテキストを入力してください…"></textarea>
  </div>
  <div class="pane">
    <h2>AIレビュー</h2>
    <button id="btn-review">AIレビュー</button>
    <div id="review-result"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _disposePanel(): void {
    ProofreaderPanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Sidebar WebviewViewProvider (activity bar icon)
// ---------------------------------------------------------------------------

class ProofreaderViewProvider implements vscode.WebviewViewProvider {
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

// ---------------------------------------------------------------------------
// Extension entry points
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // Sidebar view (activity bar icon → WebviewView)
  const viewProvider = new ProofreaderViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("jp-proofreader-view", viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Command: open the panel in the editor area (horizontal layout)
  context.subscriptions.push(
    vscode.commands.registerCommand("jp-proofreader.check", () => {
      ProofreaderPanel.createOrShow(context);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
