"use strict";

const fs = require("fs"), path = require("path");
function read(arg) { const raw = arg.startsWith("@") ? fs.readFileSync(path.resolve(arg.slice(1)), "utf8") : arg; return JSON.parse(raw.replace(/^\uFEFF/, "")); }
function count(text) { return Array.from(String(text || "")).length; }
function section(card, heading, next) { const start = card.indexOf(heading); if (start < 0) return ""; const from = start + heading.length, end = next ? card.indexOf(next, from) : card.length; return card.slice(from, end < 0 ? card.length : end).trim(); }
function labels(text) { return [...text.matchAll(/^\s*-\s*\*{0,2}([^：\n*]+)\*{0,2}：/gmu)].map(match => match[1].trim()); }
function ngrams(text) { const compact = text.replace(/\s+/g, ""), set = new Set(); for (let i = 0; i <= compact.length - 12; i++) set.add(compact.slice(i, i + 12)); return set; }
function similarity(a, b) { const left = ngrams(a), right = ngrams(b); if (!left.size || !right.size) return 0; let common = 0; for (const item of left) if (right.has(item)) common++; return common / Math.min(left.size, right.size); }
function duplicateSentences(text) { const seen = new Set(), duplicates = []; for (const sentence of text.split(/[。！？!?\n]+/u).map(item => item.replace(/\s+/g, "").trim()).filter(item => item.length >= 24)) { if (seen.has(sentence)) duplicates.push(sentence); seen.add(sentence); } return duplicates; }

