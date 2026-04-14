import * as assert from "node:assert";

import * as vscode from "vscode";

import { ProofreaderPanel } from "../src/proofreaderPanel.js";

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

function buildMockWebviewPanel(): vscode.WebviewPanel {
  const mockWebview = {
    html: "",
    cspSource: "https://test.vscode-cdn.net",
    options: {},
    asWebviewUri: (uri: vscode.Uri) => uri,
    onDidReceiveMessage: (
      _listener: (e: unknown) => void,
      _thisArg: unknown,
      disposables: vscode.Disposable[],
    ): vscode.Disposable => {
      const d = new vscode.Disposable(() => {});
      disposables?.push(d);
      return d;
    },
    postMessage: (_msg: unknown) => Promise.resolve(true),
  } as unknown as vscode.Webview;

  return {
    webview: mockWebview,
    onDidDispose: (_listener: () => void, _thisArg: unknown, disposables: vscode.Disposable[]): vscode.Disposable => {
      const d = new vscode.Disposable(() => {});
      disposables?.push(d);
      return d;
    },
    reveal: () => {},
    dispose: () => {},
    viewColumn: vscode.ViewColumn.One,
    active: true,
    visible: true,
    title: "Test",
  } as unknown as vscode.WebviewPanel;
}

suite("ProofreaderPanel", () => {
  let panel: ProofreaderPanel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let htmlToText: (html: string) => string;

  suiteSetup(() => {
    const context = buildMockContext();
    const mockPanel = buildMockWebviewPanel();
    panel = new ProofreaderPanel(mockPanel, context);
    // Access private method for testing
    htmlToText = (html: string) => (panel as unknown as Record<string, (h: string) => string>)._htmlToText(html);
  });

  suite("_htmlToText", () => {
    test("should return plain text unchanged", () => {
      assert.strictEqual(htmlToText("Hello World"), "Hello World");
    });

    test("should remove <script> tags and their content", () => {
      const result = htmlToText('<p>Text</p><script>alert("xss")</script>');
      assert.ok(!result.includes("<script>"), "should not contain <script>");
      assert.ok(!result.includes("alert"), "should not contain script content");
      assert.ok(result.includes("Text"), "should retain main text");
    });

    test("should remove <style> tags and their content", () => {
      const result = htmlToText("<p>Text</p><style>body { color: red; }</style>");
      assert.ok(!result.includes("<style>"), "should not contain <style>");
      assert.ok(!result.includes("color: red"), "should not contain style content");
      assert.ok(result.includes("Text"), "should retain main text");
    });

    test("should remove <head> tags and their content", () => {
      const result = htmlToText("<head><title>Page Title</title></head><body><p>Body</p></body>");
      assert.ok(!result.includes("Page Title"), "should not contain head content");
      assert.ok(result.includes("Body"), "should retain body content");
    });

    test("should convert block elements to newlines", () => {
      const result = htmlToText("<p>First</p><p>Second</p>");
      assert.ok(result.includes("First"), "should contain 'First'");
      assert.ok(result.includes("Second"), "should contain 'Second'");
      const newlineIndex = result.indexOf("\n");
      assert.ok(newlineIndex > -1, "should contain a newline between paragraphs");
    });

    test("should convert <br> to newline", () => {
      const result = htmlToText("Line one<br>Line two");
      assert.ok(result.includes("\n"), "should contain a newline");
      assert.ok(result.includes("Line one"), "should contain 'Line one'");
      assert.ok(result.includes("Line two"), "should contain 'Line two'");
    });

    test("should convert heading tags to newlines", () => {
      const result = htmlToText("<h1>Title</h1><p>Paragraph</p>");
      assert.ok(result.includes("Title"), "should contain heading text");
      assert.ok(result.includes("Paragraph"), "should contain paragraph text");
    });

    test("should remove remaining HTML tags", () => {
      const result = htmlToText('<span class="test">Hello</span>');
      assert.ok(!result.includes("<span"), "should not contain <span>");
      assert.ok(!result.includes("class="), "should not contain attributes");
      assert.strictEqual(result, "Hello");
    });

    test("should decode &amp; entity", () => {
      assert.strictEqual(htmlToText("A &amp; B"), "A & B");
    });

    test("should decode &lt; and &gt; entities", () => {
      assert.strictEqual(htmlToText("&lt;tag&gt;"), "<tag>");
    });

    test("should decode &quot; entity", () => {
      assert.strictEqual(htmlToText("Say &quot;hello&quot;"), 'Say "hello"');
    });

    test("should decode &#39; entity", () => {
      assert.strictEqual(htmlToText("it&#39;s"), "it's");
    });

    test("should decode &nbsp; as a regular space", () => {
      const result = htmlToText("Hello&nbsp;World");
      assert.strictEqual(result, "Hello World");
    });

    test("should compress 3 or more consecutive spaces to one", () => {
      const result = htmlToText("A   B");
      assert.strictEqual(result, "A B");
    });

    test("should compress 3 or more consecutive newlines to two", () => {
      const result = htmlToText("<p>A</p>\n\n\n<p>B</p>");
      const newlineMatches = result.match(/\n{3,}/);
      assert.strictEqual(newlineMatches, null, "should not have 3+ consecutive newlines");
    });

    test("should trim leading and trailing whitespace", () => {
      const result = htmlToText("  <p>Hello</p>  ");
      assert.ok(!result.startsWith(" "), "should not start with space");
      assert.ok(!result.endsWith(" "), "should not end with space");
    });

    test("should handle multiline script tags", () => {
      const input = "<p>Before</p><script>\nvar x = 1;\nvar y = 2;\n</script><p>After</p>";
      const result = htmlToText(input);
      assert.ok(!result.includes("var x"), "should remove multiline script content");
      assert.ok(result.includes("Before"), "should retain text before script");
      assert.ok(result.includes("After"), "should retain text after script");
    });

    test("should handle complex mixed HTML", () => {
      const input = `<head><title>Page</title></head>
<body>
  <h1>Heading</h1>
  <p>First paragraph with &amp; ampersand.</p>
  <script>console.log("skip");</script>
  <style>.red { color: red; }</style>
  <p>Second paragraph.</p>
</body>`;
      const result = htmlToText(input);
      assert.ok(!result.includes("Page"), "should remove title");
      assert.ok(result.includes("Heading"), "should contain heading");
      assert.ok(result.includes("First paragraph with & ampersand."), "should decode entities");
      assert.ok(!result.includes("skip"), "should remove script");
      assert.ok(!result.includes("color: red"), "should remove style");
      assert.ok(result.includes("Second paragraph."), "should contain second paragraph");
    });
  });
});
