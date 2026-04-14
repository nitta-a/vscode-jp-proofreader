// @ts-check
const esbuild = require("esbuild");
const { promises: fsp } = require("fs");
const { version } = require("./package.json");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location?.file}:${location?.line}:${location?.column}:`);
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outdir: "dist",
    outbase: "src",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });

  // Separate bundle for the WebView frontend (browser context, IIFE format).
  const webviewCtx = await esbuild.context({
    entryPoints: ["webview/dashboard.ts"],
    bundle: true,
    format: "iife",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "browser",
    outfile: "dist/webview/dashboard.js",
    logLevel: "silent",
    jsx: "automatic",
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    // Copy Shoelace assets once on start, then watch for JS/CSS changes.
    await copyShoelaceAssets();
    await ctx.watch();
    await webviewCtx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    await webviewCtx.rebuild();
    await webviewCtx.dispose();
    await copyShoelaceAssets();
  }
}

/** Copy Shoelace icons / assets to dist/webview/assets so the webview can load them. */
async function copyShoelaceAssets() {
  await fsp.mkdir("dist/webview", { recursive: true });
  await fsp.cp("node_modules/@shoelace-style/shoelace/dist/assets", "dist/webview/assets", {
    recursive: true,
    force: true,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
