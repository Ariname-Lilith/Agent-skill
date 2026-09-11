---
name: klbq-portrait-finder
description: 从卡拉彼丘 BWIKI 角色主页面和画廊查找图片，按角色名、立绘关键词、尺寸、纵横比、格式及排除词评分。用户要求寻找角色立绘、全身图、默认外观或为视觉分析选择图片时使用。
---

# 卡拉彼丘立绘检索

在技能目录执行：

```powershell
node scripts/run.js '{"page_url":"米雪儿·李","include_gallery":true,"max_images":10,"thumbnail_width":1600}'
```

`page_url` 支持角色名、页面 ID 和 BWIKI URL；JSON 文件可用 `@input.json` 传入。

## 工作流

1. 运行脚本并查看 `recommended_image` 与 `candidates`。
2. 根据 `score_reasons`、宽高和来源页复核排名；自动评分不是视觉确认。
3. 需要外貌分析时，下载或直接打开 `url`/`thumbnail_url`，使用图像查看能力实际读取图片。
4. 输出候选图片链接、尺寸、分数和来源；标明最终选择依据。
5. 不根据图片推断年龄等未在资料中明确记载的事实。

`max_images` 范围为 1 至 30，`thumbnail_width` 范围为 400 至 4096。
