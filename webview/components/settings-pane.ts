/**
 * Settings pane — system prompt editor with save and reset actions.
 *
 * Emits `jp-save-settings`      (CustomEvent<SaveSettingsDetail>)      when the user saves to globalState.
 * Emits `jp-save-prompt-to-file` (CustomEvent<SavePromptToFileDetail>) when the user saves to a file.
 * Emits `jp-load-prompt-from-file` (CustomEvent) when the user picks a file to load.
 */

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import type SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type SaveSettingsDetail = { systemPrompt: string };
export type SavePromptToFileDetail = { systemPrompt: string };

@customElement("jp-settings-pane")
export class JpSettingsPane extends LitElement {
  /** Current system prompt value from the host. */
  @property() systemPrompt = "";
  /** Factory-default system prompt used for reset. */
  @property() defaultSystemPrompt = "";
  /** Path of the currently loaded/saved prompt file (empty string when none). */
  @property() promptFilePath = "";
  /** Error message from a file operation (empty string when none). */
  @property() fileOpError = "";
  /**
   * Incremented by the parent each time a file is loaded so that
   * willUpdate can force-sync _localPrompt from systemPrompt.
   */
  @property({ type: Number }) loadVersion = 0;

  @state() private _localPrompt = "";
  @state() private _settingsSaved = false;

  private _saveTimer: ReturnType<typeof setTimeout> | undefined;

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // Initialise the editable copy when the host sends settings for the first time.
    if (changed.has("systemPrompt") && !this._localPrompt) {
      this._localPrompt = this.systemPrompt;
    }
    // Force-sync when the parent increments loadVersion (user explicitly loaded a file).
    if (changed.has("loadVersion") && this.loadVersion > 0) {
      this._localPrompt = this.systemPrompt;
    }
  }

  static override styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .settings-pane {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
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
      width: 100%;
    }

    .settings-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }

    .file-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
      border-top: 1px solid var(--vscode-widget-border, #444);
      padding-top: 12px;
    }

    .file-path-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .file-path-label {
      opacity: 0.6;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .file-path-value {
      font-family: var(--vscode-editor-font-family, monospace);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vscode-foreground);
      opacity: 0.85;
      flex: 1;
      min-width: 0;
    }

    .file-buttons-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .save-ok {
      font-size: 12px;
      color: var(--sl-color-success-600, #2f9e44);
    }

    .file-error {
      font-size: 12px;
      color: var(--sl-color-danger-600, #e03131);
    }
  `;

  private _save = (): void => {
    this.dispatchEvent(
      new CustomEvent<SaveSettingsDetail>("jp-save-settings", {
        detail: { systemPrompt: this._localPrompt },
        bubbles: true,
        composed: true,
      }),
    );
    this._settingsSaved = true;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._settingsSaved = false;
    }, 2000);
  };

  private _reset = (): void => {
    this._localPrompt = this.defaultSystemPrompt;
  };

  private _saveToFile = (): void => {
    this.dispatchEvent(
      new CustomEvent<SavePromptToFileDetail>("jp-save-prompt-to-file", {
        detail: { systemPrompt: this._localPrompt },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _loadFromFile = (): void => {
    this.dispatchEvent(new CustomEvent("jp-load-prompt-from-file", { bubbles: true, composed: true }));
  };

  override render() {
    return html`
      <div class="settings-pane">
        <p class="pane-label">デフォルト設定</p>
        <sl-textarea
          label="システムプロンプト"
          rows="8"
          .value=${this._localPrompt}
          @sl-input=${(e: CustomEvent) => {
            this._localPrompt = (e.target as SlTextarea).value;
          }}
        ></sl-textarea>
        <div class="settings-actions">
          <sl-button variant="primary" @click=${this._save}>保存</sl-button>
          <sl-button variant="default" @click=${this._reset}>デフォルトに戻す</sl-button>
          ${this._settingsSaved ? html`<span class="save-ok">保存しました</span>` : nothing}
        </div>

        <div class="file-section">
          <p class="pane-label">ファイル操作</p>
          <div class="file-path-row">
            <span class="file-path-label">パス:</span>
            <span class="file-path-value" title=${this.promptFilePath || "(未選択)"}>
              ${this.promptFilePath || "(未選択)"}
            </span>
          </div>
          <div class="file-buttons-row">
            <sl-button variant="default" @click=${this._saveToFile}>ファイルに保存</sl-button>
            <sl-button variant="default" @click=${this._loadFromFile}>ファイルを選択して読み込み</sl-button>
          </div>
          ${this.fileOpError ? html`<span class="file-error">${this.fileOpError}</span>` : nothing}
        </div>
      </div>
    `;
  }
}
