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
  line: number;
};

export type HostMsg =
  | { type: "models"; models: ModelInfo[] }
  | { type: "reviewChunk"; chunk: string }
  | { type: "reviewDone"; items?: ReviewItem[] }
  | { type: "reviewError"; message: string }
  | { type: "settings"; systemPrompt: string; defaultSystemPrompt: string; promptFilePath?: string; customRules?: string }
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
  | { type: "updateSettings"; customRules: string }
  | { type: "savePromptToFile"; systemPrompt: string }
  | { type: "loadPromptFromFile" }
  | { type: "fetchUrl"; url: string }
  | { type: "focusText"; line: number };

export type SidebarToHostMsg =
  | { type: "getSidebarData" }
  | { type: "updateCustomRules"; rules: string }
  | { type: "executeCommand"; command: string };

export type SidebarHostMsg = { type: "sidebarData"; customRules: string };

export interface SidebarVsCodeApi {
  postMessage(msg: SidebarToHostMsg): void;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

interface VsCodeApi {
  postMessage(msg: WebviewToHostMsg): void;
}

interface SidebarVsCodeApi {
  postMessage(msg: SidebarToHostMsg): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode: VsCodeApi = acquireVsCodeApi();
