"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const SKILLS_ROOT = path.resolve(__dirname, "..", "..");
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function readArg(arg) { if (!arg) throw new Error("Missing JSON argument"); const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg; return JSON.parse(raw.replace(/^\uFEFF/, "")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function runSkill(name, args, allowValidationFailure = false) {
  const script = path.join(SKILLS_ROOT, name, "scripts", "run.js");
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0 && !(allowValidationFailure && result.status === 2)) throw new Error(`${name} exited with ${result.status}: ${result.stdout || result.stderr}`);
  return result.stdout;
}
function rootOf(input) { return path.resolve(input.output_dir || input.workspace || "."); }
function manifestAt(root) { return path.join(root, "manifest.json"); }
function updateStage(root, name, status, artifacts = [], detail = null) { const manifest = readJson(manifestAt(root)); manifest.updated_at = new Date().toISOString(); manifest.stages[name] = { status, updated_at: manifest.updated_at, artifacts, detail }; writeJson(manifestAt(root), manifest); }
function cacheFile(root, namespace, request) { return path.join(root, "cache", `${crypto.createHash("sha256").update(JSON.stringify({ namespace, request })).digest("hex")}.json`); }
function extract(root, name, request, refresh, maxAgeHours) {
  const cache = cacheFile(root, name, request);
  if (!refresh && fs.existsSync(cache)) { const entry = readJson(cache); if ((Date.now() - Date.parse(entry.stored_at)) / 36e5 <= maxAgeHours) return { result: entry.result, cache_hit: true }; }
  const requestFile = path.join(root, "requests", `${name}.json`); writeJson(requestFile, request);
  const result = JSON.parse(runSkill(name, [`@${requestFile}`]).replace(/^\uFEFF/, ""));
  if (!result.ok) throw new Error(`${name}: ${result.error || "提取失败"}`);
  writeJson(cache, { schema_version: 2, namespace: name, request, stored_at: new Date().toISOString(), result });
  return { result, cache_hit: false };
}
function init(input) {
  if (!input.page_url) throw new Error("page_url 不能为空");
  const root = rootOf(input); for (const folder of ["raw", "work", "final", "requests", "cache"]) fs.mkdirSync(path.join(root, folder), { recursive: true });
  const config = { schema_version: 3, page_url: input.page_url, output_dir: root, max_pages: input.max_pages || 12, max_chars_per_page: input.max_chars_per_page || 24000, max_images: input.max_images || 8, thumbnail_width: input.thumbnail_width || 1600, min_chars: input.min_chars || 1200, max_chars: input.max_chars || 2400, include_relationships: input.include_relationships !== false, cache_max_age_hours: input.cache_max_age_hours ?? 168 };
  writeJson(path.join(root, "config.json"), config);
  const now = new Date().toISOString();
  writeJson(manifestAt(root), { schema_version: 3, character_input: input.page_url, created_at: now, updated_at: now, stages: { init: { status: "complete", updated_at: now, artifacts: ["config.json"] }, acquire: { status: "pending" }, prepare: { status: "pending" }, compile: { status: "pending" } } });
  return { ok: true, output_dir: root };
}
function acquire(input) {
  const root = rootOf(input), config = readJson(path.join(root, "config.json")); updateStage(root, "acquire", "running");
  try {
    const requests = {
      "klbq-basic-profile": { page_url: config.page_url, include_page_text: false, max_text_chars: 10000 },
      "klbq-related-profile": { page_url: config.page_url, max_pages: config.max_pages, max_chars_per_page: config.max_chars_per_page, include_keywords: "誓约,角色小传,档案馆,语音台词,剧情,羁绊,通讯,回归信,生日" },
      "klbq-portrait-finder": { page_url: config.page_url, include_gallery: true, max_images: config.max_images, thumbnail_width: config.thumbnail_width },
    };
    const artifacts = [], cache = {};
    for (const [name, request] of Object.entries(requests)) {
      const short = name === "klbq-basic-profile" ? "basic" : name === "klbq-related-profile" ? "related" : "portrait-finder";
      const rawFile = path.join(root, "raw", `${short}.json`);
      try {
        const item = extract(root, name, request, input.refresh === true, config.cache_max_age_hours);
        cache[name] = item.cache_hit;
        writeJson(rawFile, item.result);
      } catch (error) {
        if (input.refresh === true || !fs.existsSync(rawFile) || readJson(rawFile).ok !== true) throw error;
        cache[name] = "existing_raw_fallback";
        process.stderr.write(`${name} 临时失败，复用已有有效工件 ${rawFile}：${error.message}\n`);
      }
      artifacts.push(`raw/${short}.json`);
    }
    updateStage(root, "acquire", "complete", artifacts, { cache }); return { ok: true, output_dir: root, artifacts, cache };
  } catch (error) { updateStage(root, "acquire", "failed", [], error.message); throw error; }
}
function prepare(input) {
  const root = rootOf(input); updateStage(root, "prepare", "running");
  try {
    const basic = path.join(root, "raw", "basic.json"), related = path.join(root, "raw", "related.json"), portrait = path.join(root, "raw", "portrait-finder.json");
    if (![basic, related, portrait].every(fs.existsSync)) throw new Error("缺少 raw 抓取工件，请先执行 acquire");
    const normalized = JSON.parse(runSkill("klbq-source-normalizer", [`@${basic}`])); writeJson(path.join(root, "work", "normalized.json"), normalized);
    const analysis = JSON.parse(runSkill("klbq-character-analyzer", ["prepare", `@${related}`])); writeJson(path.join(root, "work", "analysis.json"), analysis);
    const sources = analysis.sources;
    const target = normalized.fields.name?.value || analysis.character?.inferred_base_title || "未记载";
    writeJson(path.join(root, "work", "timeline.json"), { sources, events: [] });
    writeJson(path.join(root, "work", "relationships.json"), { target, sources, relationships: [] });
    writeJson(path.join(root, "work", "dialogue.json"), { character: target, sources, quotes: [], addressing_evidence: [], conclusions: { language_style: "", addressing_rules: "" }, quote_contract: { scene: "introduction|duty|crisis|casual|emotion|intimacy|addressing|combat|other", selected_for_card: false } });
    const portraitResult = readJson(portrait), image = portraitResult.recommended_image;
    writeJson(path.join(root, "work", "appearance.json"), { character: target, image: image ? { url: image.url, thumbnail_url: image.thumbnail_url, width: image.width, height: image.height, source_page_url: image.source_pages?.[0]?.page_url || portraitResult.character?.canonical_url, inspected: false } : {}, observations: {} });
    const artifacts = ["work/normalized.json", "work/analysis.json", "work/timeline.json", "work/relationships.json", "work/dialogue.json", "work/appearance.json"];
    updateStage(root, "prepare", "complete", artifacts); return { ok: true, output_dir: root, target, artifacts, next: "实际查看立绘；逐页审阅 analysis.sources 全文并综合填写 analysis；跨场景核验 dialogue；从全部资料提取 relationships" };
  } catch (error) { updateStage(root, "prepare", "failed", [], error.message); throw error; }
}
function collectClaims(value, result = []) { if (Array.isArray(value)) value.forEach((item) => collectClaims(item, result)); else if (value && typeof value === "object") { if (typeof value.text === "string") result.push(value); Object.values(value).forEach((item) => collectClaims(item, result)); } return result; }
function compile(input) {
  const root = rootOf(input), config = readJson(path.join(root, "config.json")); updateStage(root, "compile", "running");
  try {
    const files = { normalized: path.join(root, "work", "normalized.json"), analysis: path.join(root, "work", "analysis.json"), appearance: path.join(root, "work", "appearance.json"), dialogue: path.join(root, "work", "dialogue.json"), relationships: path.join(root, "work", "relationships.json") };
    const normalized = readJson(files.normalized), analysis = readJson(files.analysis);
    const analysisReport = JSON.parse(runSkill("klbq-character-analyzer", ["validate", `@${files.analysis}`], true)); if (!analysisReport.ok) throw new Error(`角色分析校验失败：${analysisReport.errors.join("；")}`);
    const appearanceReport = JSON.parse(runSkill("klbq-appearance-analyzer", [`@${files.appearance}`], true)); if (!appearanceReport.ok) throw new Error(`外貌校验失败：${appearanceReport.errors.join("；")}`);
    const dialogueReport = JSON.parse(runSkill("klbq-dialogue-style-analyzer", [`@${files.dialogue}`], true)); if (!dialogueReport.ok) throw new Error(`台词校验失败：${dialogueReport.errors.join("；")}`);
    const relationshipReport = JSON.parse(runSkill("klbq-relationship-extractor", [`@${files.relationships}`], true));
    if (config.include_relationships !== false && (!relationshipReport.ok || !relationshipReport.relationships.length)) throw new Error(`关系校验失败：${relationshipReport.errors.join("；") || "至少需要一条有证据的初始关系"}`);
    const citationInput = path.join(root, "requests", "citations.json"); writeJson(citationInput, { sources: analysis.sources, claims: collectClaims(analysis.analysis) });
    const citationReport = JSON.parse(runSkill("klbq-source-citation", [`@${citationInput}`], true)); if (!citationReport.ok || citationReport.coverage.ratio < 1) throw new Error("声明证据定位率不足 100%");
    const field = (name) => normalized.fields[name]?.value || "未记载";
    const compilerInput = { character_name: field("name"), gender: field("gender"), faction: field("faction"), birthday: field("birthday"), zodiac: field("zodiac"), age: field("age"), height: field("height"), weight: field("weight"), activity_area: field("activity_area"), interests: field("interests"), diet: field("diet"), appearance: appearanceReport, background: analysis.analysis.background.summary, soul: analysis.analysis.soul.summary, language_style: dialogueReport.compiler.language_style, addressing_rules: dialogueReport.compiler.addressing_rules, dialogue_examples: dialogueReport.compiler.dialogue_examples, relationships: config.include_relationships !== false ? relationshipReport.relationships : [], min_chars: config.min_chars, max_chars: config.max_chars };
    const compilerRequest = path.join(root, "requests", "compiler.json"); writeJson(compilerRequest, compilerInput);
    const card = runSkill("klbq-character-card-compiler", [`@${compilerRequest}`]);
    if (card.trim().startsWith("{")) { const failure = JSON.parse(card); if (failure.ok === false) throw new Error(`${failure.error}：${(failure.details || []).join("；")}`); }
    fs.writeFileSync(path.join(root, "final", "character-card.md"), card, "utf8");
    writeJson(path.join(root, "final", "analysis-report.json"), analysisReport); writeJson(path.join(root, "final", "appearance-report.json"), appearanceReport); writeJson(path.join(root, "final", "dialogue-report.json"), dialogueReport); writeJson(path.join(root, "final", "relationship-report.json"), relationshipReport); writeJson(path.join(root, "final", "citation-report.json"), citationReport);
    const validatorInput = path.join(root, "requests", "validator.json"); writeJson(validatorInput, { card, min_chars: config.min_chars, max_chars: config.max_chars, require_relationships: config.include_relationships !== false, analysis_report: analysisReport, appearance_report: appearanceReport, dialogue_report: dialogueReport, relationship_report: relationshipReport, citation_report: citationReport, peer_cards: input.peer_cards || [] });
    const validation = JSON.parse(runSkill("klbq-card-validator", [`@${validatorInput}`], true)); writeJson(path.join(root, "final", "validation.json"), validation);
    const artifacts = ["final/character-card.md", "final/validation.json", "final/analysis-report.json", "final/appearance-report.json", "final/dialogue-report.json", "final/relationship-report.json", "final/citation-report.json"];
    updateStage(root, "compile", validation.ok ? "complete" : "failed", artifacts, validation); return { ok: validation.ok, output_dir: root, artifacts, validation };
  } catch (error) { updateStage(root, "compile", "failed", [], error.message); throw error; }
}
function relationships(input) {
  const outputDir = path.resolve(input.output_dir || "."), characters = [];
  for (const workspace of input.workspaces || []) { const file = path.join(path.resolve(workspace), "work", "relationships.json"); if (!fs.existsSync(file)) throw new Error(`缺少关系工件：${file}`); characters.push(readJson(file)); }
  const request = path.join(outputDir, "relationship-request.json"); writeJson(request, { characters });
  const report = JSON.parse(runSkill("klbq-relationship-extractor", ["aggregate", `@${request}`], true)); if (!report.ok) throw new Error(report.errors.join("；"));
  fs.mkdirSync(outputDir, { recursive: true }); writeJson(path.join(outputDir, "relationships.json"), report); fs.writeFileSync(path.join(outputDir, "relationships.md"), report.markdown, "utf8");
  return { ok: true, output_dir: outputDir, artifacts: ["relationships.json", "relationships.md"], character_count: report.characters.length, edge_count: report.edges.length };
}
function status(input) { const root = rootOf(input); return { ok: true, output_dir: root, manifest: readJson(manifestAt(root)) }; }
try { const command = process.argv[2], input = readArg(process.argv[3]); const handlers = { init, acquire, prepare, compile, relationships, status }; if (!handlers[command]) throw new Error("Command must be init, acquire, prepare, compile, relationships, or status"); process.stdout.write(JSON.stringify(handlers[command](input), null, 2)); } catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
