"use strict";

module.exports.runtime = {
  handler: async function ({
    page_url,
    include_page_text = false,
    max_text_chars = 10000,
  }) {
    const callerId = `${this.config.name}-v${this.config.version}`;

    try {
      const {
        resolvePage,
        parsePage,
        extractTemplateFields,
        extractTablePairs,
        stripHtml,
        truncate,
      } = require("./common.js");

      if (!page_url || !String(page_url).trim()) {
        return JSON.stringify(
          {
            ok: false,
            error: "page_url 不能为空。",
          },
          null,
          2
        );
      }

      this.introspect(`${callerId}：正在解析角色页面……`);

      const page = await resolvePage(page_url);

      this.introspect(
        `${callerId}：已解析为“${page.title}”，正在提取基础字段……`
      );

      const parsed = await parsePage(page, [
        "text",
        "wikitext",
        "sections",
        "displaytitle",
      ]);

      const templateFields = extractTemplateFields(parsed.wikitext);
      const tablePairs = extractTablePairs(parsed.html);

      const wantedFieldPattern =
        /(姓名|名字|本名|性别|年龄|生日|出生|身高|体重|血型|星座|职业|身份|所属|阵营|组织|国籍|种族|武器|声优|配音|英文名|代号|定位|兴趣|喜好|爱好|活动区域|饮食习惯|饮食偏好)/i;

      const likelyBasicFields = {};

      for (const [key, value] of Object.entries(templateFields)) {
        if (wantedFieldPattern.test(key)) {
          likelyBasicFields[key] = value;
        }
      }

      for (const pair of tablePairs) {
        if (wantedFieldPattern.test(pair.key)) {
          if (!likelyBasicFields[pair.key]) {
            likelyBasicFields[pair.key] = pair.value;
          }
        }
      }

      const result = {
        ok: true,
        source: {
          input: String(page_url),
          pageid: page.pageid,
          title: page.title,
          display_title: stripHtml(parsed.displaytitle),
          canonical_url: page.canonicalUrl,
        },
        likely_basic_fields: likelyBasicFields,
        template_fields: templateFields,
        table_fields: tablePairs,
        sections: parsed.sections.map((section) => ({
          index: section.index,
          level: section.level,
          title: section.line,
          anchor: section.anchor,
        })),
        notes: [
          "likely_basic_fields 是根据字段名自动筛选的结果。",
          "template_fields 和 table_fields 保留了更多原始字段，适合交给语言模型二次整理。",
          "WIKI未明确记载的年龄、性别等信息不应自行推断，应标记为“未记载”。",
        ],
      };

      if (include_page_text === true) {
        result.page_text = truncate(
          stripHtml(parsed.html),
          max_text_chars
        );
      }

      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error && error.message
        ? error.message
        : String(error);

      this.introspect(`${callerId}：提取失败：${message}`);
      this.logger(`${callerId} failed: ${message}`);

      return JSON.stringify(
        {
          ok: false,
          error: message,
          input: page_url || null,
        },
        null,
        2
      );
    }
  },
};
