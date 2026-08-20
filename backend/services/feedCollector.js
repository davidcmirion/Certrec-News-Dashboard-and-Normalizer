const { XMLParser } = require("fast-xml-parser");
const cheerio = require("cheerio");
const pool = require("../db");

const feedSourceModule = require("../config/feedSources");
const feedSourceConfig = feedSourceModule.default || feedSourceModule;
const getEnabledFeedSources = feedSourceConfig.getEnabledFeedSources;
const DEFAULT_SOURCE_CONCURRENCY = 6;
const DEFAULT_ARTICLE_CONCURRENCY = 4;
const MIN_ARTICLE_REQUEST_INTERVAL_MS = 1500;
const MAX_FETCH_RETRIES = 3;
const USER_AGENT = "NewsDepotBot/1.0 (+https://certrec.com/bot)";
const hostRequestTimes = new Map();
const hostRequestLocks = new Map();

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return cleanText(value);
}

function extractArticleBody(html) {
  if (!html) return "";

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, form, iframe, noscript, .ad, .ads, .advertisement, .sidebar, [role='navigation']").remove();
  const candidates = ["article", "main", ".article-body", ".article__body", ".entry-content", ".post-content", ".content-body"];
  let best = "";

  for (const selector of candidates) {
    $(selector).each((_, element) => {
      const text = $(element)
        .clone()
        .find("br, p, div, h1, h2, h3, h4, h5, h6, li")
        .append(" ")
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > best.length) best = text;
    });
    if (best.length >= 300) break;
  }

  return best || $("body").text().replace(/\s+/g, " ").trim();
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withHostRateLimit(host, request) {
  const previousRequest = hostRequestLocks.get(host) || Promise.resolve();
  let release;
  const currentRequest = new Promise(resolve => { release = resolve; });
  hostRequestLocks.set(host, currentRequest);

  await previousRequest;
  const lastRequestAt = hostRequestTimes.get(host);
  const wait = lastRequestAt
    ? MIN_ARTICLE_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt)
    : 0;
  if (wait > 0) await sleep(wait);

  try {
    return await request();
  } finally {
    hostRequestTimes.set(host, Date.now());
    release();
    if (hostRequestLocks.get(host) === currentRequest) hostRequestLocks.delete(host);
  }
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": USER_AGENT, ...(options.headers || {}) }
      });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      }
      lastError = new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_FETCH_RETRIES - 1) await sleep(250 * 2 ** attempt);
  }
  throw lastError;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content"
    ].forEach(parameter => url.searchParams.delete(parameter));

    return url.toString();
  } catch {
    return null;
  }
}

function toText(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    if (typeof value["#text"] === "string") {
      return value["#text"];
    }

    if (typeof value.text === "string") {
      return value.text;
    }

    if (typeof value.value === "string") {
      return value.value;
    }

    if (typeof value.name === "string") {
      return value.name;
    }

    if (typeof value.href === "string") {
      return value.href;
    }

    if (typeof value["@_href"] === "string") {
      return value["@_href"];
    }
  }

  return "";
}

function getValueByPath(source, path) {
  if (!source || !path) {
    return undefined;
  }

  return path.split(".").reduce((current, segment) => {
    if (current == null) {
      return undefined;
    }

    return current[segment];
  }, source);
}

function normalizeFeedSource(source) {
  return {
    id: source.id,
    name: source.name,
    enabled: source.enabled !== false,
    feedType: source.feedType || "rss",
    url: source.url,
    library: source.library,
    contentCategory: source.contentCategory,
    itemPath: source.itemPath || (source.feedType === "atom" ? "feed.entry" : "rss.channel.item"),
    titlePath: source.titlePath || "title",
    urlPath: source.urlPath || "link",
    summaryPath: source.summaryPath || (source.feedType === "atom" ? "summary" : "description"),
    contentPath: source.contentPath || "content:encoded",
    authorPath: source.authorPath || (source.feedType === "atom" ? "author.name" : "author"),
    publishedAtPath: source.publishedAtPath || (source.feedType === "atom" ? "updated" : "pubDate"),
    guidPath: source.guidPath || (source.feedType === "atom" ? "id" : "guid")
  };
}

const nuclearKeywords = [
  "nuclear",
  "nuclear energy",
  "nuclear power",
  "nuclear fuel",
  "nuclear waste",
  "radioactive waste",
  "spent fuel",
  "fuel cycle",
  "reactor",
  "reactor vessel",
  "advanced reactor",
  "smr",
  "small modular reactor",
  "microreactor",
  "fusion",
  "fission",
  "uranium",
  "enriched uranium",
  "enrichment",
  "haleu",
  "leu",
  "triso",
  "thorium",
  "plutonium",
  "isotope",
  "radioisotope",
  "radiological",
  "radioactive",
  "radiation",
  "criticality",
  "decommissioning",
  "safeguards",
  "nonproliferation",
  "nrc",
  "nuclear regulatory commission",
  "iaea",
  "nnsa",
  "nei",
  "candu",
  "ap1000",
  "bwrx",
  "mox",
  "fuel fabrication"
];

