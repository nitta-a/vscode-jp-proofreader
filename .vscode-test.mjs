import { defineConfig } from '@vscode/test-cli';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

const fromPath = process.env.VSCODE_EXECUTABLE_PATH;

export default defineConfig({
	files: 'out/test/**/*.test.js',
	...(fromPath ? { useInstallation: { fromPath } } : {}),
  // 例: 環境変数でパスが指定されている場合はそれを利用し、ダウンロードを回避する
  executablePath: process.env.VSCODE_BIN_PATH || undefined,
});
