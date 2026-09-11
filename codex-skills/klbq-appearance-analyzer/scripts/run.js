"use strict";

const fs = require("fs");
const path = require("path");
const FIELDS = ["hair", "eyes", "face", "body", "daily_clothing", "accessories", "overall_impression"];
function read(arg) { const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg; return JSON.parse(raw.replace(/^\uFEFF/, "")); }
try {
  const input = read(process.argv[2]);
  const errors = [], warnings = [], observations = {};
  if (!input.image?.url) errors.push("image.url 不能为空");
  if (input.image?.inspected !== true) errors.push("必须实际打开立绘后设置 image.inspected=true");
  if (!input.image?.source_page_url) errors.push("image.source_page_url 不能为空");
  for (const field of FIELDS) {
    const raw = input.observations?.[field];
    const value = String(raw?.value || "").trim();
    const confidence = Number(raw?.confidence);
    if (!value || /^(待视觉识别|未识别|未观察|未知|未记载)$/.test(value)) errors.push(`${field}: 缺少视觉观察`);
    if (!Number.isFinite(confidence) || confidence < 0.5 || confidence > 1) errors.push(`${field}: confidence 必须在 0.5 至 1 之间`);
    if (raw?.basis !== "visual") errors.push(`${field}: basis 必须为 visual`);
    observations[field] = { value, confidence: Number.isFinite(confidence) ? confidence : 0, basis: raw?.basis || null };
  }
  if (input.observations?.combat_clothing) errors.push("外貌字段不得包含 combat_clothing");
  if (input.identity_inferences?.length) errors.push("外貌分析不得包含年龄、种族、身份或性格推断");
  const result = { ok: errors.length === 0, character: input.character || null, image: input.image || {}, observations, errors, warnings };
  process.stdout.write(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 2;
} catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
