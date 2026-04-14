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
      (msg: { type: string; text?: string; modelId?: string }) => {
        if (msg.type === "requestModels") {
          void this._sendModels();
        } else if (msg.type === "review" && msg.text && msg.modelId) {
          void this._runReview(msg.text, msg.modelId);
        }
      },
      undefined,
      this._disposables,
    );

    this._panel.onDidDispose(() => this._disposePanel(), undefined, this._disposables);
  }

  private async _sendModels(): Promise<void> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
      const modelInfos = models.map((m) => ({ id: m.id, name: `${m.name} (${m.family})` }));
      // mini モデルを先頭に（gpt-4o-mini / gpt-5-mini 等を優先）
      modelInfos.sort((a, b) => {
        const aIsMini = a.name.toLowerCase().includes("mini");
        const bIsMini = b.name.toLowerCase().includes("mini");
        if (aIsMini && !bIsMini) {
          return -1;
        }
        if (!aIsMini && bIsMini) {
          return 1;
        }
        return 0;
      });
      void this._panel.webview.postMessage({ type: "models", models: modelInfos });
    } catch {
      void this._panel.webview.postMessage({ type: "models", models: [] });
    }
  }

  private async _runReview(text: string, modelId: string): Promise<void> {
    const tokenSource = new vscode.CancellationTokenSource();
    this._disposables.push(tokenSource);
    try {
      const [model] = await vscode.lm.selectChatModels({ id: modelId });
      if (!model) {
        void this._panel.webview.postMessage({
          type: "reviewError",
          message: "指定されたモデルが見つかりません。Copilot が有効か確認してください。",
        });
        return;
      }
      const prompt = [
        "以下の日本語テキストを校閲してください。",
        "文法的な誤り、表現の不自然さ、誤字脱字、冗長な表現などを指摘し、改善案を提示してください。",
        "",
        `テキスト:\n${text}`,
      ].join("\n");
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const response = await model.sendRequest(messages, {}, tokenSource.token);
      for await (const chunk of response.text) {
        void this._panel.webview.postMessage({ type: "reviewChunk", chunk });
      }
      void this._panel.webview.postMessage({ type: "reviewDone" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void this._panel.webview.postMessage({ type: "reviewError", message });
    }
  }

  private _buildHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "dashboard.js"),
    );
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "dashboard.css"));
    // Base path for Shoelace icons/assets (dist/webview/ directory)
    const slBase = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview")).toString();
    const nonce = crypto.randomBytes(16).toString("hex");
    const csp = webview.cspSource;
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${csp} 'unsafe-inline'; img-src ${csp} data: blob:; font-src ${csp};">
  <meta name="sl-base" content="${slBase}">
  <link rel="stylesheet" href="${cssUri}">
  <title>JP Proofreader</title>
  <style>
    html, body { height: 100%; margin: 0; padding: 0; background: var(--vscode-editor-background); }
    jp-proofreader-app { display: block; height: 100%; }
  </style>
</head>
<body class="sl-theme-dark">
  <jp-proofreader-app></jp-proofreader-app>
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
