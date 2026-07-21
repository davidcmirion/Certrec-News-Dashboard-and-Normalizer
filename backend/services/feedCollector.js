const { XMLParser } = require("fast-xml-parser");
const pool = require("../db");
const { getEnabledFeedSources } = require("../config/feedSources");

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    itemPath: source.itemPath || (source.feedType === "atom" ? "feed.entry" : "rss.channel.item"),
    titlePath: source.titlePath || "title",
    urlPath: source.urlPath || "link",
    summaryPath: source.summaryPath || (source.feedType === "atom" ? "summary" : "description"),
    publishedAtPath: source.publishedAtPath || (source.feedType === "atom" ? "updated" : "pubDate"),
    guidPath: source.guidPath || (source.feedType === "atom" ? "id" : "guid")
  };
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

function parseFeedXml(xml, source) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });

  const parsedFeed = parser.parse(xml);
  return normalizeFeedItems(parsedFeed, source);
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
          source_published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (canonical_url)
        DO UPDATE SET
          source = EXCLUDED.source,
          source_guid = COALESCE(EXCLUDED.source_guid, articles.source_guid),
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          source_published_at = EXCLUDED.source_published_at
        RETURNING id
      `,
      [
        source.name,
        article.guid || null,
        article.url,
        article.title,
        article.summary,
        article.publishedAt
      ]
    );

    const articleId = articleResult.rows[0].id;

    await client.query(
      `
        INSERT INTO article_library_matches (
          article_id,
          library,
          match_rank
        )
        VALUES ($1, $2, 1)
        ON CONFLICT (article_id, library) DO NOTHING
      `,
      [articleId, source.library]
    );

    await client.query("COMMIT");
    return articleId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function refreshFeedSource(source, options = {}) {
  const normalizedSource = normalizeFeedSource(source);

  const response = await fetch(normalizedSource.url, {
    headers: {
      "User-Agent": "Certrec-News-Dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`${normalizedSource.name} feed request failed with status ${response.status}.`);
  }

  const xml = await response.text();
  const feedItems = parseFeedXml(xml, normalizedSource);
  const validItems = filterFeedItems(feedItems, options);

  let imported = 0;
  let skipped = 0;

  for (const article of validItems) {
    await saveArticle(article, normalizedSource);
    imported++;
  }

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
  const results = [];

  for (const source of sources) {
    try {
      const result = await refreshFeedSource(source, options);
      results.push({
        ok: true,
        ...result
      });
    } catch (error) {
      results.push({
        ok: false,
        source: source.name,
        library: source.library,
        error: error.message,
        feedItemsFound: 0,
        articlesProcessed: 0,
        articlesSkipped: 0
      });
    }
  }

  return {
    sourcesProcessed: results.length,
    results
  };
}

module.exports = {
  cleanText,
  filterFeedItems,
  normalizeFeedItems,
  normalizeFeedSource,
  parseFeedXml,
  refreshFeedSource,
  refreshConfiguredArticles
};
