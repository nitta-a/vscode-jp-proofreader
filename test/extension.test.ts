import * as vscode from "vscode";
import * as assert from "node:assert";
import { activate, deactivate } from "../src/extension.js";

suite("extension", () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.all.find(
      (e) =>
        e.id.includes("vscode-jp-proofreader") ||
        (e.packageJSON as { name?: string })?.name === "vscode-jp-proofreader",
    );
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test("activate and deactivate should be exported functions", () => {
    assert.strictEqual(typeof activate, "function");
    assert.strictEqual(typeof deactivate, "function");
  });

  test("deactivate should not throw", () => {
    assert.doesNotThrow(() => deactivate());
  });

  test("jp-proofreader.check command should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("jp-proofreader.check"), "jp-proofreader.check command should be registered");
  });
});
