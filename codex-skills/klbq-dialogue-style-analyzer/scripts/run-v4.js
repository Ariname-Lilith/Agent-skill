"use strict";

const fs = require("fs");
const path = require("path");

function read(arg) {
  const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg;
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}
function chars(value) { return Array.from(String(value || "")).length; }
function top(items, limit = 12) {
  const counts = new Map();
  items.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([text, count]) => ({ text, count }));
}

try {
  const input = read(process.argv[2]);
  const character = String(input.character || "").trim();
  const sourceIds = new Set((input.sources || []).map(source => source.id));
  const errors = [], warnings = [];
  const allowedScenes = new Set(["introduction", "duty", "crisis", "casual", "emotion", "intimacy", "addressing", "combat", "other"]);
  const quotes = (input.quotes || []).map((quote, index) => ({
    id: quote.id || `Q${index + 1}`,
    text: String(quote.text || "").trim(),
    context: String(quote.context || "").trim(),
    scene: String(quote.scene || "other"),
    selected_for_card: quote.selected_for_card === true,
    addressee: quote.addressee || null,
    speaker: String(quote.speaker || "").trim(),
    speaker_verified: quote.speaker_verified === true,
    evidence_excerpt: String(quote.evidence_excerpt || "").trim(),
    citation: quote.citation || null
  }));
  if (quotes.length < 6 || quotes.length > 16) errors.push("quotes 必须包含 6 至 16 条目标角色原句");
  quotes.forEach(quote => {
    if (!quote.text || !quote.context) errors.push(`${quote.id}: text 和 context 必填`);
    if (quote.speaker !== character || !quote.speaker_verified) errors.push(`${quote.id}: 必须确认说话者为 ${character}`);
    if (!quote.evidence_excerpt.includes(quote.text)) errors.push(`${quote.id}: evidence_excerpt 必须包含原句`);
    if (!quote.citation || !sourceIds.has(quote.citation)) errors.push(`${quote.id}: 引用缺失或无效`);
    if (!allowedScenes.has(quote.scene)) errors.push(`${quote.id}: scene 无效`);
    if (chars(quote.text) < 5 || quote.text === character || /^(卡拉彼丘|Strinova)$/i.test(quote.text)) errors.push(`${quote.id}: Logo、角色名播报或过短语句不能作为语言证据`);
  });
  const sceneCount = new Set(quotes.map(quote => quote.scene).filter(scene => scene !== "other")).size;
  if (sceneCount < 4) errors.push("quotes 至少覆盖 4 类语义场景");
  if (quotes.filter(quote => chars(quote.text) >= 12).length < 4) errors.push("至少 4 条台词需达到 12 字符以支持语言分析");
  if (quotes.reduce((sum, quote) => sum + chars(quote.text), 0) < 100) errors.push("台词总信息量不足 100 字符");
  const selected = quotes.filter(quote => quote.selected_for_card);
  if (selected.length < 3 || selected.length > 4) errors.push("selected_for_card 必须选出 3 至 4 条风格锚点原句");
  if (new Set(selected.map(quote => quote.scene)).size < 3) errors.push("风格锚点原句至少覆盖 3 类场景");

  const roleplayExamples = (input.roleplay_examples || []).map((item, index) => ({
    id: item.id || `E${index + 1}`,
    scenario: String(item.scenario || "").trim(),
    text: String(item.text || "").trim(),
    grounded_by: item.grounded_by || []
  }));
  if (roleplayExamples.length) {
    if (roleplayExamples.length < 3 || roleplayExamples.length > 4) errors.push("roleplay_examples 必须包含 3 至 4 条新写的情境台词");
    const banned = /^(?:获得角色|查看角色|选择角色|确认选择|确认准备|回合开场|对局胜利|对局失败|战斗胜利|战斗失败)$/;
    roleplayExamples.forEach(item => {
      if (!item.scenario || banned.test(item.scenario)) errors.push(`${item.id}: scenario 必须是角色扮演情境，不能使用游戏界面触发标签`);
      if (chars(item.text) < 8) errors.push(`${item.id}: 新写台词至少 8 字符`);
      if (!item.grounded_by.length || item.grounded_by.some(id => !quotes.some(quote => quote.id === id && quote.speaker_verified))) errors.push(`${item.id}: grounded_by 必须引用已核验原句`);
    });
    if (new Set(roleplayExamples.map(item => item.scenario)).size < 3) errors.push("新写台词至少覆盖 3 个不同角色扮演情境");
  }

  const conclusions = input.conclusions || {};
  if (chars(conclusions.language_style) < 120) errors.push("language_style 至少 120 字符");
  if (chars(conclusions.addressing_rules) < 50) errors.push("addressing_rules 至少 50 字符");
  const addressingEvidence = input.addressing_evidence || [];
  if (!addressingEvidence.length) errors.push("addressing_evidence 至少 1 条");
  addressingEvidence.forEach((item, index) => {
    const quote = quotes.find(candidate => candidate.id === item.quote_id);
    if (!item.term || !item.target || !quote) errors.push(`addressing_evidence/${index}: term、target、quote_id 必填且 quote_id 必须有效`);
    else if (!quote.text.includes(item.term)) errors.push(`addressing_evidence/${index}: term 必须真实出现在对应原句中`);
  });

  const total = quotes.reduce((sum, quote) => sum + chars(quote.text), 0);
  const endings = quotes.map(quote => quote.text.slice(-1)).filter(Boolean);
  const punctuation = quotes.flatMap(quote => quote.text.match(/[！？!?…~～]/g) || []);
  const dialogueExamples = roleplayExamples.length
    ? roleplayExamples.map(item => `${item.scenario}：${item.text}`).join("\n")
    : selected.map(quote => `${quote.context}：${quote.text}`).join("\n");
  const compiler = {
    language_style: String(conclusions.language_style || "").trim(),
    addressing_rules: String(conclusions.addressing_rules || "").trim(),
    dialogue_examples: dialogueExamples,
    roleplay_examples: roleplayExamples
  };
  const result = {
    ok: errors.length === 0,
    character,
    quote_count: quotes.length,
    scene_count: sceneCount,
    selected_quote_count: selected.length,
    roleplay_example_count: roleplayExamples.length,
    statistics: { average_length: quotes.length ? Math.round(total / quotes.length * 10) / 10 : 0, endings: top(endings), expressive_punctuation: top(punctuation) },
    conclusions,
    addressing_evidence: addressingEvidence,
    roleplay_examples: roleplayExamples,
    compiler,
    quotes,
    errors,
    warnings
  };
  process.stdout.write(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
