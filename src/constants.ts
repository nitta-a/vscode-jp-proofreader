/** Shared constants for the extension host. */

export const DEFAULT_SYSTEM_PROMPT = `以下の日本語テキストを校閲してください。
結果は必ず以下のJSON配列形式のみで返してください。余分な説明、前置き、コードブロック記号（\`\`\`など）は不要です。JSONのみを返してください。

[
  {
    "viewpoint": "観点名",
    "level": "ok",
    "content": "この観点についての説明"
  }
]

levelの値:
- "ok"         : 問題なし
- "suggestion" : 改善提案あり（必須ではない）
- "error"      : 要修正

必ず以下の4つの観点をすべて含めてください:
1. 誤字・脱字
2. 文法・表現
3. 冗長さ
4. 内容の明確さ`;

export const SYSTEM_PROMPT_KEY = "jp-proofreader.systemPrompt";
