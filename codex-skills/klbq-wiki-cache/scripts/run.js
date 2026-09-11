"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
function read(arg) { const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg; return JSON.parse(raw.replace(/^\uFEFF/, "")); }
try {
  const input = read(process.argv[2]);
  const operation = input.operation;
  const cacheDir = path.resolve(input.cache_dir || ".klbq-cache");
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(stable({ namespace: input.namespace || "default", request: input.request || {} }))).digest("hex");
  const file = path.join(cacheDir, `${fingerprint}.json`);
  if (operation === "put") {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ schema_version: 1, namespace: input.namespace || "default", request: input.request || {}, stored_at: new Date().toISOString(), result: input.result }, null, 2));
    process.stdout.write(JSON.stringify({ ok: true, hit: true, fingerprint, file }, null, 2));
  } else if (operation === "get") {
    if (!fs.existsSync(file)) return process.stdout.write(JSON.stringify({ ok: true, hit: false, fingerprint, file }, null, 2));
    const entry = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    const ageHours = (Date.now() - Date.parse(entry.stored_at)) / 36e5;
    const fresh = ageHours <= Number(input.max_age_hours ?? 168);
    process.stdout.write(JSON.stringify({ ok: true, hit: fresh, stale: !fresh, age_hours: ageHours, fingerprint, file, entry: fresh || input.include_stale ? entry : undefined }, null, 2));
  } else if (operation === "status") {
    const files = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter((name) => name.endsWith(".json")) : [];
    process.stdout.write(JSON.stringify({ ok: true, cache_dir: cacheDir, entries: files.length, files }, null, 2));
  } else throw new Error("operation must be get, put, or status");
} catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
