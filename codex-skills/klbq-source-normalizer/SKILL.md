---
name: klbq-source-normalizer
description: 归一化卡拉彼丘 BWIKI 的姓名、性别、阵营、生日、星座、年龄、身高、体重、活动区域、兴趣爱好和饮食习惯，并为候选值保留页面级来源。用户要求建立角色卡基础身份事实表或检查资料冲突时使用。
---

# 卡拉彼丘来源归一化

运行 `node scripts/run.js '@basic.json'`。也可传入 `{ "basic_profile": {...}, "facts": [...] }`，用 `facts` 加入人工核实资料。

读取输出的 `fields`：`confirmed` 可直接使用，`conflict` 必须对照 `candidates[].evidence` 人工裁决，`unrecorded` 保持“未记载”。不要静默覆盖冲突。归一化只处理事实结构，不承担人物性格推断。
