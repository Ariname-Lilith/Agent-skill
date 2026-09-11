---
name: klbq-basic-profile
description: 从卡拉彼丘 BWIKI 角色页提取姓名、性别、年龄、生日、身高、组织、身份、武器、声优等基础档案。用户提供角色名、页面 ID 或 wiki.biligame.com/klbq 页面 URL，要求查询、核实或整理角色基础资料时使用。
---

# 卡拉彼丘基础档案

在技能目录执行：

```powershell
node scripts/run.js '{"page_url":"米雪儿·李","include_page_text":false,"max_text_chars":8000}'
```

也可把 JSON 写入文件并传入 `@input.json`。`page_url` 接受角色名、数字页面 ID 或 BWIKI URL。

## 工作流

1. 运行脚本并读取 JSON 输出。
2. 优先整理 `likely_basic_fields`；字段歧义时交叉检查 `template_fields` 与 `table_fields`。
3. 需要正文佐证时设置 `include_page_text: true`。
4. 明确区分页面记载与推断。页面没有记载的事实字段写“未记载”，尤其不要从立绘或生日推算年龄。
5. 答复中附 `source.canonical_url`，并保留相互冲突的原始记载。

参数范围由脚本校验。网络请求仅访问卡拉彼丘 BWIKI 及其静态资源域名。
