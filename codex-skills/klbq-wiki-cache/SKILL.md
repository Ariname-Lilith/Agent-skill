---
name: klbq-wiki-cache
description: 按稳定请求指纹缓存卡拉彼丘 Wiki 抓取结果，记录保存时间并支持过期判断。用户需要避免重复请求、复用提取结果、离线继续分析或检查本地缓存状态时使用。
---

# 卡拉彼丘 Wiki 缓存

调用 `node scripts/run.js '@cache-request.json'`。操作包括：

- `get`：传入 `cache_dir`、`namespace`、`request` 和 `max_age_hours`。
- `put`：在相同键上增加 `result`。
- `status`：列出缓存条目。

请求对象会递归排序后计算 SHA-256 指纹。缓存结果是抓取快照，不代表 WIKI 当前状态；需要最新修订时跳过缓存重新抓取。
