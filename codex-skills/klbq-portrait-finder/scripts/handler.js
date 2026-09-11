"use strict";

module.exports.runtime = {
  handler: async function ({
    page_url,
    include_gallery = true,
    max_images = 10,
    thumbnail_width = 1600,
  }) {
    const callerId = `${this.config.name}-v${this.config.version}`;

    try {
      const {
        resolvePage,
        parsePage,
        getImageInfo,
        normalizeLinkTitle,
        clampNumber,
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

      const imageLimit = clampNumber(max_images, 1, 30, 10);
      const targetWidth = clampNumber(
        thumbnail_width,
        400,
        4096,
        1600
      );

      this.introspect(`${callerId}：正在解析角色页面……`);

      const mainPage = await resolvePage(page_url);
      const mainParsed = await parsePage(mainPage, [
        "links",
        "images",
        "displaytitle",
      ]);

      const sourcePages = [
        {
          page: mainPage,
          parsed: mainParsed,
          type: "character_main_page",
        },
      ];

      if (include_gallery === true) {
        const linkedTitles = mainParsed.links
          .map(normalizeLinkTitle)
          .filter(Boolean);

        let galleryTitle = linkedTitles.find((title) =>
          /\/(画廊|相册|图集)$/.test(title)
        );

        if (!galleryTitle) {
          galleryTitle = `${mainPage.title.split("/")[0]}/画廊`;
        }

        try {
          const galleryPage = await resolvePage(galleryTitle);

          if (galleryPage.pageid !== mainPage.pageid) {
            const galleryParsed = await parsePage(galleryPage, [
              "images",
              "displaytitle",
            ]);

            sourcePages.push({
              page: galleryPage,
              parsed: galleryParsed,
              type: "gallery_page",
            });
          }
        } catch (galleryError) {
          this.introspect(
            `${callerId}：没有找到可访问的画廊页面，将只分析角色主页面。`
          );
        }
      }

      const imageSourceMap = new Map();

      for (const source of sourcePages) {
        for (const image of source.parsed.images) {
          const imageName =
            typeof image === "string"
              ? image
              : image.title || image["*"] || "";

          if (!imageName) continue;

          if (!imageSourceMap.has(imageName)) {
            imageSourceMap.set(imageName, []);
          }

          imageSourceMap.get(imageName).push({
            page_title: source.page.title,
            page_url: source.page.canonicalUrl,
            source_type: source.type,
          });
        }
      }

      this.introspect(
        `${callerId}：发现 ${imageSourceMap.size} 个图片文件，正在获取原图信息……`
      );

      const imageNames = [...imageSourceMap.keys()];
      const preferredNames = imageNames.filter((name) =>
        /(立绘|全身|角色图|角色立绘|图鉴|默认|初始|原皮|标准|常服)/i.test(name) &&
        !/(头像|icon|图标|表情|喷漆|勋章|礼物|武器|基板|背景)/i.test(name)
      );
      const metadataNames = [...new Set([
        ...preferredNames,
        ...imageNames.filter((name) => !/(头像|icon|图标|表情|喷漆|勋章|礼物|武器|基板|背景)/i.test(name)),
      ])].slice(0, Math.max(40, imageLimit * 8));
      this.introspect(
        `${callerId}：已按立绘关键词缩小为 ${metadataNames.length} 个候选。`
      );
      const images = await getImageInfo(metadataNames, targetWidth);

      const characterName = mainPage.title.split("/")[0]
        .replace(/[·•\s]/g, "")
        .toLowerCase();

      function calculateScore(image) {
        const name = String(image.name || "");
        const compactName = name
          .replace(/[·•\s]/g, "")
          .toLowerCase();

        let score = 0;
        const reasons = [];

        if (
          characterName &&
          compactName.includes(characterName)
        ) {
          score += 35;
          reasons.push("文件名包含角色名");
        }

        if (/(立绘|全身|角色图|角色立绘|角色时装|图鉴)/i.test(name)) {
          score += 40;
          reasons.push("文件名包含立绘或全身图关键词");
        }

        if (/(默认|初始|原皮|标准|常服)/i.test(name)) {
          score += 12;
          reasons.push("可能是默认或初始外观");
        }

        if (/(头像|icon|图标|表情|喷漆|勋章|礼物|武器|基板|背景)/i.test(name)) {
          score -= 45;
          reasons.push("文件名包含头像、图标或其他非立绘关键词");
        }

        const width = Number(image.width || 0);
        const height = Number(image.height || 0);

        if (height >= 1000) {
          score += 15;
          reasons.push("图片高度较大");
        }

        if (width >= 700) {
          score += 8;
          reasons.push("图片宽度较大");
        }

        if (height > width * 1.15) {
          score += 18;
          reasons.push("图片为纵向构图，符合角色立绘特征");
        }

        if (width <= 256 && height <= 256) {
          score -= 30;
          reasons.push("图片尺寸较小，更可能是头像或图标");
        }

        if (/image\/png/i.test(String(image.mime || ""))) {
          score += 5;
          reasons.push("PNG格式常用于透明背景立绘");
        }

        const sources = imageSourceMap.get(image.name) || [];
        if (sources.some((source) => source.source_type === "gallery_page")) {
          score += 5;
          reasons.push("图片出现在角色画廊页面");
        }

        return { score, reasons };
      }

      const rankedImages = images
        .map((image) => {
          const ranking = calculateScore(image);

          return {
            ...image,
            score: ranking.score,
            score_reasons: ranking.reasons,
            source_pages: imageSourceMap.get(image.name) || [],
          };
        })
        .filter((image) => {
          return !/(Q版小人|头像|表情|礼物图标|武器外观|喷漆|勋章)/i.test(
            image.name
          ) || image.score > 35;
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;

          const areaA =
            Number(a.width || 0) * Number(a.height || 0);
          const areaB =
            Number(b.width || 0) * Number(b.height || 0);

          return areaB - areaA;
        })
        .slice(0, imageLimit);

      const result = {
        ok: true,
        character: {
          pageid: mainPage.pageid,
          title: mainPage.title,
          canonical_url: mainPage.canonicalUrl,
        },
        source_pages: sourcePages.map((source) => ({
          type: source.type,
          title: source.page.title,
          pageid: source.page.pageid,
          url: source.page.canonicalUrl,
        })),
        image_count_found: imageSourceMap.size,
        returned_count: rankedImages.length,
        recommended_image:
          rankedImages.length > 0 ? rankedImages[0] : null,
        candidates: rankedImages,
        usage_notes: [
          "url 是原始图片地址，thumbnail_url 是指定宽度的缩略图地址。",
          "recommended_image 只是基于文件名、尺寸和纵横比自动评分，使用前应人工确认。",
          "提取发色、瞳色、服装、体型等视觉特征，需要支持图片输入的视觉模型实际读取图片；仅有URL时，纯文本模型不能可靠识别外貌。",
          "不要根据立绘推断年龄等未明确记载的事实资料。",
        ],
      };

      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error && error.message
        ? error.message
        : String(error);

      this.introspect(`${callerId}：立绘查找失败：${message}`);
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
