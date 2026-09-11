---
name: klbq-timeline-builder
description: 将卡拉彼丘剧情资料整理成目标角色的有来源事件时间线，支持明确日期、相对顺序、参与者、影响、事实与推断标记。用户要求梳理经历顺序、去重事件或检查剧情前后矛盾时使用。
---

# 卡拉彼丘时间线

由 Codex 从来源正文提取 `events`，每项包含 `date`、可选 `order`、`event`、`participants`、`impact`、`basis` 和 `citations`。对没有日期的事件使用“未明确”，通过 `order` 表达可靠的相对顺序，不推造年份。

运行 `node scripts/run.js '@timeline.json'` 排序、去重并验证来源。时间线用于支持背景摘要，不应整段复制进角色卡。
