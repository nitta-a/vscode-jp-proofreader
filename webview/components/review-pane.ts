/**
 * Review pane — left: text input textarea, right: model select + AI review button + result.
 *
 * Emits `jp-review` (CustomEvent<ReviewRequestDetail>) when the user triggers a review.
 */

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/split-panel/split-panel.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import type SlSelect from "@shoelace-style/shoelace/dist/components/select/select.js";
import type SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ModelInfo } from "../vscode-api";

export type ReviewRequestDetail = { text: string; modelId: string };

@customElement("jp-review-pane")
export class JpReviewPane extends LitElement {
  /** Available models passed down from the root component. */
  @property({ attribute: false }) models: ModelInfo[] = [];
  /** Whether a review request is currently in flight. */
  @property({ type: Boolean }) loading = false;
  /** Accumulated streaming result text from the host. */
  @property() result = "";
  /** Error message originating from the host (e.g. API failure). */
  @property() hostError = "";

  @state() private _inputText = "";
  @state() private _modelId = "";
  @state() private _validationError = "";

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // Set default model when models first arrive.
    if (changed.has("models") && this.models.length > 0 && !this._modelId) {
      this._modelId = this.models[0].id;
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

  private _startReview(): void {
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
  }

  override render() {
    const showPlaceholder = !this.result && !this.loading;
    const displayError = this._validationError || this.hostError;

    return html`
      <sl-split-panel>
        <div slot="start" class="pane">
          <p class="pane-label">テキスト入力</p>
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

          <div class="result-box ${showPlaceholder ? "placeholder" : ""}">
            ${showPlaceholder ? "レビュー結果がここに表示されます" : this.result}
          </div>
        </div>
      </sl-split-panel>
    `;
  }
}