function buildKeywordPattern(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
}

const nuclearKeywordPatterns = nuclearKeywords.map(buildKeywordPattern);

function isNuclearRelatedArticle(article) {
  const text = `${article.title || ""} ${article.summary || ""}`.toLowerCase();

  return nuclearKeywordPatterns.some(pattern => pattern.test(text));
}

function getDestinationLibraries(article, source) {
  const isNuclearRelated = source.contentCategory === "nuclear" || isNuclearRelatedArticle(article);

  if (isNuclearRelated) {
    return ["Recall", "RecallNewBuild"];
  }

  return ["RegSourceGRC"];
}

function extractLinkValue(item, source) {
  const rawLink = getValueByPath(item, source.urlPath) || getValueByPath(item, "link");

  if (typeof rawLink === "string") {
    return rawLink;
  }

  if (rawLink && typeof rawLink === "object") {
    const href = rawLink["@_href"] || rawLink.href;

    if (typeof href === "string") {
      return href;
    }

    const textValue = rawLink["#text"] || rawLink.text || rawLink.value;

    if (typeof textValue === "string") {
      return textValue;
    }
  }

  return null;
}

function extractTitle(item, source) {
  const rawTitle = getValueByPath(item, source.titlePath) || getValueByPath(item, "title");
  return cleanText(toText(rawTitle));
}

function extractSummary(item, source) {
  const rawSummary =
    getValueByPath(item, source.summaryPath) ||
    getValueByPath(item, "summary") ||
    getValueByPath(item, "content") ||
    getValueByPath(item, "description");

  return cleanText(toText(rawSummary));
}

function extractContent(item, source) {
  const rawContent = getValueByPath(item, source.contentPath) || getValueByPath(item, "content:encoded");
  return stripHtml(toText(rawContent));
}

function extractAuthor(item, source) {
  return cleanText(toText(getValueByPath(item, source.authorPath) || getValueByPath(item, "dc:creator")));
}

