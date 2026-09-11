"use strict";

const API_ENDPOINT = "https://wiki.biligame.com/klbq/api.php";

const ALLOWED_HOSTS = new Set([
  "wiki.biligame.com",
  "patchwiki.biligame.com",
]);

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function validateWikiUrl(input) {
  let url;

  try {
    url = new URL(input);
  } catch {
    throw new Error(`无效的 URL：${input}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("仅允许 HTTP 或 HTTPS URL。");
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      `不允许访问主机 ${url.hostname}。允许的主机：${[
        ...ALLOWED_HOSTS,
      ].join(", ")}`
    );
  }

  return url;
}

async function fetchLimited(
  url,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = {}
) {
  const parsedUrl = new URL(url);

  if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    throw new Error(`请求被拒绝：不允许访问 ${parsedUrl.hostname}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "AnythingLLM-KLBQ-Character-Skills/1.0 (+local custom skill)",
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP 请求失败：${response.status} ${response.statusText}`
      );
    }

    const finalUrl = new URL(response.url);
    if (!ALLOWED_HOSTS.has(finalUrl.hostname)) {
      throw new Error(`重定向被拒绝：目标主机 ${finalUrl.hostname} 不受信任`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) {
      throw new Error(
        `响应过大：${contentLength} 字节，限制为 ${maxBytes} 字节`
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > maxBytes) {
      throw new Error(
        `响应过大：${buffer.length} 字节，限制为 ${maxBytes} 字节`
      );
    }

    return buffer.toString("utf8");
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`请求超时，超过 ${timeoutMs} 毫秒`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiRequest(params) {
  const url = new URL(API_ENDPOINT);

  const merged = {
    format: "json",
    formatversion: "2",
    origin: "*",
    ...params,
  };

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const raw = await fetchLimited(url.toString());
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("MediaWiki API 返回了无法解析的 JSON。");
  }

  if (data.error) {
    throw new Error(
      `MediaWiki API 错误：${data.error.code || "unknown"} - ${
        data.error.info || "无详细信息"
      }`
    );
  }

  return data;
}

function extractPageReference(input) {
  const value = safeString(input).trim();

  if (!value) {
    throw new Error("page_url 不能为空。");
  }

  // 允许直接传页面 ID。
  if (/^\d+$/.test(value)) {
    return {
      pageid: Number(value),
      title: null,
      originalInput: value,
    };
  }

  // 允许直接传页面标题。
  if (!/^https?:\/\//i.test(value)) {
    return {
      pageid: null,
      title: value.replace(/_/g, " "),
      originalInput: value,
    };
  }

  const url = validateWikiUrl(value);

  const curid = url.searchParams.get("curid");
  if (curid && /^\d+$/.test(curid)) {
    return {
      pageid: Number(curid),
      title: null,
      originalInput: value,
    };
  }

  const pageid = url.searchParams.get("pageid");
  if (pageid && /^\d+$/.test(pageid)) {
    return {
      pageid: Number(pageid),
      title: null,
      originalInput: value,
    };
  }

  const queryTitle = url.searchParams.get("title");
  if (queryTitle) {
    return {
      pageid: null,
      title: queryTitle.replace(/_/g, " "),
      originalInput: value,
    };
  }

  const marker = "/klbq/";
  const markerIndex = url.pathname.indexOf(marker);

  if (markerIndex >= 0) {
    const encodedTitle = url.pathname.slice(markerIndex + marker.length);

    if (encodedTitle) {
      return {
        pageid: null,
        title: decodeURIComponent(encodedTitle).replace(/_/g, " "),
        originalInput: value,
      };
    }
  }

  throw new Error("无法从输入中解析 MediaWiki 页面 ID 或页面标题。");
}

async function resolvePage(input) {
  const reference = extractPageReference(input);

  const params = {
    action: "query",
    prop: "info",
    redirects: "1",
  };

  if (reference.pageid) {
    params.pageids = reference.pageid;
  } else {
    params.titles = reference.title;
  }

  const data = await apiRequest(params);
  const pages = data.query && Array.isArray(data.query.pages)
    ? data.query.pages
    : [];

  const page = pages[0];

  if (!page || page.missing) {
    throw new Error(
      `页面不存在：${reference.pageid || reference.title || input}`
    );
  }

  return {
    pageid: page.pageid,
    ns: page.ns,
    title: page.title,
    canonicalUrl:
      "https://wiki.biligame.com/klbq/" +
      encodeURIComponent(page.title.replace(/ /g, "_")),
    originalInput: reference.originalInput,
  };
}

async function parsePage(page, properties = []) {
  const propSet = new Set(properties);

  if (propSet.size === 0) {
    [
      "text",
      "wikitext",
      "links",
      "images",
      "sections",
      "displaytitle",
    ].forEach((item) => propSet.add(item));
  }

  const data = await apiRequest({
    action: "parse",
    pageid: page.pageid,
    prop: [...propSet].join("|"),
    disableeditsection: "1",
    disabletoc: "1",
  });

  const parsed = data.parse || {};

  return {
    pageid: parsed.pageid || page.pageid,
    title: parsed.title || page.title,
    displaytitle: parsed.displaytitle || parsed.title || page.title,
    html: parsed.text || "",
    wikitext: parsed.wikitext || "",
    links: Array.isArray(parsed.links) ? parsed.links : [],
    images: Array.isArray(parsed.images) ? parsed.images : [],
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
  };
}

function decodeHtmlEntities(text) {
  return safeString(text)
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number(decimal))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(html) {
  return decodeHtmlEntities(
    safeString(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanWikiMarkup(text) {
  return decodeHtmlEntities(
    safeString(text)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ")
      .replace(/<ref\b[^>]*\/>/gi, " ")
      .replace(/\[\[(?:文件|File|图片|Image):[^\]]+\]\]/gi, " ")
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
      .replace(/\{\{[^{}\n]*\}\}/g, " ")
      .replace(/'''?/g, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTemplateFields(wikitext) {
  const fields = {};
  const regex = /^\s*\|\s*([^=|\n]{1,50})\s*=\s*(.*?)\s*$/gm;

  let match;
  while ((match = regex.exec(safeString(wikitext))) !== null) {
    const key = cleanWikiMarkup(match[1]);
    const value = cleanWikiMarkup(match[2]);

    if (!key || !value) continue;
    if (/^(image|图片|图标|颜色|color|css|样式)$/i.test(key)) continue;

    if (!fields[key]) {
      fields[key] = value;
    } else if (fields[key] !== value) {
      if (!Array.isArray(fields[key])) fields[key] = [fields[key]];
      if (!fields[key].includes(value)) fields[key].push(value);
    }
  }

  return fields;
}

function extractTablePairs(html) {
  const pairs = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(safeString(html))) !== null) {
    const row = rowMatch[1];
    const cells = [];

    const cellRegex = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      const text = stripHtml(cellMatch[2]);
      if (text) cells.push(text);
    }

    if (cells.length >= 2) {
      const key = cells[0].slice(0, 100);
      const value = cells.slice(1).join(" | ").slice(0, 2000);

      if (key && value) {
        pairs.push({ key, value });
      }
    }
  }

  const seen = new Set();

  return pairs.filter((item) => {
    const fingerprint = `${item.key}\u0000${item.value}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function normalizeLinkTitle(link) {
  if (!link) return "";
  if (typeof link === "string") return link.trim();

  return safeString(
    link.title || link["*"] || link.name || link.value || ""
  ).trim();
}

function normalizeImageName(image) {
  let name = "";

  if (typeof image === "string") {
    name = image;
  } else if (image) {
    name = image.title || image["*"] || image.name || "";
  }

  name = safeString(name).trim();

  return name.replace(/^(文件|File|图片|Image):/i, "");
}

async function getImageInfo(imageNames, width = 1600) {
  const normalized = [...new Set(
    imageNames.map(normalizeImageName).filter(Boolean)
  )];

  const results = [];
  const batchSize = 40;

  for (let index = 0; index < normalized.length; index += batchSize) {
    const batch = normalized.slice(index, index + batchSize);
    const titles = batch.map((name) => `File:${name}`).join("|");

    const data = await apiRequest({
      action: "query",
      prop: "imageinfo",
      titles,
      iiprop: "url|size|mime|mediatype|timestamp",
      iiurlwidth: clampNumber(width, 200, 4096, 1600),
    });

    const pages =
      data.query && Array.isArray(data.query.pages)
        ? data.query.pages
        : [];

    for (const page of pages) {
      const info =
        Array.isArray(page.imageinfo) && page.imageinfo.length
          ? page.imageinfo[0]
          : null;

      if (!info) continue;

      results.push({
        title: page.title,
        name: page.title.replace(/^File:/i, ""),
        url: info.url || null,
        description_url: info.descriptionurl || null,
        thumbnail_url: info.thumburl || null,
        thumbnail_width: info.thumbwidth || null,
        thumbnail_height: info.thumbheight || null,
        width: info.width || null,
        height: info.height || null,
        mime: info.mime || null,
        media_type: info.mediatype || null,
        timestamp: info.timestamp || null,
      });
    }
  }

  return results;
}

function truncate(text, maxChars) {
  const value = safeString(text);
  const limit = clampNumber(maxChars, 100, 200000, 12000);

  if (value.length <= limit) return value;

  return (
    value.slice(0, limit) +
    `\n\n[内容已截断：原始长度 ${value.length} 字符，当前限制 ${limit} 字符]`
  );
}

module.exports = {
  API_ENDPOINT,
  ALLOWED_HOSTS,
  safeString,
  clampNumber,
  validateWikiUrl,
  fetchLimited,
  apiRequest,
  extractPageReference,
  resolvePage,
  parsePage,
  decodeHtmlEntities,
  stripHtml,
  cleanWikiMarkup,
  extractTemplateFields,
  extractTablePairs,
  normalizeLinkTitle,
  normalizeImageName,
  getImageInfo,
  truncate,
};
