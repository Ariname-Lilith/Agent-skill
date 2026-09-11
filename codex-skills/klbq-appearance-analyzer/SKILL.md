---
name: klbq-appearance-analyzer
description: 强制实际打开卡拉彼丘默认立绘并记录发型与发色、眼睛、面部、体型观感、日常服装、饰品及整体气质，附视觉置信度和图片来源。用户要求生成角色卡外貌或核对立绘时使用。
---

# 卡拉彼丘外貌分析

先用 `klbq-portrait-finder` 选择默认或常服全身立绘，再通过图片查看工具实际打开原图或高分辨率缩略图。

填写 `hair`、`eyes`、`face`、`body`、`daily_clothing`、`accessories`、`overall_impression`。每项设置 `basis: "visual"` 和 0.5 至 1 的 `confidence`；图片记录 `url`、`source_page_url`、`inspected: true`。执行 `node scripts/run.js '@appearance.json'` 验收。

只写画面可见特征，不推断年龄、种族、身份或性格。不得保留占位字段。
