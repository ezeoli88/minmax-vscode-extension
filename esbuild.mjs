import * as esbuild from "esbuild";
import { readFileSync } from "fs";

const isWatch = process.argv.includes("--watch");

// Extension host bundle (Node.js, CJS)
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
};

// Webview bundle (browser, ESM)
const webviewConfig = {
  entryPoints: ["src/webview/index.tsx"],
  bundle: true,
  outfile: "out/webview/index.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  minify: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

// Webview CSS
const cssConfig = {
  entryPoints: ["src/webview/styles/index.css"],
  bundle: true,
  outfile: "out/webview/index.css",
  minify: false,
};

if (isWatch) {
  const extCtx = await esbuild.context(extensionConfig);
  const webCtx = await esbuild.context(webviewConfig);
  const cssCtx = await esbuild.context(cssConfig);
  await Promise.all([extCtx.watch(), webCtx.watch(), cssCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
    esbuild.build(cssConfig),
  ]);
  console.log("Build complete.");
}
