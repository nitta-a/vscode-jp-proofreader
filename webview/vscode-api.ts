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
  | { type: "settings"; systemPrompt: string; defaultSystemPrompt: string }
  | { type: "urlContent"; text: string }
  | { type: "urlError"; message: string };

type WebviewToHostMsg =
  | { type: "requestModels" }
  | { type: "review"; text: string; modelId: string }
  | { type: "getSettings" }
  | { type: "setSettings"; systemPrompt: string }
  | { type: "fetchUrl"; url: string };

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

interface VsCodeApi {
  postMessage(msg: WebviewToHostMsg): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode: VsCodeApi = acquireVsCodeApi();
