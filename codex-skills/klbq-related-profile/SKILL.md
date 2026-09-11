---
name: klbq-related-profile
description: 自动发现并提取卡拉彼丘 BWIKI 中角色的誓约、档案馆、小传、剧情、羁绊、语音、通讯、回归信和生日剧情。用户要求深挖人物经历、性格、关系、语言风格或角色扮演素材时使用。
---

# 卡拉彼丘关联档案

在技能目录执行：

```powershell
node scripts/run.js '{"page_url":"米雪儿·李","max_pages":12,"max_chars_per_page":16000,"include_keywords":"誓约,档案馆,小传,剧情,语音,回归信,羁绊,通讯,生日"}'
```

`page_url` 可为角色主页面或子页面，也可为角色名、页面 ID、BWIKI URL。大型 JSON 输入可通过 `@input.json` 传入。

## 工作流

1. 运行脚本；检查 `extracted_page_count` 和每页 `text_length_before_truncation`。
2. 若关键长页被截断，提高 `max_chars_per_page` 后重跑；允许范围为 2000 至 50000。
3. 按人物经历、关系、目标、心理矛盾、喜好、价值观、行为模式、语言与场景钩子归纳。
4. 每条结论关联到 `pages[].title` 和 `pages[].url`。
5. 将 WIKI 明确记载与基于多条资料的推断分栏表达，不把缺少来源的信息写成事实。

最多抓取 25 页。通过 `include_keywords` 缩小或扩展关联页面发现范围。
