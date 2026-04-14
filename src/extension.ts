import * as vscode from 'vscode';

/**
 * Placeholder proofreading function.
 * Performs simple checks on the provided Japanese text and returns a result message.
 */
function proofread(text: string): string {
    if (text.trim().length === 0) {
        return '文章が空です。';
    }

    const suggestions: string[] = [];

    // Placeholder check: warn when the text is very short
    if (text.trim().length < 10) {
        suggestions.push('文章が短すぎる可能性があります。');
    }

    // Placeholder check: remind users to end sentences with Japanese punctuation
    if (!/[。！？]$/.test(text.trim())) {
        suggestions.push('文末に句点（。）または感嘆符（！／？）を付けることを検討してください。');
    }

    if (suggestions.length === 0) {
        return '問題は見つかりませんでした。';
    }

    return suggestions.join('\n');
}

export function activate(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('jp-proofreader.check', () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showWarningMessage('アクティブなエディターが見つかりません。');
            return;
        }

        const text = editor.document.getText();
        const result = proofread(text);

        vscode.window.showInformationMessage(`校閲結果: ${result}`);
    });

    context.subscriptions.push(disposable);
}

export function deactivate(): void {
    // Nothing to clean up
}
