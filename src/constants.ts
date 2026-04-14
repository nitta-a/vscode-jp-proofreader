/** Shared constants for the extension host. */

export const DEFAULT_SYSTEM_PROMPT =
  "以下の日本語テキストを校閲してください。\n文法的な誤り、表現の不自然さ、誤字脱字、冗長な表現などを指摘し、改善案を提示してください。";

/**
 * Fixed second-phase prompt sent after streaming completes.
 * Converts the accumulated review text into a structured JSON array.
 * This prompt is never shown to or edited by the user.
 */
export const JSON_CONVERSION_PROMPT = `上記の校閲結果を、以下のJSON配列形式に変換してください。
コードブロック記号や余分な説明は不要です。JSON配列のみを返してください。

[
  {
    "viewpoint": "観点名",
    "level": "ok" または "suggestion" または "error",
    "content": "この観点についての詳細な説明"
  }
]

levelの値:
- "ok"         : 問題なし
- "suggestion" : 改善提案あり（必須ではない）
- "error"      : 要修正

必ず以下の4つの観点をすべて含めてください（観点が明示されていない場合は内容から判断してください）:
1. 誤字・脱字
2. 文法・表現
3. 冗長さ
4. 内容の明確さ`;

export const SYSTEM_PROMPT_KEY = "jp-proofreader.systemPrompt";
export const SYSTEM_PROMPT_FILE_KEY = "jp-proofreader.systemPromptFile";
export const DEFAULT_PROMPT_FILE_NAME = "jp-proofreader-prompt.txt";