function extractPublishedAt(item, source) {
  const rawPublishedAt =
    getValueByPath(item, source.publishedAtPath) ||
    getValueByPath(item, "published") ||
    getValueByPath(item, "updated") ||
    getValueByPath(item, "pubDate");

  const rawValue = toText(rawPublishedAt);

  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function extractGuid(item, source) {
  const rawGuid = getValueByPath(item, source.guidPath) || getValueByPath(item, "id") || getValueByPath(item, "guid");
  return cleanText(toText(rawGuid));
}

function normalizeFeedItems(parsedFeed, source) {
  const normalizedSource = normalizeFeedSource(source);
  const items = getValueByPath(parsedFeed, normalizedSource.itemPath) || [];
  const feedItems = Array.isArray(items) ? items : [items];

  return feedItems.map(item => ({
    title: extractTitle(item, normalizedSource),
    summary: extractSummary(item, normalizedSource),
    content: extractContent(item, normalizedSource),
    author: extractAuthor(item, normalizedSource),
    publishedAt: extractPublishedAt(item, normalizedSource),
    url: normalizeUrl(extractLinkValue(item, normalizedSource)),
    guid: extractGuid(item, normalizedSource)
  }));
}

function filterFeedItems(feedItems, options = {}) {
  const cutoffDays = options.cutoffDays ?? 3;
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

  return feedItems.filter(article => {
    if (!article.url || !article.title || !article.publishedAt) {
      return false;
    }

    const publishedAt = new Date(article.publishedAt);

    if (Number.isNaN(publishedAt.getTime())) {
      return false;
    }

    return publishedAt >= cutoffDate;
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(
    items.length,
    Math.max(1, Number(concurrency) || 1)
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return results;
}

function parseFeedXml(xml, source) {
  if (source.feedType === "html") {
    return parseHtmlListing(xml, source);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });

  const parsedFeed = parser.parse(xml);
  return normalizeFeedItems(parsedFeed, source);
}

function parseHtmlListing(html, source) {
  const $ = cheerio.load(html);
  const baseUrl = new URL(source.url);

  return $(".news_box_title a").map((_, element) => {
    const link = $(element).attr("href");
    const card = $(element).closest(".news_box_title").parent();
    const dateText = card.find(".news_box_date").first().text().trim();
    const summary = card.find(".news_box_text").first().text().replace(/\s+/g, " ").trim();
    const publishedAt = new Date(dateText);

    return {
      title: cleanText($(element).text()),
      summary,
      content: "",
      author: "World Nuclear Association",
      publishedAt: Number.isNaN(publishedAt.getTime()) ? null : publishedAt.toISOString(),
      url: link ? normalizeUrl(new URL(link, baseUrl).toString()) : null,
      guid: link || null
    };
  }).get();
}

async function saveArticle(article, source) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const articleResult = await client.query(
      `
        INSERT INTO articles (
          source,
          source_guid,
          canonical_url,
          title,
          summary,
          content,
          author,
          dedupe_key,
          source_published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (dedupe_key)
        DO UPDATE SET
          source = EXCLUDED.source,
          source_guid = COALESCE(EXCLUDED.source_guid, articles.source_guid),
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          content = EXCLUDED.content,
          author = EXCLUDED.author,
          source_published_at = EXCLUDED.source_published_at
        RETURNING id
      `,
      [
        source.name,
        article.guid || null,
        article.url,
        article.title,
        article.summary,
        article.content || article.summary,
        article.author || null,
        article.dedupeKey,
        article.publishedAt
      ]
    );

    const articleId = articleResult.rows[0].id;
    const destinationLibraries = getDestinationLibraries(article, source);

    await client.query(
      `DELETE FROM article_library_matches WHERE article_id = $1`,
      [articleId]
    );

    for (const destinationLibrary of destinationLibraries) {
      await client.query(
        `
          INSERT INTO article_library_matches (
            article_id,
            library,
            match_rank
          )
          VALUES ($1, $2, 1)
        `,
        [articleId, destinationLibrary]
      );
    }

    await client.query("COMMIT");
    return articleId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function articleExists(article, source) {
  const result = await pool.query(
    `SELECT id FROM articles
    WHERE (source = $3 AND $1::text IS NOT NULL AND source_guid = $1)
      OR canonical_url = $2
     LIMIT 1`,
   [article.guid || null, article.url, source.name]
  );
  return result.rowCount > 0;
}

async function hydrateArticle(article) {
  if (article.content && article.content.length >= 300) return article;

  const host = new URL(article.url).host;
  return withHostRateLimit(host, async () => {
    const response = await fetchWithRetry(article.url, {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    const html = await response.text();
    const content = extractArticleBody(html);
    return { ...article, content: content || article.summary };
  });
}

async function refreshFeedSource(source, options = {}) {
  const normalizedSource = normalizeFeedSource(source);

  const response = await fetchWithRetry(normalizedSource.url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml"
    }
  });
  const xml = await response.text();
  const feedItems = parseFeedXml(xml, normalizedSource);
  const validItems = filterFeedItems(feedItems, options);

  let imported = 0;
  let skipped = 0;

  await mapWithConcurrency(
    validItems,
    options.articleConcurrency || DEFAULT_ARTICLE_CONCURRENCY,
    async article => {
      article.dedupeKey = `${normalizedSource.id}:${article.guid || article.url}`;
      if (await articleExists(article, normalizedSource)) return;
      const hydrated = await hydrateArticle(article);
      await saveArticle(hydrated, normalizedSource);
      imported++;
    }
  );

  skipped = feedItems.length - validItems.length;

  return {
    source: normalizedSource.name,
    library: normalizedSource.library,
    feedItemsFound: feedItems.length,
    articlesProcessed: imported,
    articlesSkipped: skipped
  };
}

async function refreshConfiguredArticles(sourceIds = null, options = {}) {
  const sources = getEnabledFeedSources(sourceIds);

  console.log(
    "Enabled feeds loaded by refreshConfiguredArticles:",
    sources.map(source => ({
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      url: source.url
    }))
  );

  const results = await mapWithConcurrency(
    sources,
    options.sourceConcurrency || DEFAULT_SOURCE_CONCURRENCY,
    async source => {
      try {
        const result = await refreshFeedSource(source, options);
        return {
          ok: true,
          ...result
        };
      } catch (error) {
        console.error(
          `Feed refresh failed for ${source.name} (${source.url}):`,
          error.message
        );
        return {
          ok: false,
          source: source.name,
          library: source.library,
          error: error.message,
          feedItemsFound: 0,
          articlesProcessed: 0,
          articlesSkipped: 0
        };
      }
    }
  );

  return {
    sourcesProcessed: results.length,
    results
  };
}

module.exports = {
  cleanText,
  filterFeedItems,
  getDestinationLibraries,
  isNuclearRelatedArticle,
  normalizeFeedItems,
  normalizeFeedSource,
  parseHtmlListing,
  extractArticleBody,
  fetchWithRetry,
  hydrateArticle,
  articleExists,
  mapWithConcurrency,
  parseFeedXml,
  refreshFeedSource,
  refreshConfiguredArticles
};
