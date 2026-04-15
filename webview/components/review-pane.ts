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
  @state() private _searchVisible = false;
  @state() private _searchQuery = "";
  @state() private _searchIndex = 0;
  @state() private _searchMatches: Array<{ start: number; end: number }> = [];

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // Set default model when models first arrive — prefer gpt-4o.
    if (changed.has("models") && this.models.length > 0 && !this._modelId) {
      const preferred = this.models.find(
        (m) => m.id.toLowerCase().includes("gpt-4o") || m.name.toLowerCase().includes("gpt-4o"),
      );
      this._modelId = (preferred ?? this.models[0]).id;
    }
    // Apply text fetched from URL into the textarea.
    if (changed.has("urlText") && this.urlText) {
      this._inputText = this.urlText;
    }
    // Re-compute search matches when the input text changes while search is active.
    if (changed.has("_inputText") && this._searchVisible && this._searchQuery) {
      void this.updateComplete.then(() => {
        this._computeMatches();
      });
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
      width: 100%;
      box-sizing: border-box;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.65;
    }
    sl-textarea::part(textarea)::selection {
      background-color: var(--vscode-editor-findMatchHighlightBackground, #ffd33d99);
      color: var(--vscode-editor-foreground, inherit);
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

    .group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
    }

    .item-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .item-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--sl-border-radius-medium, 4px);
      background: var(--sl-color-neutral-50, rgba(0, 0, 0, 0.04));
    }

    .item-row .level-dot {
      margin-top: 4px;
      flex-shrink: 0;
    }

    .item-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      line-height: 1.7;
      flex: 1;
      min-width: 0;
    }

    .item-content {
      white-space: pre-wrap;
      margin: 0;
    }

    .item-target {
      font-size: 12px;
      opacity: 0.65;
      margin: 0;
      word-break: break-all;
    }

    .item-replacement {
      font-size: 12px;
      opacity: 0.65;
      margin: 0;
      word-break: break-all;
    }

    .label {
      font-weight: 600;
    }

    .pane-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .search-toggle-btn {
      background: none;
      border: none;
      cursor: pointer;
      opacity: 0.5;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
      color: inherit;
      line-height: 1;
    }
    .search-toggle-btn:hover {
      opacity: 1;
      background: var(--sl-color-neutral-100, rgba(128, 128, 128, 0.15));
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      background: var(--sl-input-background-color);
      border: 1px solid var(--sl-input-border-color);
      border-radius: var(--sl-border-radius-medium, 4px);
      padding: 4px 8px;
    }
    .search-bar input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--sl-input-color, inherit);
      font-size: 13px;
      font-family: inherit;
    }
    .search-count {
      font-size: 12px;
      opacity: 0.6;
      white-space: nowrap;
      min-width: 44px;
      text-align: right;
    }
    .search-nav-btn,
    .search-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      opacity: 0.6;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 11px;
      color: inherit;
      flex-shrink: 0;
      line-height: 1;
    }
    .search-nav-btn:hover,
    .search-close-btn:hover {
      opacity: 1;
      background: var(--sl-color-neutral-100, rgba(128, 128, 128, 0.15));
    }
    .search-nav-btn:disabled {
      opacity: 0.25;
      cursor: not-allowed;
    }
  `;

  private _groupByViewpoint(): Map<string, ReviewItem[]> {
    const map = new Map<string, ReviewItem[]>();
    for (const item of this.reviewItems ?? []) {
      const group = map.get(item.viewpoint);
      if (group) {
        group.push(item);
      } else {
        map.set(item.viewpoint, [item]);
      }
    }
    return map;
  }

  private _worstLevel(items: ReviewItem[]): ReviewItem["level"] {
    if (items.some((i) => i.level === "error")) return "error";
    if (items.some((i) => i.level === "suggestion")) return "suggestion";
    return "ok";
  }

  private _openSearch(): void {
    this._searchVisible = true;
    void this.updateComplete.then(() => {
      (this.shadowRoot?.querySelector(".search-input") as HTMLInputElement | null)?.focus();
    });
  }

  private _closeSearch(): void {
    this._searchVisible = false;
    this._searchQuery = "";
    this._searchMatches = [];
    this._searchIndex = 0;
    void this.updateComplete.then(() => {
      (this.shadowRoot?.querySelector("sl-textarea") as SlTextarea | null)?.focus();
    });
  }

  private _computeMatches(): void {
    if (!this._searchQuery) {
      this._searchMatches = [];
      this._searchIndex = 0;
      return;
    }
    const queryLower = this._searchQuery.toLowerCase();
    const textLower = this._inputText.toLowerCase();
    const matches: Array<{ start: number; end: number }> = [];
    let from = 0;
    while (from < textLower.length) {
      const idx = textLower.indexOf(queryLower, from);
      if (idx === -1) {
        break;
      }
      matches.push({ start: idx, end: idx + this._searchQuery.length });
      from = idx + 1;
    }
    this._searchMatches = matches;
    if (this._searchIndex >= matches.length) {
      this._searchIndex = 0;
    }
    void this.updateComplete.then(() => {
      this._scrollToCurrentMatch(false);
    });
  }

  private _scrollToCurrentMatch(focusTextarea = true): void {
    if (this._searchMatches.length === 0) {
      return;
    }
    const match = this._searchMatches[this._searchIndex];
    const slTextarea = this.shadowRoot?.querySelector("sl-textarea") as SlTextarea | null;
    const textarea = slTextarea?.input;
    if (!textarea) {
      return;
    }
    // Only focus the textarea (to show ::selection highlight) on explicit navigation,
    // not while the user is actively typing in the search input.
    if (focusTextarea) {
      textarea.focus({ preventScroll: true });
    }
    // Set the selection (highlighted via ::selection CSS when textarea is focused).
    textarea.setSelectionRange(match.start, match.end);
    // Scroll the textarea so the match is visible.
    const linesBefore = this._inputText.slice(0, match.start).split("\n").length - 1;
    const defaultLineHeight = 20;
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || defaultLineHeight;
    textarea.scrollTop = Math.max(0, linesBefore * lineHeight - textarea.clientHeight / 3);
  }

  private _navigateMatch(delta: number): void {
    if (this._searchMatches.length === 0) {
      return;
    }
    const len = this._searchMatches.length;
    this._searchIndex = ((this._searchIndex + delta) % len + len) % len;
    this._scrollToCurrentMatch();
  }

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
          <div class="pane-header">
            <p class="pane-label">テキスト入力</p>
            <button class="search-toggle-btn" title="検索 (Ctrl+F)" @click=${this._openSearch}>🔍</button>
          </div>
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
          ${this._searchVisible
            ? html`
                <div class="search-bar">
                  <input
                    class="search-input"
                    type="text"
                    placeholder="検索..."
                    .value=${this._searchQuery}
                    @input=${(e: InputEvent) => {
                      this._searchQuery = (e.target as HTMLInputElement).value;
                      this._computeMatches();
                    }}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        this._navigateMatch(e.shiftKey ? -1 : 1);
                      } else if (e.key === "Escape") {
                        this._closeSearch();
                      }
                    }}
                  />
                  <span class="search-count">
                    ${this._searchQuery
                      ? this._searchMatches.length > 0
                        ? `${this._searchIndex + 1} / ${this._searchMatches.length}`
                        : "0 件"
                      : ""}
                  </span>
                  <button
                    class="search-nav-btn"
                    title="前へ (Shift+Enter)"
                    ?disabled=${this._searchMatches.length === 0}
                    @click=${() => this._navigateMatch(-1)}
                  >
                    ▲
                  </button>
                  <button
                    class="search-nav-btn"
                    title="次へ (Enter)"
                    ?disabled=${this._searchMatches.length === 0}
                    @click=${() => this._navigateMatch(1)}
                  >
                    ▼
                  </button>
                  <button class="search-close-btn" title="閉じる (Esc)" @click=${this._closeSearch}>✕</button>
                </div>
              `
            : nothing}
          <sl-textarea
            placeholder="校閲したいテキストを入力してください…"
            .value=${this._inputText}
            @sl-input=${(e: CustomEvent) => {
              this._inputText = (e.target as SlTextarea).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "f") {
                e.preventDefault();
                this._openSearch();
              }
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
                  ${Array.from(this._groupByViewpoint().entries()).map(
                    ([viewpoint, items]) => html`
                      <sl-details>
                        <div slot="summary" class="group-header">
                          <span class="level-dot ${this._worstLevel(items)}"></span>
                          ${viewpoint}
                        </div>
                        <div class="item-list">
                          ${items.map(
                            (item) => html`
                              <div class="item-row">
                                <span class="level-dot ${item.level}"></span>
                                <div class="item-body">
                                  <p class="item-content">${item.content}</p>
                                  ${item.targetText
                                    ? html`<p class="item-target">
                                        <span class="label">対象:</span> ${item.targetText}
                                      </p>`
                                    : nothing}
                                  ${item.replacementText
                                    ? html`<p class="item-replacement">
                                        <span class="label">修正案:</span> ${item.replacementText}
                                      </p>`
                                    : nothing}
                                </div>
                              </div>
                            `,
                          )}
                        </div>
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
