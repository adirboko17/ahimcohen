const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } = require("next/constants");

const loaded = { exports: {} };
const source = ts.transpileModule(readFileSync(resolve(__dirname, "../next.config.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
new Function("require", "exports", source)(require, loaded.exports);
const config = loaded.exports.default;

test("development compilers, ports and production builds use separate manifests", () => {
  const keys = ["PORT", "TURBOPACK", "NEXT_DIST_DIR"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.NEXT_DIST_DIR;
    delete process.env.TURBOPACK;
    process.env.PORT = "3100";
    const webpack = config(PHASE_DEVELOPMENT_SERVER).distDir;
    process.env.TURBOPACK = "1";
    const turbo = config(PHASE_DEVELOPMENT_SERVER).distDir;
    process.env.PORT = "3001";
    const secondPort = config(PHASE_DEVELOPMENT_SERVER).distDir;
    assert.equal(new Set([webpack, turbo, secondPort, config(PHASE_PRODUCTION_BUILD).distDir]).size, 4);
    assert.equal(config(PHASE_PRODUCTION_BUILD).distDir, config(PHASE_PRODUCTION_SERVER).distDir);
    assert.equal(secondPort, ".next-dev/turbopack-3001");
    process.env.NEXT_DIST_DIR = ".next-check";
    assert.equal(config(PHASE_DEVELOPMENT_SERVER).distDir, ".next-check");
    assert.equal(config(PHASE_PRODUCTION_BUILD).distDir, ".next-check");
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
