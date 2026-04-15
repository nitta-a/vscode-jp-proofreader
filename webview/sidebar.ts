/**
 * JP Proofreader Sidebar — quick editor for project-specific custom rules / glossary.
 */

// Shoelace theme CSS
import "@shoelace-style/shoelace/dist/themes/dark.css";
import "@shoelace-style/shoelace/dist/themes/light.css";
// Shoelace components used in this view
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import type SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
// Lit
import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
// Shared types
import type { SidebarHostMsg, SidebarVsCodeApi } from "./vscode-api";

// Read Shoelace asset base path from the meta tag injected by the extension host.
setBasePath(document.querySelector<HTMLMetaElement>('meta[name="sl-base"]')?.content ?? "");

// Typed VS Code API for the sidebar context.
declare function acquireVsCodeApi(): SidebarVsCodeApi;
const sidebarVscode = acquireVsCodeApi();

@customElement("jp-sidebar-app")
class JpSidebarApp extends LitElement {
  @state() private _customRules = "";
  @state() private _ready = false;

  static override styles = css`
    :host {
      display: block;
      height: 100%;
      --sl-font-sans: var(--vscode-font-family, system-ui, sans-serif);
      --sl-color-primary-500: var(--vscode-button-background, #0e639c);
      --sl-color-primary-600: var(--vscode-button-background, #0e639c);
      --sl-color-primary-700: var(--vscode-button-hoverBackground, #1177bb);
      --sl-input-background-color: var(--vscode-input-background, #3c3c3c);
      --sl-input-color: var(--vscode-input-foreground, #cccccc);
      --sl-input-border-color: var(--vscode-input-border, #555555);
      --sl-input-focus-ring-color: var(--vscode-focusBorder, #007fd4);
      --sl-panel-background-color: var(--vscode-sideBar-background, #1e1e1e);
    }

    .container {
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      box-sizing: border-box;
    }

    .start-button {
      flex-shrink: 0;
    }

    sl-button[variant="primary"]::part(base) {
      width: 100%;
      justify-content: center;
    }

    sl-textarea {
      width: 100%;
      flex: 1;
    }

    .hint {
      font-size: 11px;
      opacity: 0.6;
      margin: 0;
      flex-shrink: 0;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this._handleMsg);
    sidebarVscode.postMessage({ type: "getSidebarData" });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this._handleMsg);
  }

  private readonly _handleMsg = (ev: MessageEvent<SidebarHostMsg>): void => {
    const msg = ev.data;
    if (msg.type === "sidebarData") {
      this._customRules = msg.customRules;
      this._ready = true;
    }
  };

  private _handleStartCheck = (): void => {
    sidebarVscode.postMessage({ type: "executeCommand", command: "jp-proofreader.check" });
  };

  private _handleChange = (e: Event): void => {
    const value = (e.target as SlTextarea).value;
    this._customRules = value;
    sidebarVscode.postMessage({ type: "updateCustomRules", rules: value });
  };

  override render() {
    if (!this._ready) {
      return html`<div class="container"></div>`;
    }
    return html`
      <div class="container">
        <sl-button class="start-button" variant="primary" @click=${this._handleStartCheck}>校閲を開始する</sl-button>
        <sl-textarea
          label="プロジェクト固有ルール / 用語集"
          help-text="校閲時に最優先で適用されます"
          placeholder="例: ユーザー → お客さま&#10;※1行に1つのルールを記述してください"
          rows="12"
          resize="auto"
          .value=${this._customRules}
          @sl-change=${this._handleChange}
        ></sl-textarea>
        <p class="hint">変更は自動的に保存されます</p>
      </div>
    `;
  }
}
