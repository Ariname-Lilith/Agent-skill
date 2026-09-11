"use strict";

const fs = require("fs");
const path = require("path");

async function main() {
  const rawArg = process.argv[2];
  if (!rawArg) throw new Error("Usage: node scripts/run.js '<json>' or '@input.json'");
  const raw = (rawArg.startsWith("@")
    ? fs.readFileSync(path.resolve(rawArg.slice(1)), "utf8")
    : rawArg).replace(/^\uFEFF/, "");
  const input = JSON.parse(raw);
  const runtime = require("./handler.js").runtime;
  const context = Object.assign(Object.create(runtime), {
    config: { name: "klbq-basic-profile", version: "1.0.0" },
    introspect: (message) => process.stderr.write(`${message}\n`),
    logger: (message) => process.stderr.write(`${message}\n`),
  });
  process.stdout.write(await runtime.handler.call(context, input));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