try {
  const input = read(process.argv[2]), card = String(input.card || "").trim();
  const min = Math.max(1200, Math.min(2600, Number(input.min_chars || 1200))), max = Math.max(min, Math.min(2600, Number(input.max_chars || 2400)));
  const errors = [], warnings = [];
  const headings = ["## 第一部分：基础身份", "## 第二部分：角色外貌", "## 第三部分：背景概述", "## 第四部分：角色灵魂"], relationshipHeading = "## 第五部分：初始人际关系";
  if (!card) errors.push("card 不能为空");
  headings.forEach(heading => { if (!card.includes(heading)) errors.push(`缺少章节：${heading}`); });
  if (input.require_relationships !== false && !card.includes(relationshipHeading)) errors.push(`缺少章节：${relationshipHeading}`);
  const length = count(card); if (length < min) errors.push(`角色卡为 ${length} 字符，少于 ${min}`); if (length > max) errors.push(`角色卡为 ${length} 字符，超过 ${max}`);
  const identity = section(card, headings[0], headings[1]), expectedIdentity = ["姓名", "性别", "阵营", "生日", "星座", "年龄", "身高", "体重", "住址", "兴趣爱好", "饮食习惯"], actualIdentity = labels(identity);
  if (JSON.stringify(actualIdentity) !== JSON.stringify(expectedIdentity)) errors.push(`基础身份字段必须有且仅有：${expectedIdentity.join("、")}`);
  const appearance = section(card, headings[1], headings[2]), expectedAppearance = ["发型与发色", "眼睛", "面部特征", "体型与身高观感", "服装", "饰品与辨识特征", "整体气质"], actualAppearance = labels(appearance);
  if (JSON.stringify(actualAppearance) !== JSON.stringify(expectedAppearance)) errors.push(`角色外貌字段必须有且仅有：${expectedAppearance.join("、")}`);
  if (/待视觉识别|未识别|未观察|【待/.test(appearance)) errors.push("角色外貌仍含视觉占位符");
  const background = section(card, headings[2], headings[3]), soul = section(card, headings[3], card.includes(relationshipHeading) ? relationshipHeading : null).split(/###\s*语言风格/)[0].trim();
  const noise = /BWIKI|媒体文件:|获得方式|需完成任务|累积使用|好感度加成|\d+\s*(?:完美|卓越)|技能数值|冷却时间|造成\d+点伤害|角色故事导航|更新改动历史/, meta = /已核验语音|来源显示|引用显示|根据(?:Wiki|BWIKI|页面|资料)|本角色卡|生成过程/;
  if (noise.test(background) || noise.test(soul)) errors.push("背景或角色灵魂混入任务、礼物、技能、媒体或导航噪声");
  if (meta.test(background) || meta.test(soul)) errors.push("背景或角色灵魂混入来源说明或生成过程元话语");
  if (count(background) < 260) errors.push("背景概述过短"); if (count(soul) < 380) errors.push("角色灵魂过短");
  if (duplicateSentences(soul).length) errors.push("角色灵魂存在重复长句"); if (/角色扮演时|玩家|用户|你应该|应当扮演/.test(soul)) errors.push("角色灵魂必须使用第三人称人物描述");
  const dialogue = section(card, "### 示例台词", card.includes(relationshipHeading) ? relationshipHeading : null), quoteTexts = [...dialogue.matchAll(/[“"](.+?)[”"]/gu)].map(match => match[1].trim());
  if (quoteTexts.length < 3 || quoteTexts.length > 4) errors.push("示例台词必须包含 3 至 4 条情境台词");
  const dialogueReport = input.dialogue_report, roleplayExamples = dialogueReport?.roleplay_examples || [];
  if (roleplayExamples.length) {
    const expected = new Set(roleplayExamples.map(item => String(item.text || "").trim()));
    quoteTexts.forEach(quote => { if (!expected.has(quote)) errors.push(`示例台词未通过情境创作校验：${quote}`); });
    if (roleplayExamples.length < 3 || roleplayExamples.length > 4 || dialogueReport.roleplay_example_count !== roleplayExamples.length) errors.push("情境创作台词报告不完整");
    if (/^\s*-\s*(?:获得角色|查看角色|选择角色|确认选择|确认准备|回合开场|对局胜利|对局失败|战斗胜利|战斗失败)：/mu.test(dialogue)) errors.push("示例台词使用了游戏界面触发标签，而非角色扮演情境");
  } else {
    const evidenceQuotes = new Set((dialogueReport?.quotes || []).filter(quote => quote.speaker_verified === true).map(quote => String(quote.text || "").trim()));
    quoteTexts.forEach(quote => { if (!evidenceQuotes.has(quote)) errors.push(`示例台词缺少说话者验证：${quote}`); });
  }
  if (!dialogueReport?.ok || dialogueReport.quote_count < 6 || dialogueReport.scene_count < 4 || dialogueReport.selected_quote_count < 3) errors.push("台词报告未达到多场景语义覆盖要求");
  if (!input.analysis_report?.ok) errors.push("缺少通过校验的综合人物分析报告"); if (!input.appearance_report?.ok) errors.push("缺少通过校验的外貌报告");
  if (input.citation_report?.coverage?.ratio < 1) errors.push(`声明证据定位率不足 100%：${Math.round((input.citation_report?.coverage?.ratio || 0) * 100)}%`);
  if (input.require_relationships !== false) { const relations = section(card, relationshipHeading, null), items = labels(relations); if (!input.relationship_report?.ok || !input.relationship_report.relationships?.length) errors.push("缺少通过校验的初始关系报告"); if (items.length < 1) errors.push("初始人际关系至少 1 条"); }
  for (const peer of input.peer_cards || []) { const ratio = similarity(section(card, headings[3], card.includes(relationshipHeading) ? relationshipHeading : null), section(String(peer.card || ""), headings[3], String(peer.card || "").includes(relationshipHeading) ? relationshipHeading : null)); if (ratio >= 0.45) errors.push(`与角色“${peer.character || "未知"}”的角色灵魂相似度过高：${Math.round(ratio * 100)}%`); }
  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5), result = { ok: errors.length === 0, score, char_count: length, min_chars: min, max_chars: max, errors, warnings };
  process.stdout.write(JSON.stringify(result, null, 2)); if (errors.length) process.exitCode = 2;
} catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
