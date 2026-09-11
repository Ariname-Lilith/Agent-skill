"use strict";

module.exports.runtime = {
  handler: async function ({
    page_url,
    max_pages = 12,
    max_chars_per_page = 16000,
    include_keywords = "誓约,档案馆,小传,剧情,语音,回归信,羁绊,通讯,生日",
  }) {
    const callerId = `${this.config.name}-v${this.config.version}`;

    try {
      const {
        resolvePage,
        parsePage,
        normalizeLinkTitle,
        stripHtml,
        truncate,
        clampNumber,
        extractTemplateFields,
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

      const pageLimit = clampNumber(max_pages, 1, 25, 12);
      const charLimit = clampNumber(
        max_chars_per_page,
        2000,
        50000,
        16000
      );

      const keywords = String(include_keywords || "")
        .split(/[,，、|]/)
        .map((item) => item.trim())
        .filter(Boolean);

      if (keywords.length === 0) {
        keywords.push(
          "誓约",
          "档案馆",
          "小传",
          "剧情",
          "语音",
          "回归信",
          "羁绊"
        );
      }

      this.introspect(`${callerId}：正在解析入口页面……`);

      const entryPage = await resolvePage(page_url);
      const entryParsed = await parsePage(entryPage, [
        "text",
        "wikitext",
        "links",
        "sections",
        "displaytitle",
      ]);

      // 如果入口是“角色名/誓约”等子页面，则取斜杠前部分作为角色名。
      // “剧情故事/角色名……”则尝试从页面标题和正文中保留入口页面本身。
      const characterBaseTitle = entryPage.title.includes("/")
        ? entryPage.title.split("/")[0]
        : entryPage.title;

      const candidateTitles = new Set();
      candidateTitles.add(entryPage.title);

      // 常见子页面，即使角色主页面没有显式链接也尝试发现。
      const conventionalTitles = [
        characterBaseTitle,
        `${characterBaseTitle}/誓约`,
        `${characterBaseTitle}/档案馆`,
        `${characterBaseTitle}/语音台词`,
        `${characterBaseTitle}/画廊`,
      ];

      for (const title of conventionalTitles) {
        candidateTitles.add(title);
      }

      const allLinks = entryParsed.links
        .map(normalizeLinkTitle)
        .filter(Boolean);

      for (const title of allLinks) {
        const belongsToCharacter =
          title === characterBaseTitle ||
          title.startsWith(`${characterBaseTitle}/`) ||
          (
            title.startsWith("剧情故事/") &&
            title.includes(characterBaseTitle)
          );

        const containsKeyword = keywords.some((keyword) =>
          title.includes(keyword)
        );

        if (belongsToCharacter && containsKeyword) {
          candidateTitles.add(title);
        }
      }

      const resolvedPages = [];
      const seenPageIds = new Set();

      for (const title of candidateTitles) {
        if (resolvedPages.length >= pageLimit) break;

        try {
          const page = await resolvePage(title);

          if (seenPageIds.has(page.pageid)) continue;
          seenPageIds.add(page.pageid);
          resolvedPages.push(page);
        } catch {
          // 常见子页面可能不存在，静默跳过。
        }
      }

      // 先抓取第一轮页面，再从其中发现剧情故事等第二层链接。
      const firstRoundParsed = [];

      for (const page of resolvedPages) {
        this.introspect(
          `${callerId}：正在提取 ${page.title}……`
        );

        const parsed =
          page.pageid === entryPage.pageid
            ? entryParsed
            : await parsePage(page, [
                "text",
                "wikitext",
                "links",
                "sections",
                "displaytitle",
              ]);

        firstRoundParsed.push({ page, parsed });
      }

      if (resolvedPages.length < pageLimit) {
        for (const item of firstRoundParsed) {
          const links = item.parsed.links
            .map(normalizeLinkTitle)
            .filter(Boolean);

          for (const title of links) {
            if (resolvedPages.length >= pageLimit) break;

            const isCharacterStory =
              title.startsWith("剧情故事/") &&
              title.includes(characterBaseTitle);

            const isRelatedChildPage =
              title.startsWith(`${characterBaseTitle}/`) &&
              keywords.some((keyword) => title.includes(keyword));

            if (!isCharacterStory && !isRelatedChildPage) continue;

            try {
              const page = await resolvePage(title);

              if (seenPageIds.has(page.pageid)) continue;

              seenPageIds.add(page.pageid);
              resolvedPages.push(page);
            } catch {
              // 忽略不存在或无法访问的页面。
            }
          }
        }
      }

      const extractedPages = [];
      const alreadyParsed = new Map(
        firstRoundParsed.map((item) => [item.page.pageid, item.parsed])
      );

      for (const page of resolvedPages.slice(0, pageLimit)) {
        let parsed = alreadyParsed.get(page.pageid);

        if (!parsed) {
          this.introspect(
            `${callerId}：正在提取关联剧情 ${page.title}……`
          );

          parsed = await parsePage(page, [
            "text",
            "wikitext",
            "links",
            "sections",
            "displaytitle",
          ]);
        }

        const fullText = stripHtml(parsed.html);

        extractedPages.push({
          pageid: page.pageid,
          title: page.title,
          display_title: stripHtml(parsed.displaytitle),
          url: page.canonicalUrl,
          sections: parsed.sections.map((section) => ({
            index: section.index,
            level: section.level,
            title: section.line,
            anchor: section.anchor,
          })),
          template_fields: extractTemplateFields(parsed.wikitext),
          text_length_before_truncation: fullText.length,
          content: truncate(fullText, charLimit),
        });
      }

      const result = {
        ok: true,
        character: {
          inferred_base_title: characterBaseTitle,
          entry_pageid: entryPage.pageid,
          entry_title: entryPage.title,
          entry_url: entryPage.canonicalUrl,
        },
        extraction_config: {
          keywords,
          max_pages: pageLimit,
          max_chars_per_page: charLimit,
        },
        extracted_page_count: extractedPages.length,
        pages: extractedPages,
        recommended_analysis_dimensions: [
          "人物经历与时间线",
          "家庭与重要关系",
          "所属组织及职业身份",
          "核心愿望和长期目标",
          "创伤、弱点与心理矛盾",
          "兴趣爱好和生活习惯",
          "价值观、道德倾向与行为准则",
          "说话方式、口癖和称呼习惯",
          "对玩家或引航者的关系定位",
          "战斗方式、能力和常用装备",
          "适合角色扮演的场景钩子",
          "明确事实与合理推断的区分",
        ],
        source_policy: [
          "content 内容来自相应WIKI页面的清理后正文。",
          "生成角色卡时应将WIKI明确记载与模型推断分开。",
          "没有明确来源的年龄、关系、经历不得写成确定事实。",
          "长页面可能按照 max_chars_per_page 截断。",
        ],
      };

      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error && error.message
        ? error.message
        : String(error);

      this.introspect(`${callerId}：相关资料提取失败：${message}`);
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
