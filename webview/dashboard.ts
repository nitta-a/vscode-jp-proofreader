/**
 * JP Proofreader WebView frontend — root orchestrator component.
 *
 * Handles host ↔ webview messaging and delegates UI rendering to:
 *   - `jp-review-pane`   (webview/components/review-pane.ts)
 *   - `jp-settings-pane` (webview/components/settings-pane.ts)
 */

// Shoelace theme CSS — emitted by esbuild as dist/webview/dashboard.css
import "@shoelace-style/shoelace/dist/themes/dark.css";
import "@shoelace-style/shoelace/dist/themes/light.css";
// Shoelace tab components (pane components import the rest)
import "@shoelace-style/shoelace/dist/components/tab-group/tab-group.js";
import "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js";
import "@shoelace-style/shoelace/dist/components/tab/tab.js";
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
// Lit
import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

// Child components
import "./components/review-pane";
import "./components/settings-pane";
import type { FetchUrlDetail, FocusItemDetail, ReviewRequestDetail } from "./components/review-pane";
import type { SavePromptToFileDetail, SaveSettingsDetail, UpdateCustomRulesDetail } from "./components/settings-pane";
// Shared API singleton and types
import { type HostMsg, type ModelInfo, type ReviewItem, vscode } from "./vscode-api";

// Read Shoelace asset base path from the meta tag injected by the extension host.
setBasePath(document.querySelector<HTMLMetaElement>('meta[name="sl-base"]')?.content ?? "");

@customElement("jp-proofreader-app")
class JpProofreaderApp extends LitElement {
  @state() private _models: ModelInfo[] = [];
  @state() private _loading = false;
  @state() private _result = "";
  @state() private _reviewItems: ReviewItem[] | null = null;
  @state() private _hostError = "";
  @state() private _systemPrompt = "";
  @state() private _defaultSystemPrompt = "";
  @state() private _urlText = "";
  @state() private _urlLoading = false;
  @state() private _promptFilePath = "";
  @state() private _fileOpError = "";
  @state() private _loadVersion = 0;
  @state() private _customRules = "";

