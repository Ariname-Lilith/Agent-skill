"use strict";

const fs = require("fs");
const path = require("path");
function input(arg) { const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg; return JSON.parse(raw.replace(/^\uFEFF/, "")); }
function rank(event, index) {
  if (Number.isFinite(Number(event.order))) return Number(event.order);
  const match = String(event.date || "").match(/(\d{4})(?:[-年/.](\d{1,2}))?(?:[-月/.](\d{1,2}))?/);
  return match ? Number(match[1]) * 10000 + Number(match[2] || 0) * 100 + Number(match[3] || 0) : 1e12 + index;
}
try {
  const data = input(process.argv[2]);
  const sourceIds = new Set((data.sources || []).map((source) => source.id));
  const errors = [], warnings = [], seen = new Set();
  const events = (data.events || []).map((event, index) => {
    const normalized = { id: event.id || `E${index + 1}`, date: event.date || "未明确", order: event.order ?? null, event: String(event.event || "").trim(), participants: event.participants || [], impact: String(event.impact || "").trim(), basis: event.basis || "explicit", citations: event.citations || [] };
    if (!normalized.event) errors.push(`${normalized.id}: event 不能为空`);
    if (!['explicit', 'inferred'].includes(normalized.basis)) errors.push(`${normalized.id}: basis 无效`);
    if (!normalized.citations.length) warnings.push(`${normalized.id}: 缺少引用`);
    normalized.citations.forEach((id) => { if (!sourceIds.has(id)) errors.push(`${normalized.id}: 未知来源 ${id}`); });
    const key = normalized.event.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) warnings.push(`${normalized.id}: 可能重复事件`); else seen.add(key);
    return { ...normalized, _rank: rank(normalized, index) };
  }).sort((a, b) => a._rank - b._rank).map(({ _rank, ...event }) => event);
  process.stdout.write(JSON.stringify({ ok: errors.length === 0, events, errors, warnings }, null, 2));
  if (errors.length) process.exitCode = 2;
} catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
