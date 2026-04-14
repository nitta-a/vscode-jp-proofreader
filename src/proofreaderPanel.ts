import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY } from "./constants.js";

/**
 * Singleton WebviewPanel that hosts the JP Proofreader UI.
 * Manages Copilot LM API calls and relays results to the webview via postMessage.
 */
export class ProofreaderPanel {
  private static _current: ProofreaderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
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
    this._context = context;
    this._panel.webview.html = this._buildHtml(panel.webview, context);

    this._panel.webview.onDidReceiveMessage(
      (msg: { type: string; text?: string; modelId?: string; systemPrompt?: string; url?: string }) => {
        if (msg.type === "requestModels") {
          void this._sendModels();
        } else if (msg.type === "review" && msg.text && msg.modelId) {
          void this._runReview(msg.text, msg.modelId);
        } else if (msg.type === "getSettings") {
          this._sendSettings();
        } else if (msg.type === "setSettings" && typeof msg.systemPrompt === "string") {
          void this._context.globalState.update(SYSTEM_PROMPT_KEY, msg.systemPrompt);
          this._sendSettings();
        } else if (msg.type === "fetchUrl" && typeof msg.url === "string") {
          void this._fetchUrl(msg.url);
        }
      },
      undefined,
      this._disposables,
    );

    this._panel.onDidDispose(() => this._disposePanel(), undefined, this._disposables);
  }

  private _sendSettings(): void {
    const stored = this._context.globalState.get<string>(SYSTEM_PROMPT_KEY);
    void this._panel.webview.postMessage({
      type: "settings",
      systemPrompt: stored ?? DEFAULT_SYSTEM_PROMPT,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    });
  }

  private async _sendModels(): Promise<void> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
      const modelInfos = models.map((m) => ({ id: m.id, name: `${m.name} (${m.family})` }));
      // モデル名のアルファベット順にソート
      modelInfos.sort((a, b) => a.name.localeCompare(b.name));
      void this._panel.webview.postMessage({ type: "models", models: modelInfos });
    } catch {
      void this._panel.webview.postMessage({ type: "models", models: [] });
    }
  }

  private _fetchUrl(rawUrl: string): Promise<void> {
    return new Promise((resolve) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        void this._panel.webview.postMessage({ type: "urlError", message: "無効なURLです。" });
        resolve();
        return;
      }
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        void this._panel.webview.postMessage({ type: "urlError", message: "http/https のURLのみ対応しています。" });
        resolve();
        return;
      }
      const client = parsedUrl.protocol === "https:" ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: { "User-Agent": "vscode-jp-proofreader/1.0" },
      };
      const req = client.request(options, (res) => {
        // リダイレクト対応 (最大5回)
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
          res.headers.location
        ) {
          req.destroy();
          void this._fetchUrl(res.headers.location).then(resolve);
          return;
        }
        if (res.statusCode !== undefined && (res.statusCode < 200 || res.statusCode >= 300)) {
          void this._panel.webview.postMessage({ type: "urlError", message: `HTTPエラー: ${res.statusCode}` });
          resolve();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf-8");
          const text = this._htmlToText(html);
          void this._panel.webview.postMessage({ type: "urlContent", text });
          resolve();
        });
        res.on("error", (err: Error) => {
          void this._panel.webview.postMessage({ type: "urlError", message: `取得エラー: ${err.message}` });
          resolve();
        });
      });
      req.on("error", (err: Error) => {
        void this._panel.webview.postMessage({ type: "urlError", message: `接続エラー: ${err.message}` });
        resolve();
      });
      req.end();
    });
  }

  /** HTML文字列からプレーンテキストを抽出する */
  private _htmlToText(html: string): string {
    // script/style/head タグごと除去
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<head[\s\S]*?<\/head>/gi, "");
    // ブロック要素の前後に改行を挿入
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|article|section)[^>]*>/gi, "\n");
    // 残りのHTMLタグを除去
    text = text.replace(/<[^>]+>/g, "");
    // HTMLエンティティをデコード
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    // 空白のみ・改行のみの行を削除
    text = text.replace(/^[ \t\u3000]*$/gm, "");
    // 3個以上連続する半角・全角スペースを1つに圧縮
    text = text.replace(/[ \u3000]{3,}/g, " ");
    // 3回以上連続する改行を2つに圧縮
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
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
      const systemPrompt = this._context.globalState.get<string>(SYSTEM_PROMPT_KEY) ?? DEFAULT_SYSTEM_PROMPT;
      const prompt = `${systemPrompt}\n\nテキスト:\n${text}`;
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