  static override styles = css`
    :host {
      display: block;
      height: 100vh;
      --sl-font-sans: var(--vscode-font-family, system-ui, sans-serif);
      --sl-color-primary-500: var(--vscode-button-background, #0e639c);
      --sl-color-primary-600: var(--vscode-button-background, #0e639c);
      --sl-color-primary-700: var(--vscode-button-hoverBackground, #1177bb);
      --sl-input-background-color: var(--vscode-input-background, #3c3c3c);
      --sl-input-color: var(--vscode-input-foreground, #cccccc);
      --sl-input-border-color: var(--vscode-input-border, #555555);
      --sl-input-focus-ring-color: var(--vscode-focusBorder, #007fd4);
      --sl-panel-background-color: var(--vscode-editor-background, #1e1e1e);
    }

    sl-tab-group {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    sl-tab-group::part(base) {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    sl-tab-group::part(body) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    sl-tab-panel {
      height: 100%;
    }
    sl-tab-panel::part(base) {
      height: 100%;
      padding: 0;
      overflow: hidden;
      box-sizing: border-box;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this._handleMsg);
    vscode.postMessage({ type: "requestModels" });
    vscode.postMessage({ type: "getSettings" });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this._handleMsg);
  }

  private readonly _handleMsg = (ev: MessageEvent<HostMsg>): void => {
    const msg = ev.data;
    console.log(`[JP Proofreader] host→webview type="${msg.type}"`);
    if (msg.type === "models") {
      console.log(`[JP Proofreader] models received: ${msg.models.length}`);
      this._models = msg.models;
      if (msg.models.length === 0) {
        this._hostError = "利用可能なモデルがありません (GitHub Copilot が必要です)";
      }
    } else if (msg.type === "reviewChunk") {
      console.log(`[JP Proofreader] reviewChunk length=${msg.chunk.length}`);
      this._result += msg.chunk;
    } else if (msg.type === "reviewDone") {
      console.log(`[JP Proofreader] reviewDone. resultLength=${this._result.length} hasItems=${!!msg.items}`);
      this._loading = false;
      this._reviewItems = msg.items ?? this._parseReviewItems(this._result);
    } else if (msg.type === "reviewError") {
      console.error(`[JP Proofreader] reviewError: ${msg.message}`);
      this._loading = false;
      this._hostError = msg.message;
    } else if (msg.type === "settings") {
      this._systemPrompt = msg.systemPrompt;
      this._defaultSystemPrompt = msg.defaultSystemPrompt;
      this._promptFilePath = msg.promptFilePath ?? "";
      this._customRules = msg.customRules ?? "";
    } else if (msg.type === "urlContent") {
      console.log(`[JP Proofreader] urlContent length=${msg.text.length}`);
      this._urlLoading = false;
      this._urlText = msg.text;
    } else if (msg.type === "urlError") {
      console.error(`[JP Proofreader] urlError: ${msg.message}`);
      this._urlLoading = false;
      this._hostError = msg.message;
    } else if (msg.type === "promptFileSaved") {
      console.log(`[JP Proofreader] promptFileSaved: ${msg.path}`);
      this._promptFilePath = msg.path;
      this._fileOpError = "";
    } else if (msg.type === "promptFileLoaded") {
      console.log(`[JP Proofreader] promptFileLoaded: ${msg.path}`);
      this._systemPrompt = msg.systemPrompt;
      this._promptFilePath = msg.path;
      this._fileOpError = "";
      this._loadVersion += 1;
    } else if (msg.type === "promptFileError") {
      console.error(`[JP Proofreader] promptFileError: ${msg.message}`);
      this._fileOpError = msg.message;
    }
  };

  private _handleFocusItem = (e: CustomEvent<FocusItemDetail>): void => {
    vscode.postMessage({ type: "focusText", targetText: e.detail.targetText });
  };

  private _handleFetchUrl = (e: CustomEvent<FetchUrlDetail>): void => {
    this._hostError = "";
    this._urlLoading = true;
    this._urlText = "";
    vscode.postMessage({ type: "fetchUrl", url: e.detail.url });
  };

  private _handleReview = (e: CustomEvent<ReviewRequestDetail>): void => {
    console.log(`[JP Proofreader] review requested. modelId="${e.detail.modelId}" textLength=${e.detail.text.length}`);
    this._hostError = "";
    this._result = "";
    this._reviewItems = null;
    this._loading = true;
    vscode.postMessage({ type: "review", text: e.detail.text, modelId: e.detail.modelId });
  };

  private _parseReviewItems(raw: string): ReviewItem[] | null {
    // Extract the JSON array, handling optional ```json...``` wrappers and
    // any explanatory text the LLM may emit before or after the array.
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) {
      return null;
    }
    const jsonStr = raw.slice(start, end + 1);
    try {
      const parsed: unknown = JSON.parse(jsonStr);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as Record<string, unknown>).viewpoint === "string" &&
            typeof (item as Record<string, unknown>).level === "string" &&
            typeof (item as Record<string, unknown>).content === "string",
        )
      ) {
        return parsed as ReviewItem[];
      }
    } catch {
      // fall through
    }
    return null;
  }

  private _handleSaveSettings = (e: CustomEvent<SaveSettingsDetail>): void => {
    vscode.postMessage({ type: "setSettings", systemPrompt: e.detail.systemPrompt });
  };

  private _handleSavePromptToFile = (e: CustomEvent<SavePromptToFileDetail>): void => {
    vscode.postMessage({ type: "savePromptToFile", systemPrompt: e.detail.systemPrompt });
  };

  private _handleLoadPromptFromFile = (): void => {
    vscode.postMessage({ type: "loadPromptFromFile" });
  };

  private _handleUpdateCustomRules = (e: CustomEvent<UpdateCustomRulesDetail>): void => {
    this._customRules = e.detail.customRules;
    vscode.postMessage({ type: "updateSettings", customRules: e.detail.customRules });
  };

  override render() {
    return html`
      <sl-tab-group>
        <sl-tab slot="nav" panel="review">校閲</sl-tab>
        <sl-tab slot="nav" panel="settings">設定</sl-tab>

        <sl-tab-panel name="review">
          <jp-review-pane
            .models=${this._models}
            ?loading=${this._loading}
            .result=${this._result}
            .reviewItems=${this._reviewItems}
            .hostError=${this._hostError}
            .urlText=${this._urlText}
            ?urlLoading=${this._urlLoading}
            @jp-review=${this._handleReview}
            @jp-fetch-url=${this._handleFetchUrl}
            @focus-item=${this._handleFocusItem}
          ></jp-review-pane>
        </sl-tab-panel>

        <sl-tab-panel name="settings">
          <jp-settings-pane
            .systemPrompt=${this._systemPrompt}
            .defaultSystemPrompt=${this._defaultSystemPrompt}
            .promptFilePath=${this._promptFilePath}
            .fileOpError=${this._fileOpError}
            .loadVersion=${this._loadVersion}
            .customRules=${this._customRules}
            @jp-save-settings=${this._handleSaveSettings}
            @jp-save-prompt-to-file=${this._handleSavePromptToFile}
            @jp-load-prompt-from-file=${this._handleLoadPromptFromFile}
            @jp-update-custom-rules=${this._handleUpdateCustomRules}
          ></jp-settings-pane>
        </sl-tab-panel>
      </sl-tab-group>
    `;
  }
}
