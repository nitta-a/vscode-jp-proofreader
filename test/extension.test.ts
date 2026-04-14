import * as assert from "node:assert";

import * as vscode from "vscode";

import { activate, deactivate } from "../src/extension.js";

suite("extension", () => {
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
