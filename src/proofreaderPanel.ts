import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import {
  DEFAULT_PROMPT_FILE_NAME,
  DEFAULT_SYSTEM_PROMPT,
  DIAGNOSTIC_SOURCE,
  JSON_CONVERSION_PROMPT,
  SYSTEM_PROMPT_FILE_KEY,
  SYSTEM_PROMPT_KEY,
} from "./constants.js";
import type { ReviewOutlineProvider, ReviewItem } from "./reviewOutlineProvider.js";

/**
 * Singleton WebviewPanel that hosts the JP Proofreader UI.
 * Manages Copilot LM API calls and relays results to the webview via postMessage.
 */
export class ProofreaderPanel {
  private static _current: ProofreaderPanel | undefined;
  private static _outputChannel: vscode.OutputChannel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _diagnosticCollection: vscode.DiagnosticCollection | undefined;
  private readonly _outlineProvider: ReviewOutlineProvider | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  /** Token source for the currently running review — cancelled when a new review starts. */
  private _currentReviewTokenSource: vscode.CancellationTokenSource | undefined;
  /** Last known active text editor — updated each time the active editor changes. */
  private _lastActiveEditor: vscode.TextEditor | undefined;

  /** Write a log line to the output channel when jp-proofreader.enableLogs is true. */
  private _log(message: string): void {
    const enabled = vscode.workspace.getConfiguration("jp-proofreader").get<boolean>("enableLogs", false);
    if (!enabled) {
      return;
    }
    if (!ProofreaderPanel._outputChannel) {
      ProofreaderPanel._outputChannel = vscode.window.createOutputChannel("JP Proofreader");
    }
    ProofreaderPanel._outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  /** Dispose the shared output channel on extension deactivation. */
  static disposeOutputChannel(): void {
    ProofreaderPanel._outputChannel?.dispose();
    ProofreaderPanel._outputChannel = undefined;
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    diagnosticCollection?: vscode.DiagnosticCollection,
    outlineProvider?: ReviewOutlineProvider,
  ): void {
    if (ProofreaderPanel._current) {
      ProofreaderPanel._current._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("jpProofreader", "JP Proofreader", vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "webview")],
    });
    ProofreaderPanel._current = new ProofreaderPanel(panel, context, diagnosticCollection, outlineProvider);
  }

  constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    diagnosticCollection?: vscode.DiagnosticCollection,
    outlineProvider?: ReviewOutlineProvider,
  ) {
    this._panel = panel;
    this._context = context;
    this._diagnosticCollection = diagnosticCollection;
    this._outlineProvider = outlineProvider;
    this._panel.webview.html = this._buildHtml(panel.webview, context);

    // Track the lastactive text editor so focus-item works even after the webview takes focus.
    // Only track file/untitled editors — output channels and other virtual documents must be ignored.
    const isTextEditor = (editor: vscode.TextEditor): boolean => {
      const scheme = editor.document.uri.scheme;
      return scheme === "file" || scheme === "untitled";
    };
    if (vscode.window.activeTextEditor && isTextEditor(vscode.window.activeTextEditor)) {
      this._lastActiveEditor = vscode.window.activeTextEditor;
    }
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor && isTextEditor(editor)) {
          this._lastActiveEditor = editor;
        }
      },
      undefined,
      this._disposables,
    );

    this._panel.webview.onDidReceiveMessage(
      (msg: {
        type: string;
        text?: string;
        modelId?: string;
        systemPrompt?: string;
        url?: string;
        targetText?: string;
        line?: number;
        customRules?: string;
      }) => {
        this._log(`[webview→host] type="${msg.type}"`);
        if (msg.type === "requestModels") {
          void this._sendModels();
        } else if (msg.type === "review" && msg.text && msg.modelId) {
          this._log(`[review] modelId="${msg.modelId}" textLength=${msg.text.length}`);
          // Cancel any in-flight review before starting a new one.
          this._currentReviewTokenSource?.cancel();
          this._currentReviewTokenSource?.dispose();
          this._currentReviewTokenSource = undefined;
          void this._runReview(msg.text, msg.modelId);
        } else if (msg.type === "getSettings") {
          this._sendSettings();
        } else if (msg.type === "setSettings" && typeof msg.systemPrompt === "string") {
          void this._context.globalState.update(SYSTEM_PROMPT_KEY, msg.systemPrompt);
          this._sendSettings();
        } else if (msg.type === "updateSettings" && typeof msg.customRules === "string") {
          const target = vscode.workspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
          void vscode.workspace
            .getConfiguration("vscode-jp-proofreader")
            .update("customRules", msg.customRules, target);
        } else if (msg.type === "savePromptToFile" && typeof msg.systemPrompt === "string") {
          void this._savePromptToFile(msg.systemPrompt);
        } else if (msg.type === "loadPromptFromFile") {
          void this._loadPromptFromFile();
        } else if (msg.type === "fetchUrl" && typeof msg.url === "string") {
          void this._fetchUrl(msg.url);
        } else if (msg.type === "focusText" && typeof msg.line === "number") {
          if (typeof msg.targetText === "string" && msg.targetText) {
            this._focusTextInEditor(msg.targetText, msg.line);
          } else if (msg.line > 0) {
            this._focusLineInEditor(msg.line);
          }
        }
      },
      undefined,
      this._disposables,
    );

    this._panel.onDidDispose(() => this._disposePanel(), undefined, this._disposables);
  }

  /**
   * Resolve the best available text editor for focus operations.
   * Priority: activeTextEditor → _lastActiveEditor → any visible file/untitled editor.
   * This covers the common case where the webview panel has taken focus
   * (activeTextEditor becomes undefined) and the user's text file is still
   * visible in another column.
   */
  private _resolveEditor(): vscode.TextEditor | undefined {
    const isText = (e: vscode.TextEditor): boolean => {
      const s = e.document.uri.scheme;
      return s === "file" || s === "untitled";
    };
    return (
      (vscode.window.activeTextEditor && isText(vscode.window.activeTextEditor)
        ? vscode.window.activeTextEditor
        : undefined) ??
      this._lastActiveEditor ??
      vscode.window.visibleTextEditors.find(isText)
    );
  }

  private _focusTextInEditor(targetText: string, lineHint?: number): void {
    this._log(`[focusText] targetText="${targetText}" lineHint=${lineHint}`);

    // Helper: try to find and select targetText in a given document, then show it.
    const tryDocument = (doc: vscode.TextDocument, preferredColumn?: vscode.ViewColumn): boolean => {
      const text = doc.getText();
      // When a lineHint is provided, prefer the match closest to that line (±5 lines).
      let offset = -1;
      if (typeof lineHint === "number" && lineHint > 0) {
        const lineIndex = Math.max(0, lineHint - 1);
        const startOffset = doc.offsetAt(new vscode.Position(Math.max(0, lineIndex - 5), 0));
        const endLine = Math.min(doc.lineCount - 1, lineIndex + 5);
        const endOffset = doc.offsetAt(new vscode.Position(endLine, 0)) + doc.lineAt(endLine).text.length;
        const nearbyText = text.slice(startOffset, endOffset);
        const nearbyIndex = nearbyText.indexOf(targetText);
        if (nearbyIndex !== -1) {
          offset = startOffset + nearbyIndex;
        }
      }
      if (offset === -1) {
        offset = text.indexOf(targetText);
      }
      if (offset === -1) {
        return false;
      }
      const start = doc.positionAt(offset);
      const end = doc.positionAt(offset + targetText.length);
      const selection = new vscode.Selection(start, end);
      this._log(`[focusText] found targetText at line ${start.line + 1} in "${doc.fileName}"`);
      void vscode.window.showTextDocument(doc, {
        selection,
        preserveFocus: false,
        viewColumn: preferredColumn,
      });
      return true;
    };

    // First: try visible / tracked editors.
    const editor = this._resolveEditor();
    if (editor) {
      if (tryDocument(editor.document, editor.viewColumn)) {
        return;
      }
      // Found an editor but targetText not in it — fall through to search all documents.
    }

    // Second: search every open (possibly non-visible) text document.
    this._log("[focusText] no matching editor visible; searching all open documents");
    const isTextDoc = (d: vscode.TextDocument): boolean => d.uri.scheme === "file" || d.uri.scheme === "untitled";
    for (const doc of vscode.workspace.textDocuments) {
      if (!isTextDoc(doc)) {
        continue;
      }
      if (tryDocument(doc)) {
        return;
      }
    }

    this._log("[focusText] targetText not found in any open document");
    void vscode.window.showInformationMessage("JP Proofreader: 文字列がドキュメント内に見つかりませんでした");
  }

  private _focusLineInEditor(line: number): void {
    this._log(`[focusText] line=${line}`);
    const editor = this._resolveEditor();
    if (!editor) {
      this._log("[focusText] no active editor");
      void vscode.window.showInformationMessage(
        "JP Proofreader: 文字列の特定に失敗しました（アクティブなエディタが見つかりません）",
      );
      return;
    }
    const lineIndex = line - 1;
    if (lineIndex < 0 || lineIndex >= editor.document.lineCount) {
      this._log(`[focusText] line ${line} out of range (document has ${editor.document.lineCount} lines)`);
      void vscode.window.showInformationMessage("JP Proofreader: 文字列の特定に失敗しました（行番号が範囲外です）");
      return;
    }
    const range = editor.document.lineAt(lineIndex).range;
    this._log(`[focusText] focusing line ${line} in "${editor.document.fileName}"`);
    void vscode.window.showTextDocument(editor.document, {
      selection: range,
      preserveFocus: false,
      viewColumn: editor.viewColumn,
    });
  }

  private _sendSettings(): void {
    const stored = this._context.globalState.get<string>(SYSTEM_PROMPT_KEY);
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let promptFilePath = this._context.globalState.get<string>(SYSTEM_PROMPT_FILE_KEY);

    if (stored) {
      systemPrompt = stored;
    } else {
      // On first launch (no stored prompt), load from the default file if it exists.
      const defaultFilePath = this._getDefaultPromptFilePath();
      if (defaultFilePath) {
        try {
          const content = fs.readFileSync(defaultFilePath, "utf-8");
          systemPrompt = content;
          promptFilePath = defaultFilePath;
          this._log(`[sendSettings] auto-loaded default prompt file: ${defaultFilePath}`);
          void this._context.globalState.update(SYSTEM_PROMPT_KEY, content);
          void this._context.globalState.update(SYSTEM_PROMPT_FILE_KEY, defaultFilePath);
        } catch {
          // File does not exist or is unreadable — fall back to built-in default.
        }
      }
    }

    void this._panel.webview.postMessage({
      type: "settings",
      systemPrompt,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      promptFilePath,
      customRules: vscode.workspace.getConfiguration("vscode-jp-proofreader").get<string>("customRules", ""),
    });
  }

  /** Return the path to the default prompt file in the workspace root, or null if no workspace is open. */
  private _getDefaultPromptFilePath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }
    return path.join(workspaceFolder.uri.fsPath, DEFAULT_PROMPT_FILE_NAME);
  }

  /** Save the given system prompt to the default file in the workspace root. */
  private async _savePromptToFile(systemPrompt: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void this._panel.webview.postMessage({
        type: "promptFileError",
        message: "ワークスペースが開かれていません。",
      });
      return;
    }
    const filePath = path.join(workspaceFolder.uri.fsPath, DEFAULT_PROMPT_FILE_NAME);
    try {
      fs.writeFileSync(filePath, systemPrompt, "utf-8");
      await this._context.globalState.update(SYSTEM_PROMPT_FILE_KEY, filePath);
      void this._panel.webview.postMessage({ type: "promptFileSaved", path: filePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void this._panel.webview.postMessage({ type: "promptFileError", message: `保存エラー: ${message}` });
    }
  }

  /** Open a file dialog and load the selected file as the system prompt. */
  private async _loadPromptFromFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { text: ["txt", "md"], all: ["*"] },
      title: "システムプロンプトファイルを選択",
    });
    if (!uris || uris.length === 0) {
      return;
    }
    const filePath = uris[0].fsPath;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      await this._context.globalState.update(SYSTEM_PROMPT_KEY, content);
      await this._context.globalState.update(SYSTEM_PROMPT_FILE_KEY, filePath);
      void this._panel.webview.postMessage({ type: "promptFileLoaded", systemPrompt: content, path: filePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void this._panel.webview.postMessage({ type: "promptFileError", message: `読み込みエラー: ${message}` });
    }
  }

  /**
   * Determine whether a model is suitable for proofreading based on its id and name.
   * Reads allowedModelPatterns and excludedModelPatterns from VS Code user settings.
   * Excluded patterns take precedence over allowed patterns.
   * Returns false when no pattern matches.
   */
  private _isSuitableForProofreading(modelId: string, modelName: string): boolean {
    const config = vscode.workspace.getConfiguration("vscode-jp-proofreader");
    const excludedPatterns = config.get<string[]>("excludedModelPatterns", ["mini", "flash", "haiku", "nano"]);
    const allowedPatterns = config.get<string[]>("allowedModelPatterns", [
      "gpt-4o",
      "gpt-4",
      "sonnet",
      "opus",
      "pro",
      "o1",
      "o3",
    ]);

    for (const raw of excludedPatterns) {
      try {
        const re = new RegExp(raw, "i");
        if (re.test(modelId) || re.test(modelName)) {
          return false;
        }
      } catch {
        this._log(`[isSuitableForProofreading] invalid excludedModelPattern skipped: "${raw}"`);
      }
    }
    for (const raw of allowedPatterns) {
      try {
        const re = new RegExp(raw, "i");
        if (re.test(modelId) || re.test(modelName)) {
          return true;
        }
      } catch {
        this._log(`[isSuitableForProofreading] invalid allowedModelPattern skipped: "${raw}"`);
      }
    }
    return false;
  }

  private async _sendModels(): Promise<void> {
    this._log("[sendModels] fetching Copilot models…");
    try {
      const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
      this._log(`[sendModels] found ${models.length} model(s): ${models.map((m) => m.id).join(", ")}`);
      const filteredModels = models.filter((m) => this._isSuitableForProofreading(m.id, m.name));
      this._log(`[sendModels] suitable model(s): ${filteredModels.map((m) => m.id).join(", ")}`);
      const modelInfos = filteredModels.map((m) => ({ id: m.id, name: `${m.name} (${m.family})` }));
      // モデル名のアルファベット順にソート
      modelInfos.sort((a, b) => a.name.localeCompare(b.name));
      void this._panel.webview.postMessage({ type: "models", models: modelInfos });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`[sendModels] error: ${message}`);
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
    // 3個以上連続する半角・全角スペースを1つに圧縮
    text = text.replace(/[ \u3000]{3,}/g, " ");
    // 空白のみ・改行のみの行を削除
    text = text.replace(/^[ \t\u3000]*$/gm, "");
    // 3回以上連続する改行を2つに圧縮
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  private async _runReview(text: string, modelId: string): Promise<void> {
    const tokenSource = new vscode.CancellationTokenSource();
    this._currentReviewTokenSource = tokenSource;
    // Clear any existing diagnostics from a previous review.
    this._diagnosticCollection?.clear();
    try {
      this._log(`[runReview] selecting model id="${modelId}"…`);
      const [model] = await vscode.lm.selectChatModels({ id: modelId });
      if (!model) {
        this._log(`[runReview] model not found: "${modelId}"`);
        void this._panel.webview.postMessage({
          type: "reviewError",
          message: "指定されたモデルが見つかりません。Copilot が有効か確認してください。",
        });
        return;
      }
      this._log(`[runReview] model found: "${model.id}" (${model.family}). sending request…`);

      // Load custom rules: prefer the value stored in VS Code settings, fall back to
      // workspace root files (.proofreaderrc.txt or proofreader-dict.txt).
      const configCustomRules = vscode.workspace
        .getConfiguration("vscode-jp-proofreader")
        .get<string>("customRules", "");
      let fileCustomRules = "";
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        for (const fileName of [".proofreaderrc.txt", "proofreader-dict.txt"]) {
          const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
          try {
            const bytes = await vscode.workspace.fs.readFile(fileUri);
            fileCustomRules = new TextDecoder().decode(bytes);
            this._log(`[runReview] loaded custom rules from ${fileName}`);
            break;
          } catch {
            // File does not exist — try the next candidate.
          }
        }
      }
      const customRules = configCustomRules || fileCustomRules;

      // Get the language ID of the document currently open in the active editor.
      // Only accept safe identifier characters to prevent prompt injection.
      const rawLanguageId = vscode.window.activeTextEditor?.document.languageId ?? "";
      const languageId = /^[\w.-]+$/.test(rawLanguageId) ? rawLanguageId : "";

      // Phase 1: Stream the review using the user's system prompt, augmented with
      // language context and project-specific custom rules when available.
      const systemPrompt = this._context.globalState.get<string>(SYSTEM_PROMPT_KEY) ?? DEFAULT_SYSTEM_PROMPT;
      let dynamicPrompt = systemPrompt;
      if (languageId) {
        dynamicPrompt +=
          `\n\n対象テキストのフォーマットは '${languageId}' です。` +
          "このフォーマットの構文（マークダウン記号など）は誤字脱字として扱わないでください。";
      }
      if (customRules) {
        dynamicPrompt += `\n\n以下のプロジェクト固有のルールおよび用語集を最優先で遵守して校閲してください:\n${customRules}`;
      }
      const phase1Prompt = `${dynamicPrompt}\n\nテキスト:\n${text}`;
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(phase1Prompt)],
        {},
        tokenSource.token,
      );
      let chunkCount = 0;
      let totalLength = 0;
      let fullReviewText = "";
      for await (const chunk of response.text) {
        chunkCount++;
        totalLength += chunk.length;
        fullReviewText += chunk;
        this._log(`[runReview] chunk #${chunkCount} length=${chunk.length}`);
        void this._panel.webview.postMessage({ type: "reviewChunk", chunk });
      }
      this._log(`[runReview] done. chunks=${chunkCount} totalLength=${totalLength}`);
      if (chunkCount === 0) {
        void this._panel.webview.postMessage({
          type: "reviewError",
          message: `モデル "${modelId}" が応答を返しませんでした。別のモデルを選択してください。`,
        });
        return;
      }

      // Phase 2: Convert the review text to a structured JSON array.
      // Send a standalone request (not threaded conversation) to keep the token
      // payload small and avoid unbounded model output.
      this._log("[runReview] phase 2: converting to structured JSON…");
      const items = await this._convertToStructuredItems(fullReviewText, model, tokenSource.token);
      this._log(`[runReview] phase 2 done. items=${items ? items.length : "null"}`);
      if (items) {
        this._setDiagnostics(items);
        this._outlineProvider?.refresh(items as ReviewItem[]);
      }
      void this._panel.webview.postMessage({ type: "reviewDone", items: items ?? undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`[runReview] error: ${message}`);
      void this._panel.webview.postMessage({ type: "reviewError", message });
    } finally {
      // Clean up the token source when this review completes (or errors/is cancelled).
      if (this._currentReviewTokenSource === tokenSource) {
        this._currentReviewTokenSource = undefined;
      }
      tokenSource.dispose();
    }
  }

  /**
   * Phase 2: send a standalone conversion request (no conversation history) and return
   * a parsed ReviewItem array, or null if conversion or parsing fails.
   * Using a standalone message keeps the token payload small and avoids unbounded output.
   */
  private async _convertToStructuredItems(
    reviewText: string,
    model: vscode.LanguageModelChat,
    token: vscode.CancellationToken,
  ): Promise<Array<{
    viewpoint: string;
    level: string;
    content: string;
    targetText: string;
    replacementText: string;
    line: number;
  }> | null> {
    try {
      const phase2Messages = [
        vscode.LanguageModelChatMessage.User(`${JSON_CONVERSION_PROMPT}\n\n校閲結果:\n${reviewText}`),
      ];
      const response = await model.sendRequest(phase2Messages, {}, token);
      let raw = "";
      for await (const chunk of response.text) {
        raw += chunk;
      }
      this._log(`[convertToStructuredItems] raw response length=${raw.length}`);
      return this._parseItems(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`[convertToStructuredItems] error: ${message}`);
      return null;
    }
  }

  /** Parse a JSON array of review items from raw LLM output. */
  private _parseItems(raw: string): Array<{
    viewpoint: string;
    level: string;
    content: string;
    targetText: string;
    replacementText: string;
    line: number;
  }> | null {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as Record<string, unknown>).viewpoint === "string" &&
            typeof (item as Record<string, unknown>).level === "string" &&
            typeof (item as Record<string, unknown>).content === "string" &&
            typeof (item as Record<string, unknown>).targetText === "string" &&
            typeof (item as Record<string, unknown>).replacementText === "string",
        )
      ) {
        return (parsed as Array<Record<string, unknown>>).map((item) => ({
          viewpoint: item.viewpoint as string,
          level: item.level as string,
          content: item.content as string,
          targetText: item.targetText as string,
          replacementText: item.replacementText as string,
          line: typeof item.line === "number" ? (item.line as number) : 0,
        }));
      }
    } catch {
      // fall through
    }
    return null;
  }

  /**
   * Set VS Code editor diagnostics based on the review items.
   * Searches for each item's targetText in the active text editor's document and
   * attaches a Diagnostic at that location.
   */
  private _setDiagnostics(
    items: Array<{
      viewpoint: string;
      level: string;
      content: string;
      targetText: string;
      replacementText: string;
      line: number;
    }>,
  ): void {
    if (!this._diagnosticCollection) {
      return;
    }
    const editor = vscode.window.activeTextEditor ?? this._lastActiveEditor;
    if (!editor) {
      return;
    }
    const document = editor.document;
    const docText = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];
    for (const item of items) {
      if (!item.targetText) {
        continue;
      }
      const index = docText.indexOf(item.targetText);
      if (index === -1) {
        continue;
      }
      const start = document.positionAt(index);
      const end = document.positionAt(index + item.targetText.length);
      item.line = start.line + 1;
      const range = new vscode.Range(start, end);
      let severity: vscode.DiagnosticSeverity;
      if (item.level === "error") {
        severity = vscode.DiagnosticSeverity.Error;
      } else if (item.level === "suggestion") {
        severity = vscode.DiagnosticSeverity.Warning;
      } else {
        severity = vscode.DiagnosticSeverity.Information;
      }
      const diagnostic = new vscode.Diagnostic(range, item.content, severity);
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = item.replacementText;
      diagnostics.push(diagnostic);
    }
    this._diagnosticCollection.set(document.uri, diagnostics);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${csp} 'unsafe-inline'; img-src ${csp} data: blob:; font-src ${csp}; connect-src ${csp};">
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
