/**
 * Settings pane — system prompt editor with save and reset actions.
 *
 * Emits `jp-save-settings` (CustomEvent<SaveSettingsDetail>) when the user saves.
 */

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import type SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type SaveSettingsDetail = { systemPrompt: string };

@customElement("jp-settings-pane")
export class JpSettingsPane extends LitElement {
  /** Current system prompt value from the host. */
  @property() systemPrompt = "";
  /** Factory-default system prompt used for reset. */
  @property() defaultSystemPrompt = "";

  @state() private _localPrompt = "";
  @state() private _settingsSaved = false;

  private _saveTimer: ReturnType<typeof setTimeout> | undefined;

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // Initialise the editable copy when the host sends settings for the first time.
    if (changed.has("systemPrompt") && !this._localPrompt) {
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
    }

    .settings-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }

    .save-ok {
      font-size: 12px;
      color: var(--sl-color-success-600, #2f9e44);
    }
  `;

  private _save(): void {
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
  }

  private _reset(): void {
    this._localPrompt = this.defaultSystemPrompt;
  }

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
      </div>
    `;
  }
}
