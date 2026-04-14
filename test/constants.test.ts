import * as assert from "node:assert";

import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY } from "../src/constants.js";

suite("constants", () => {
  test("DEFAULT_SYSTEM_PROMPT should be a non-empty string", () => {
    assert.strictEqual(typeof DEFAULT_SYSTEM_PROMPT, "string");
    assert.ok(DEFAULT_SYSTEM_PROMPT.length > 0);
  });

  test("DEFAULT_SYSTEM_PROMPT should contain Japanese proofreading instructions", () => {
    assert.ok(DEFAULT_SYSTEM_PROMPT.includes("日本語"), "should mention 日本語");
    assert.ok(DEFAULT_SYSTEM_PROMPT.includes("校閲"), "should mention 校閲");
  });

  test("SYSTEM_PROMPT_KEY should equal 'jp-proofreader.systemPrompt'", () => {
    assert.strictEqual(SYSTEM_PROMPT_KEY, "jp-proofreader.systemPrompt");
  });
});
