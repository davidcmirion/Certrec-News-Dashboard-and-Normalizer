const { XMLParser } = require("fast-xml-parser");
const pool = require("../db");

const EIA_FEED_URL = "https://www.eia.gov/rss/todayinenergy.xml";
const LIBRARY = "RegSourceGRC";
const SOURCE_NAME = "EIA.GOV";

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

function getFeedItems(parsedFeed) {
  const channel = parsedFeed?.rss?.channel;
  const items = channel?.item || [];

  return Array.isArray(items) ? items : [items];
}

async function saveArticle(article) {
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
        SOURCE_NAME,
        article.guid || null,
        article.canonicalUrl,
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
      [articleId, LIBRARY]
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

async function refreshEiaArticles() {
  const response = await fetch(EIA_FEED_URL, {
    headers: {
      "User-Agent": "Certrec-News-Dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `EIA feed request failed with status ${response.status}.`
    );
  }

  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });

  const parsedFeed = parser.parse(xml);
  const items = getFeedItems(parsedFeed);

const cutoffDate = new Date();
cutoffDate.setHours(0, 0, 0, 0);
cutoffDate.setDate(cutoffDate.getDate() - 3);

let imported = 0;
let skipped = 0;


  for (const item of items) {
    const canonicalUrl = normalizeUrl(item.link);
    const title = cleanText(item.title);
    const summary = cleanText(item.description);
    const publishedAt = item.pubDate ? new Date(item.pubDate) : null;

    if (
  !canonicalUrl ||
  !title ||
  !publishedAt ||
  Number.isNaN(publishedAt.getTime()) ||
  publishedAt < cutoffDate
) {
  skipped++;
  continue;
}

    await saveArticle({
      guid: cleanText(item.guid),
      canonicalUrl,
      title,
      summary,
      publishedAt: publishedAt.toISOString()
    });

    imported++;
  }

  return {
    source: SOURCE_NAME,
    library: LIBRARY,
    feedItemsFound: items.length,
    articlesProcessed: imported,
    articlesSkipped: skipped
  };
}

module.exports = {
  refreshEiaArticles
};
