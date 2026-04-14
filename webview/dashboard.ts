/**
 * JP Proofreader WebView frontend — runs inside VS Code's WebviewPanel.
 *
 * Layout: left pane (textarea) | right pane (AI review button + result area)
 *
 * Communication:
 * - Posts `review` message with `text` to the extension host.
 * - Listens for `reviewResult` messages from the extension host.
 */

// VS Code WebView API (injected as a global by VS Code)
declare function acquireVsCodeApi(): {
  postMessage(msg: { type: string; text?: string }): void;
};

type ReviewResultMessage = { type: "reviewResult"; result: string };

const vscode = acquireVsCodeApi();

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("input-text") as HTMLTextAreaElement | null;
  const button = document.getElementById("btn-review") as HTMLButtonElement | null;
  const resultArea = document.getElementById("review-result") as HTMLDivElement | null;

  if (!textarea || !button || !resultArea) {
    return;
  }

  button.addEventListener("click", () => {
    const text = textarea.value;
    if (!text.trim()) {
      resultArea.textContent = "テキストを入力してください。";
      return;
    }
    button.disabled = true;
    button.textContent = "レビュー中…";
    resultArea.textContent = "";
    vscode.postMessage({ type: "review", text });
  });

  window.addEventListener("message", (event: MessageEvent<ReviewResultMessage>) => {
    const msg = event.data;
    if (msg.type === "reviewResult") {
      button.disabled = false;
      button.textContent = "AIレビュー";
      resultArea.textContent = msg.result;
    }
  });
});
