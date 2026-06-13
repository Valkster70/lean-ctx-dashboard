const esbuild = require("esbuild");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const isWatch = args.includes("--watch");

const buildOptions = {
  stdin: {
    contents: fs.readFileSync(path.join(__dirname, "src", "extension.ts"), "utf8"),
    resolveDir: path.join(__dirname, "src"),
    sourcefile: "extension.ts",
    loader: "ts",
  },
  bundle: true,
  outfile: path.join(__dirname, "dist", "extension.js"),
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: "silent",
};

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    try {
      await esbuild.build(buildOptions);
      console.log("Build completed successfully.");
    } catch (e) {
      console.warn("esbuild unavailable in this environment; falling back to TypeScript emit.");
      buildWithTypeScript();
    }
  }
}

function buildWithTypeScript() {
  childProcess.execFileSync(process.execPath, [
    path.join(__dirname, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    "./",
  ], {
    cwd: __dirname,
    stdio: "inherit",
  });

  const outDir = path.join(__dirname, "out");
  const distDir = path.join(__dirname, "dist");
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.cpSync(outDir, distDir, { recursive: true });
  console.log("Build completed successfully with TypeScript fallback.");
}

run();
