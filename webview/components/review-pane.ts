/**
 * Review pane — left: text input textarea, right: model select + AI review button + result.
 *
 * Emits `jp-review` (CustomEvent<ReviewRequestDetail>) when the user triggers a review.
 */

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/details/details.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/split-panel/split-panel.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import type SlInput from "@shoelace-style/shoelace/dist/components/input/input.js";
import type SlSelect from "@shoelace-style/shoelace/dist/components/select/select.js";
import type SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ModelInfo, ReviewItem } from "../vscode-api";

export type ReviewRequestDetail = { text: string; modelId: string };
export type FetchUrlDetail = { url: string };

@customElement("jp-review-pane")
export class JpReviewPane extends LitElement {
  /** Available models passed down from the root component. */
  @property({ attribute: false }) models: ModelInfo[] = [];
  /** Whether a review request is currently in flight. */
  @property({ type: Boolean }) loading = false;
  /** Accumulated streaming result text from the host. */
  @property() result = "";
  /** Parsed review items (per-viewpoint accordion data). Null means not yet parsed or parse failed. */
  @property({ attribute: false }) reviewItems: ReviewItem[] | null = null;
  /** Error message originating from the host (e.g. API failure). */
  @property() hostError = "";
  /** Text fetched from URL by the host — applied to textarea when set. */
  @property() urlText = "";
  /** Whether URL fetch is in progress. */
  @property({ type: Boolean }) urlLoading = false;

  @state() private _inputText = "";
  @state() private _modelId = "";
  @state() private _validationError = "";
  @state() private _urlInput = "";

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // Set default model when models first arrive — prefer gpt-5-mini.
    if (changed.has("models") && this.models.length > 0 && !this._modelId) {
      const preferred = this.models.find(
        (m) => m.id.toLowerCase().includes("gpt-5-mini") || m.name.toLowerCase().includes("gpt-5-mini"),
      );
      this._modelId = (preferred ?? this.models[0]).id;
    }
    // Apply text fetched from URL into the textarea.
    if (changed.has("urlText") && this.urlText) {
      this._inputText = this.urlText;
    }
  }

  static override styles = css`
    :host {
      display: block;
      height: 100%;
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
      width: 100%;
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
      width: 100%;
      display: flex;
      flex-direction: column;
    }
    sl-textarea::part(form-control) {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      width: 100%;
      margin: 0;
      padding: 0;
    }
    sl-textarea::part(base),
    sl-textarea::part(form-control-input) {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      width: 100%;
      box-sizing: border-box;
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
    .result-box.loading {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .loading-text {
      font-style: italic;
      opacity: 0.6;
    }

    .url-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
    }
    .url-row sl-input {
      flex: 1;
    }

    .error-msg {
      font-size: 12px;
      color: var(--sl-color-danger-600, #e03131);
      margin: 0;
      flex-shrink: 0;
    }

    .review-items {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    sl-details {
      --sl-spacing-medium: 10px;
    }

    .viewpoint-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
    }

    .level-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .level-dot.ok {
      background-color: #2f9e44;
    }
    .level-dot.suggestion {
      background-color: #f08c00;
    }
    .level-dot.error {
      background-color: #e03131;
    }

    .viewpoint-content {
      font-size: 13px;
      line-height: 1.7;
      white-space: pre-wrap;
      margin: 0;
    }
  `;

  private _loadUrl = (): void => {
    const url = this._urlInput.trim();
    if (!url) return;
    this.dispatchEvent(
      new CustomEvent<FetchUrlDetail>("jp-fetch-url", {
        detail: { url },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _startReview = (): void => {
    this._validationError = "";
    if (!this._inputText.trim()) {
      this._validationError = "テキストを入力してください。";
      return;
    }
    if (!this._modelId) {
      this._validationError = "モデルを選択してください。";
      return;
    }
    this.dispatchEvent(
      new CustomEvent<ReviewRequestDetail>("jp-review", {
        detail: { text: this._inputText, modelId: this._modelId },
        bubbles: true,
        composed: true,
      }),
    );
  };

  override render() {
    const showPlaceholder = !this.result && !this.loading && this.reviewItems === null;
    const showLoading = this.loading && !this.result;
    const showItems = !this.loading && (this.reviewItems?.length ?? 0) > 0;
    const showRawResult = !this.loading && !showItems && !!this.result;
    const displayError = this._validationError || this.hostError;

    return html`
      <sl-split-panel>
        <div slot="start" class="pane">
          <p class="pane-label">テキスト入力</p>
          <div class="url-row">
            <sl-input
              placeholder="URLを入力して読み込む (例: https://example.com/article)"
              type="url"
              .value=${this._urlInput}
              @sl-input=${(e: CustomEvent) => {
                this._urlInput = (e.target as SlInput).value;
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") this._loadUrl();
              }}
            ></sl-input>
            <sl-button
              ?loading=${this.urlLoading}
              ?disabled=${this.urlLoading || !this._urlInput.trim()}
              @click=${this._loadUrl}
            >読み込み</sl-button>
          </div>
          <sl-textarea
            placeholder="校閲したいテキストを入力してください…"
            .value=${this._inputText}
            @sl-input=${(e: CustomEvent) => {
              this._inputText = (e.target as SlTextarea).value;
            }}
          ></sl-textarea>
        </div>

        <div slot="end" class="pane">
          <p class="pane-label">AIレビュー</p>
          <sl-select
            label="モデル"
            .value=${this._modelId}
            ?disabled=${this.loading || this.models.length === 0}
            @sl-change=${(e: CustomEvent) => {
              this._modelId = (e.target as SlSelect).value as string;
            }}
          >
            ${this.models.map((m) => html`<sl-option value=${m.id}>${m.name}</sl-option>`)}
          </sl-select>

          <sl-button
            variant="primary"
            ?loading=${this.loading}
            ?disabled=${this.loading || !this._modelId}
            @click=${this._startReview}
          >
            AIレビュー
          </sl-button>

          ${displayError ? html`<p class="error-msg">${displayError}</p>` : nothing}

          ${showItems
            ? html`
                <div class="review-items">
                  ${(this.reviewItems ?? []).map(
                    (item) => html`
                      <sl-details>
                        <div slot="summary" class="viewpoint-header">
                          <span class="level-dot ${item.level}"></span>
                          ${item.viewpoint}
                        </div>
                        <p class="viewpoint-content">${item.content}</p>
                      </sl-details>
                    `,
                  )}
                </div>
              `
            : html`
                <div class="result-box ${showPlaceholder ? "placeholder" : ""} ${showLoading ? "loading" : ""}">
                  ${showPlaceholder
                    ? "レビュー結果がここに表示されます"
                    : showLoading
                      ? html`<sl-spinner></sl-spinner><span class="loading-text">AIが校閲中…</span>`
                      : showRawResult
                        ? this.result
                        : nothing}
                </div>
              `}
        </div>
      </sl-split-panel>
    `;
  }
}
