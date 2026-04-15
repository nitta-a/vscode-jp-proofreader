/**
 * VS Code WebView API — singleton instance and shared message types.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ModelInfo = { id: string; name: string };

export type ReviewLevel = "ok" | "suggestion" | "error";
export type ReviewItem = {
  viewpoint: string;
  level: ReviewLevel;
  content: string;
  targetText: string;
  replacementText: string;
};

export type HostMsg =
  | { type: "models"; models: ModelInfo[] }
  | { type: "reviewChunk"; chunk: string }
  | { type: "reviewDone"; items?: ReviewItem[] }
  | { type: "reviewError"; message: string }
  | { type: "settings"; systemPrompt: string; defaultSystemPrompt: string; promptFilePath?: string }
  | { type: "urlContent"; text: string }
  | { type: "urlError"; message: string }
  | { type: "promptFileSaved"; path: string }
  | { type: "promptFileLoaded"; systemPrompt: string; path: string }
  | { type: "promptFileError"; message: string };

type WebviewToHostMsg =
  | { type: "requestModels" }
  | { type: "review"; text: string; modelId: string }
  | { type: "getSettings" }
  | { type: "setSettings"; systemPrompt: string }
  | { type: "savePromptToFile"; systemPrompt: string }
  | { type: "loadPromptFromFile" }
  | { type: "fetchUrl"; url: string }
  | { type: "focusText"; targetText: string };

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

interface VsCodeApi {
  postMessage(msg: WebviewToHostMsg): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode: VsCodeApi = acquireVsCodeApi();
