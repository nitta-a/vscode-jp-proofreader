/**
 * JP Proofreader WebView frontend — Lit + Shoelace.
 */

// Shoelace dark theme (extracted to dashboard.css by esbuild)
import "@shoelace-style/shoelace/dist/themes/dark.css";

// Shoelace components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/split-panel/split-panel.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import type SlSelect from "@shoelace-style/shoelace/dist/components/select/select.js";
import type SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";

// Lit
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

// Read Shoelace asset base path from the meta tag injected by the extension host.
setBasePath(document.querySelector<HTMLMetaElement>('meta[name="sl-base"]')?.content ?? "");

// ---------------------------------------------------------------------------
// VS Code WebView API
// ---------------------------------------------------------------------------

declare function acquireVsCodeApi(): {
  postMessage(msg: { type: string; text?: string; modelId?: string }): void;
};

type ModelInfo = { id: string; name: string };
type HostMsg =
  | { type: "models"; models: ModelInfo[] }
  | { type: "reviewChunk"; chunk: string }
  | { type: "reviewDone" }
  | { type: "reviewError"; message: string };

const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

@customElement("jp-proofreader-app")
class JpProofreaderApp extends LitElement {
  @state() models: ModelInfo[] = [];
  @state() modelId = "";
  @state() inputText = "";
  @state() result = "";
  @state() loading = false;
  @state() errorMsg = "";

  static styles = css`
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

    sl-split-panel {
      --divider-width: 5px;
      --divider-hit-area: 16px;
      height: 100%;
    }

    .pane {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      padding: 16px;
      box-sizing: border-box;
      overflow: hidden;
    }

    .pane-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.5;
      margin: 0;
      flex-shrink: 0;
    }

    sl-textarea {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    sl-textarea::part(base),
    sl-textarea::part(form-control),
    sl-textarea::part(form-control-input) {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    sl-textarea::part(textarea) {
      flex: 1;
      resize: none;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.65;
    }

    .result-box {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.7;
      font-size: 13px;
      padding: 10px 12px;
      border: 1px solid var(--sl-input-border-color);
      border-radius: var(--sl-border-radius-medium, 4px);
      background: var(--sl-input-background-color);
      color: var(--sl-input-color);
      box-sizing: border-box;
    }
    .result-box.placeholder {
      font-style: italic;
      opacity: 0.4;
    }

    .error-msg {
      font-size: 12px;
      color: var(--sl-color-danger-600, #e03131);
      margin: 0;
      flex-shrink: 0;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this.handleMsg);
    vscode.postMessage({ type: "requestModels" });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMsg);
  }

  private readonly handleMsg = (ev: MessageEvent<HostMsg>): void => {
    const msg = ev.data;
    if (msg.type === "models") {
      this.models = msg.models;
      this.modelId = msg.models[0]?.id ?? "";
      if (msg.models.length === 0) {
        this.errorMsg = "利用可能なモデルがありません (GitHub Copilot が必要です)";
      }
    } else if (msg.type === "reviewChunk") {
      this.result += msg.chunk;
    } else if (msg.type === "reviewDone") {
      this.loading = false;
    } else if (msg.type === "reviewError") {
      this.loading = false;
      this.errorMsg = msg.message;
    }
  };

  private startReview(): void {
    if (!this.inputText.trim()) {
      this.errorMsg = "テキストを入力してください。";
      return;
    }
    if (!this.modelId) {
      this.errorMsg = "モデルを選択してください。";
      return;
    }
    this.loading = true;
    this.result = "";
    this.errorMsg = "";
    vscode.postMessage({ type: "review", text: this.inputText, modelId: this.modelId });
  }

  render() {
    const showPlaceholder = !this.result && !this.loading;
    return html`
      <sl-split-panel>
        <div slot="start" class="pane">
          <p class="pane-label">テキスト入力</p>
          <sl-textarea
            placeholder="校閲したいテキストを入力してください…"
            .value=${this.inputText}
            @sl-input=${(e: CustomEvent) => {
              this.inputText = (e.target as SlTextarea).value;
            }}
          ></sl-textarea>
        </div>

        <div slot="end" class="pane">
          <p class="pane-label">AIレビュー</p>
          <sl-select
            label="モデル"
            .value=${this.modelId}
            ?disabled=${this.loading || this.models.length === 0}
            @sl-change=${(e: CustomEvent) => {
              this.modelId = (e.target as SlSelect).value as string;
            }}
          >
            ${this.models.map((m) => html`<sl-option value=${m.id}>${m.name}</sl-option>`)}
          </sl-select>

          <sl-button
            variant="primary"
            ?loading=${this.loading}
            ?disabled=${this.loading || !this.modelId}
            @click=${this.startReview}
          >
            AIレビュー
          </sl-button>

          ${this.errorMsg ? html`<p class="error-msg">${this.errorMsg}</p>` : nothing}

          <div class="result-box ${showPlaceholder ? "placeholder" : ""}">
            ${showPlaceholder ? "レビュー結果がここに表示されます" : this.result}
          </div>
        </div>
      </sl-split-panel>
    `;
  }
}
