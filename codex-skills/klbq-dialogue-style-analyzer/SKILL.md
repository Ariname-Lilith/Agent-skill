---
name: klbq-dialogue-style-analyzer
description: 从卡拉彼丘语音、通讯和剧情原文中逐句确认目标角色说话者、场景、称呼对象与证据，跨多种情绪和职责场景归纳语言风格并选择代表台词。用户要求还原说话方式、称谓规则或角色扮演示例台词时使用。
---

# 卡拉彼丘语言风格分析

阅读全部已发现语音、通讯与剧情来源，填写 6 至 16 条目标角色原句。不得机械选择页面前几条。

每条台词记录 `context`、`scene`、`speaker_verified`、`evidence_excerpt`、`citation` 和 `addressee`。`scene` 使用 introduction、duty、crisis、casual、emotion、intimacy、addressing、combat 或 other；至少覆盖四类。

排除 Logo、角色名播报、装备确认等低信息短句。选择 3 至 4 条跨场景原句作为风格锚点并设置 `selected_for_card=true`。这些原句留在内部报告中，不直接作为卡面示例。称谓证据中的 `term` 必须真实出现在对应原句中。

语言风格综合句长、礼貌程度、语气词、意象、直接或委婉程度及压力下变化；称谓规则只写有原句证据的对象，未明确部分直接标记未记载。

依据角色灵魂、语言规律和风格锚点，新写 3 至 4 条 `roleplay_examples`。每条包含角色扮演情境 `scenario`、角色可能说出的新台词 `text` 和支撑风格判断的 `grounded_by` 原句 ID。不得使用“获得角色”“查看角色”“确认准备”“选择角色”等游戏界面触发标签，也不得把 Wiki 原句换标签后直接复制入卡。

