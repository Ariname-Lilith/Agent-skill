"use strict";

const fs = require("fs");
const path = require("path");

const FIELD_RULES = [
  ["name", /^(姓名|名字|本名|角色名)$/i],
  ["gender", /^(性别)$/i],
  ["age", /^(年龄)$/i],
  ["birthday", /^(生日|出生日期)$/i],
  ["zodiac", /^(星座)$/i],
  ["height", /^(身高)$/i],
  ["weight", /^(体重)$/i],
  ["faction", /^(所属|所属组织|组织|阵营|势力)$/i],
  ["activity_area", /^(活动区域|主要活动区域)$/i],
  ["occupation", /^(职业|身份|职业或身份|定位)$/i],
  ["weapon", /^(武器|主武器|使用武器)$/i],
  ["voice_actor", /^(声优|配音|中文配音|日文配音)$/i],
  ["codename", /^(代号|称号)$/i],
  ["nationality", /^(国籍|出身)$/i],
  ["species", /^(种族)$/i],
  ["interests", /^(兴趣爱好|兴趣|喜好|爱好|喜欢)$/i],
  ["diet", /^(饮食习惯|饮食偏好)$/i],
];

function readInput(arg) {
  if (!arg) throw new Error("Usage: node scripts/run.js '<json>' or '@input.json'");
  const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg;
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalField(key) {
  const normalized = clean(key).replace(/[：:]/g, "");
  const rule = FIELD_RULES.find(([, pattern]) => pattern.test(normalized));
  return rule ? rule[0] : `extra.${normalized || "unknown"}`;
}

function main() {
  const input = readInput(process.argv[2]);
  const basic = input.basic_profile || input;
  const source = basic.source || input.source || {};
  const candidates = [];

  if (source.title) add("姓名", String(source.title).split("/")[0], "source_title", 0);

  function add(field, value, origin, priority, sourceOverride) {
    const cleaned = clean(value);
    if (!cleaned || /^(未记载|未知|不详|暂无资料|—|-)$/i.test(cleaned)) return;
    candidates.push({
      field: canonicalField(field),
      original_field: clean(field),
      value: cleaned,
      origin,
      priority,
      source: sourceOverride || {
        pageid: source.pageid || null,
        title: source.title || null,
        url: source.canonical_url || source.url || null,
      },
    });
  }

  for (const [key, value] of Object.entries(basic.likely_basic_fields || {})) add(key, value, "likely_basic_fields", 1);
  for (const [key, value] of Object.entries(basic.template_fields || {})) add(key, value, "template_fields", 2);
  for (const pair of basic.table_fields || []) add(pair.key, pair.value, "table_fields", 3);
  for (const fact of input.facts || []) add(fact.field, fact.value, fact.origin || "manual_fact", 0, fact.source);

  const grouped = new Map();
  for (const item of candidates) {
    if (!grouped.has(item.field)) grouped.set(item.field, []);
    const values = grouped.get(item.field);
    const fingerprint = item.value.toLocaleLowerCase("zh-CN");
    const existing = values.find((candidate) => candidate.fingerprint === fingerprint);
    if (existing) {
      existing.evidence.push({ origin: item.origin, source: item.source });
      existing.priority = Math.min(existing.priority, item.priority);
    } else {
      values.push({
        value: item.value,
        fingerprint,
        priority: item.priority,
        evidence: [{ origin: item.origin, source: item.source }],
      });
    }
  }

  const fields = {};
  for (const [field, values] of grouped) {
    values.sort((a, b) => a.priority - b.priority);
    fields[field] = {
      status: values.length > 1 ? "conflict" : "confirmed",
      value: values[0].value,
      candidates: values.map(({ fingerprint, ...candidate }) => candidate),
    };
  }

  for (const field of ["name", "gender", "faction", "birthday", "zodiac", "age", "height", "weight", "activity_area", "interests", "diet"]) {
    if (!fields[field]) fields[field] = { status: "unrecorded", value: "未记载", candidates: [] };
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    schema_version: 1,
    source,
    fields,
    conflicts: Object.entries(fields).filter(([, value]) => value.status === "conflict").map(([field]) => field),
  }, null, 2));
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
