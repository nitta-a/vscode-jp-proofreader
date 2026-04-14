# Copilot Instructions

## Overview

VS Code extension that provides Japanese proofreading capabilities using GitHub Copilot LLM, including grammar checks, style improvements, and structured per-viewpoint feedback, directly within the editor.

## Directory Structure

```
vscode-jp-proofreader/
├── .github/
│   ├── copilot-instructions.md   # This file — agent guidance and conventions
│   └── workflows/
│       ├── ci.yml                # CI: type-check, lint, test on push/PR
│       └── release.yml           # Publish to VS Code Marketplace on tag push
├── images/                       # Extension icon and screenshot assets
├── src/
│   ├── constants.ts              # DEFAULT_SYSTEM_PROMPT, JSON_CONVERSION_PROMPT, SYSTEM_PROMPT_KEY
│   ├── extension.ts              # Activation entry point: registers WebviewViewProvider, command, and Copilot chat participant
│   ├── proofreaderPanel.ts       # Singleton WebviewPanel (createOrShow pattern): LM API calls, URL fetch, HTML generation
│   └── viewProvider.ts           # Activity bar sidebar WebviewView: renders a button that opens the main panel
├── webview/                      # WebView frontend (compiled to dist/webview/ by tsconfig.webview.json)
│   ├── components/
│   │   ├── review-pane.ts        # Review UI: text input, URL loader, model selector, result accordion (jp-review-pane)
│   │   └── settings-pane.ts      # Settings UI: system prompt editor with save/reset (jp-settings-pane)
│   ├── dashboard.ts              # Root Lit component (jp-proofreader-app): tab switching, host↔webview message routing
│   ├── tsconfig.json             # TypeScript compiler options for the webview bundle
│   └── vscode-api.ts             # VS Code API singleton (acquireVsCodeApi) and shared message types (HostMsg, ReviewItem, ModelInfo)
├── test/                         # Mocha/vscode-test test files (*.test.ts)
├── dist/                         # Build output — extension.js + webview/ (CJS bundle, git-ignored)
├── biome.json                    # Biome linter + formatter config
├── esbuild.js                    # esbuild bundler script (dev and production modes)
├── package.json                  # Extension manifest, commands, configuration, scripts
├── tsconfig.json                 # TypeScript compiler options (target: ES2024, module: NodeNext)
└── tsconfig.webview.json         # TypeScript compiler options for the webview bundle
```

## Build & Dev Workflow

| Task | Command |
|---|---|
| One-shot dev build | `npm run compile` (type-check → lint → esbuild) |
| Watch mode (dev) | `npm run watch` (parallel esbuild + tsc via `npm-run-all`) |
| Production bundle | `npm run package` (minified bundle, no sourcemap) |
| Run tests | `npm test` (compiles tests + extension + lint, then `vscode-test`) |
| Lint only | `npm run lint` |

Output goes to `dist/extension.js` (CJS, `vscode` external) and `dist/webview/` (webview bundle, built from `webview/dashboard.ts` using `tsconfig.webview.json`).

## Key Conventions

- **Linter is Biome, not ESLint.** Config in `biome.json`; runs on `./src` and `./test`. Rules: `useBlockStatements`, `useNamingConvention`, `useThrowOnlyError`, `noDoubleEquals` (all `warn`).
- **Type-checking is separate from bundling.** `esbuild.js` never invokes `tsc`; type errors surface only via `check-types` / `watch:tsc`.
- **WebviewPanel CSP:** uses a per-request `nonce` to allow only the bundled webview script; `localResourceRoots` is limited to `dist/webview/`.
- **Two-phase review:** Phase 1 streams the LLM review text chunk-by-chunk to the webview. Phase 2 sends a standalone conversion request (`JSON_CONVERSION_PROMPT`) to transform the review into a structured JSON array of `ReviewItem` objects.
- **HTML generation:** `src/proofreaderPanel.ts#_buildHtml()` generates the HTML shell that loads the webview bundle and injects the Shoelace asset base path via a `<meta name="sl-base">` tag.
- **Shared message types:** always use the typed unions in `webview/vscode-api.ts` (`HostMsg`, `WebviewToHostMsg`) for WebView ↔ Host communication; never use ad-hoc string `type` fields.
- **System prompt storage:** the user-customisable system prompt is persisted with `context.globalState` under the key `SYSTEM_PROMPT_KEY`; defaults to `DEFAULT_SYSTEM_PROMPT` when not set.
- **URL fetch:** `src/proofreaderPanel.ts#_fetchUrl()` fetches a URL via Node's `http`/`https` and strips HTML to plain text before sending it to the webview. Redirects are followed up to 5 times.

## Adding New Commands

1. Register in `package.json` under `contributes.commands`.
2. Call `context.subscriptions.push(vscode.commands.registerCommand(...))` in `activate()`.
3. No activation events needed — `activationEvents: []` (VS Code 1.109+ auto-activates).

## Post-Implementation Checks


## Release Preparation Checklist

Before creating a release or publishing a new version, always:

- Update the **README.md** to reflect any new features, changes, or usage instructions.
- Ensure all documentation is up to date and accurate.

After making any code changes, always run the following commands in order and fix any errors before finishing:

```bash
npm run check-types
npm run lint
npm run format
xvfb-run -a npm test
```

- **`npm run check-types`** — TypeScript type-check (no emit). Fix all type errors before proceeding.
- **`npm run lint`** — Biome linter on `src/**/*.ts`. Fix or suppress all warnings/errors.
- **`npm run format`** — Biome formatter check on `src/**/*.ts`. Run `npm run format:fix` to auto-fix formatting issues.
- **`xvfb-run -a npm test`** — Compiles tests and runs the full test suite via `vscode-test`. **All tests must pass.** VS Code requires a display; use `xvfb-run -a` in headless environments (CI uses this too). Do **not** skip or ignore test failures.
