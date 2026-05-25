const esbuild = require("esbuild");

const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const isWatch = args.includes("--watch");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: "info",
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
      console.error("Build failed:", e);
      process.exit(1);
    }
  }
}

run();
