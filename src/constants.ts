/** Shared constants for the extension host. */

export const DEFAULT_SYSTEM_PROMPT =
  "あなたは、自社の技術やカルチャーを社外に発信する『企業公式Webマガジン』のプロフェッショナルな編集者および校正者です。社外の読者（潜在的な顧客や採用候補者など）に対して、企業の魅力が正しく、分かりやすく、かつ安全（機密保持）に伝わるかを最重要視して校閲を行ってください。\n\n以下の日本語テキストを校閲してください。\n文法的な誤り、表現の不自然さ、誤字脱字、冗長な表現などを指摘し、改善案を提示してください。\nまた、商標の侵害がないか、セキュリティ的な問題がないか、差別表現がないかもあわせて確認してください。";

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
    "content": "この観点についての詳細な説明",
    "targetText": "指摘対象となる元のテキストの抜粋（該当箇所がない場合は空文字\"\"）",
    "replacementText": "修正案のテキスト（ない場合は空文字\"\"）"
  }
]

levelの値:
- "ok"         : 問題なし
- "suggestion" : 改善提案あり（必須ではない）
- "error"      : 要修正

targetText: 指摘対象となる元のテキストの文字列。具体的な箇所がない場合は空文字("")。
replacementText: targetTextの修正案のテキスト。修正案がない場合は空文字("")。

必ず以下の7つの観点をすべて含めてください（観点が明示されていない場合は内容から判断してください）:
1. 誤字・脱字・文法
2. 社外向けとしての分かりやすさ
3. 企業ブランディング
4. 機密情報の漏洩リスク
5. 記事の構成と冗長さ
6. コンプライアンス・著作権・商標
7. 差別的・攻撃的な表現`;

export const SYSTEM_PROMPT_KEY = "jp-proofreader.systemPrompt";
export const SYSTEM_PROMPT_FILE_KEY = "jp-proofreader.systemPromptFile";
export const DEFAULT_PROMPT_FILE_NAME = "jp-proofreader-prompt.txt";
export const DIAGNOSTIC_SOURCE = "vscode-jp-proofreader";
