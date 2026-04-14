/**
 * VS Code WebView API — singleton instance and shared message types.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ModelInfo = { id: string; name: string };

export type HostMsg =
  | { type: "models"; models: ModelInfo[] }
  | { type: "reviewChunk"; chunk: string }
  | { type: "reviewDone" }
  | { type: "reviewError"; message: string }
  | { type: "settings"; systemPrompt: string; defaultSystemPrompt: string };

type WebviewToHostMsg =
  | { type: "requestModels" }
  | { type: "review"; text: string; modelId: string }
  | { type: "getSettings" }
  | { type: "setSettings"; systemPrompt: string };

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

interface VsCodeApi {
  postMessage(msg: WebviewToHostMsg): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode: VsCodeApi = acquireVsCodeApi();
