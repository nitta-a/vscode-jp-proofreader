# Copilot Instructions

## Overview

VS Code extension that provides Japanese proofreading capabilities, including grammar and style checks, directly within the editor.

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
│   ├── extension.ts              # Activation entry point; registers all commands and wires the pipeline
│   ├── types.ts                  # Shared TypeScript interfaces (CopilotUsageStats, ParsingContext, …)
│   ├── utils.ts                  # Shared helpers (e.g. todayDateString)
│   ├── globals.d.ts              # Ambient declarations for webview global (acquireVsCodeApi)
│   ├── ui/
│   │   ├── copilotUsagePanel.ts      # Singleton WebviewPanel (createOrShow pattern)
│   │   ├── copilotUsageHtml.ts       # Generates the HTML shell that loads the webview bundle
│   │   ├── copilotUsageTreeProvider.ts  # TreeDataProvider powering the "Key Performance Indicators" sidebar view
│   │   ├── dashboardMessages.ts      # Shared WebView ↔ Extension Host message types (HostToWebviewMessage, WebviewToHostMessage)
│   │   ├── dashboardPayload.ts       # Standalone buildDashboardPayload() function (no VS Code deps; unit-testable)
│   │   └── statusBarIndicator.ts
│   ├── events/
│   │   ├── eventSchema.ts
│   │   ├── eventStorage.ts
│   │   ├── eventTracker.ts
│   │   └── inlineCompletionWrapper.ts   # Real-time inline-completion tracking via provider interception
│   └── utils/
│       └── logPaths.ts          # findSessionRoot() — segment-based VS Code log directory locator
├── webview/                      # WebView frontend (compiled to dist/webview/ by tsconfig.webview.json)
│   └── dashboard.ts              # Main dashboard orchestrator: tab switching, Chart.js timeline, export handling
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
| Production bundle | `npm run package` (builds native addon, then minified bundle, no sourcemap) |
| Run tests | `npm test` (compiles tests + extension + lint, then `vscode-test`) |
| Lint only | `npm run lint` |

Output goes to `dist/extension.js` (CJS, `vscode` external) and `dist/webview/` (webview bundle, built from `webview/dashboard.ts` using `tsconfig.webview.json`).

## Key Conventions

- **Linter is Biome, not ESLint.** Config in `biome.json`; runs only on `src/**/*.ts`. Rules are non-recommended: `useBlockStatements`, `useNamingConvention`, `useThrowOnlyError`, `noDoubleEquals` (all `warn`).
- **Type-checking is separate from bundling.** `esbuild.js` never invokes `tsc`; type errors surface only via `check-types` / `watch:tsc`.
- **WebviewPanel CSP:** uses a per-request `nonce` to allow only the bundled webview script; `localResourceRoots` is limited to `dist/webview/`.
- **Error handling in parser:** every `fs` call is wrapped in `try/catch` that silently skips unreadable files/dirs — preserve this pattern.
- **HTML generation:** `src/ui/copilotUsageHtml.ts` generates the HTML shell that loads the webview bundle. `src/ui/dashboardPayload.ts` builds the data payload sent to the WebView via `postMessage`.
- **Dashboard messages:** always use the typed unions in `src/ui/dashboardMessages.ts` for WebView ↔ Host communication; never use ad-hoc string `type` fields.

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
