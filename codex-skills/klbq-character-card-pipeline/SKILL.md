---
name: klbq-character-card-pipeline
description: 编排卡拉彼丘角色卡的全来源抓取、逐页审阅、事实归一化、跨来源经历与人格综合、真实台词核验、立绘观察、有证据关系提取、编译和语义验收。用户要求从 BWIKI 端到端生成、重建或批量验收可用于角色扮演的角色卡时使用。
---

# 卡拉彼丘角色卡流水线

所有命令在本技能目录执行，JSON 参数使用 `@file.json`。

1. `node scripts/run.js init '@request.json'`
2. `node scripts/run.js acquire '@request.json'`
3. `node scripts/run.js prepare '@request.json'`
4. 阅读 [references/synthesis-contract.md](references/synthesis-contract.md)，逐页审阅 `work/analysis.json` 的全部 `sources[].content`，填写 `source_review`、背景模型与角色灵魂模型。
5. 实际打开 `work/appearance.json` 指向的默认立绘，填写七项视觉观察并设置 `image.inspected=true`。
6. 从全部语音、通讯和剧情中选择 6 至 16 条跨场景原句，填写 `work/dialogue.json`；原句只作为语言风格和称谓的内部证据。依据角色灵魂与这些证据另写 3 至 4 条 `roleplay_examples`，覆盖不同角色扮演情境后入卡。
7. 综合全部来源填写 `work/relationships.json`，每条关系保留可定位证据。
8. `node scripts/run.js compile '@request.json'`。任一语义门禁失败都停止编译。

不得用固定前缀、固定字符数、关键词模板或单一页面代替综合判断。来源范围不受限制；必须先审阅全部已发现情报，再由模型归纳事实、因果、动机、行为与未知边界。正文和最终示例台词均使用自己的话；原文只进入内部 evidence、语言风格锚点和称谓证据。

默认输出五部分角色卡：基础身份、角色外貌、背景概述、角色灵魂、初始人际关系。明确设置 `include_relationships=false` 时可省略第五部分，并另行使用：

```powershell
node scripts/run.js relationships '@relationship-request.json'
```

缓存有效时从失败阶段恢复，不重复抓取。

