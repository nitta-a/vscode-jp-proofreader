import * as vscode from "vscode";
import * as assert from "node:assert";
import { ProofreaderViewProvider } from "../src/viewProvider.js";

function buildMockContext(): vscode.ExtensionContext {
  return {
    extensionUri: vscode.Uri.file("/tmp/test-ext"),
    globalState: {
      get: <T>(_key: string): T | undefined => undefined,
      update: (_key: string, _value: unknown) => Promise.resolve(),
      setKeysForSync: (_keys: readonly string[]) => {},
      keys: () => [],
    },
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function buildMockDiagnosticCollection(): vscode.DiagnosticCollection {
  return {
    name: "jp-proofreader",
    set: () => {},
    delete: () => {},
    clear: () => {},
    dispose: () => {},
  } as unknown as vscode.DiagnosticCollection;
}

function buildMockWebviewView(): {
  view: vscode.WebviewView;
  webview: { html: string; options: vscode.WebviewOptions };
} {
  const webview = {
    html: "",
    options: {} as vscode.WebviewOptions,
    onDidReceiveMessage: (
      _listener: (e: unknown) => void,
      _thisArg?: unknown,
      _disposables?: vscode.Disposable[],
    ): vscode.Disposable => new vscode.Disposable(() => {}),
    postMessage: (_msg: unknown) => Promise.resolve(true),
    asWebviewUri: (uri: vscode.Uri) => uri,
    cspSource: "https://test.vscode-cdn.net",
  };

  return {
    view: { webview } as unknown as vscode.WebviewView,
    webview,
  };
}

suite("ProofreaderViewProvider", () => {
  let provider: ProofreaderViewProvider;

  suiteSetup(() => {
    provider = new ProofreaderViewProvider(buildMockContext(), buildMockDiagnosticCollection());
  });

  test("resolveWebviewView should set webview HTML", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    assert.ok(webview.html.length > 0, "webview HTML should not be empty");
  });

  test("resolveWebviewView HTML should include DOCTYPE declaration", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    assert.ok(webview.html.includes("<!DOCTYPE html>"), "HTML should start with DOCTYPE");
  });

  test("resolveWebviewView HTML should include nonce-based Content-Security-Policy", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    assert.ok(webview.html.includes("Content-Security-Policy"), "HTML should contain CSP header");
    assert.ok(webview.html.includes("nonce-"), "HTML should contain a nonce");
  });

  test("resolveWebviewView HTML should include the open-panel button", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    assert.ok(webview.html.includes("btn-open"), "HTML should include btn-open element");
    assert.ok(webview.html.includes("openPanel"), "HTML should include openPanel message");
  });

  test("resolveWebviewView HTML should include JP Proofreader button text", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    assert.ok(webview.html.includes("JP Proofreader"), "HTML should include JP Proofreader text");
  });

  test("resolveWebviewView should enable scripts on the webview", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    assert.strictEqual((webview.options as vscode.WebviewOptions).enableScripts, true, "enableScripts should be true");
  });

  test("resolveWebviewView HTML nonce should be a 32-char hex string", () => {
    const { view, webview } = buildMockWebviewView();
    provider.resolveWebviewView(view);
    const match = webview.html.match(/nonce-([0-9a-f]+)/);
    assert.ok(match, "nonce should be found in HTML");
    assert.strictEqual(match[1].length, 32, "nonce should be 32 hex characters");
  });

  test("each resolveWebviewView call should generate a unique nonce", () => {
    const first = buildMockWebviewView();
    const second = buildMockWebviewView();
    provider.resolveWebviewView(first.view);
    provider.resolveWebviewView(second.view);
    const nonceA = first.webview.html.match(/nonce-([0-9a-f]+)/)?.[1];
    const nonceB = second.webview.html.match(/nonce-([0-9a-f]+)/)?.[1];
    assert.ok(nonceA, "first nonce should exist");
    assert.ok(nonceB, "second nonce should exist");
    assert.notStrictEqual(nonceA, nonceB, "each call should produce a different nonce");
  });
});
