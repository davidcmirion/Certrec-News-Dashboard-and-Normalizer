const test = require('node:test');
const assert = require('node:assert/strict');

const { parseFeedXml, refreshConfiguredArticles, normalizeFeedSource, filterFeedItems } = require('../feedCollector');
const feedSourcesModule = require('../../config/feedSources');

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>EIA Test Feed</title>
    <item>
      <title>Example title</title>
      <link>https://example.com/article?utm_source=x&amp;utm_medium=y</link>
      <description>Example summary</description>
      <pubDate>Tue, 01 Oct 2024 14:00:00 GMT</pubDate>
      <guid>guid-1</guid>
    </item>
  </channel>
</rss>`;

const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <entry>
    <title>Atom title</title>
    <link href="https://example.com/atom-post" />
    <summary>Atom summary</summary>
    <updated>2024-10-01T14:00:00Z</updated>
    <id>atom-id-1</id>
  </entry>
</feed>`;

test('parses representative EIA RSS XML into the normalized article shape', () => {
  const source = normalizeFeedSource({
    id: 'eia',
    name: 'EIA.GOV',
    enabled: true,
    feedType: 'rss',
    url: 'https://example.com/rss',
    library: 'RegSourceGRC',
    itemPath: 'rss.channel.item',
    titlePath: 'title',
    urlPath: 'link',
    summaryPath: 'description',
    publishedAtPath: 'pubDate',
    guidPath: 'guid'
  });

  const articles = parseFeedXml(rssXml, source);

  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'Example title');
  assert.equal(articles[0].url, 'https://example.com/article');
  assert.equal(articles[0].summary, 'Example summary');
  assert.equal(articles[0].guid, 'guid-1');
  assert.equal(articles[0].publishedAt, '2024-10-01T14:00:00.000Z');
});

test('parses representative Atom XML into the normalized article shape', () => {
  const source = normalizeFeedSource({
    id: 'atom-demo',
    name: 'Atom Demo',
    enabled: true,
    feedType: 'atom',
    url: 'https://example.com/atom',
    library: 'Recall',
    itemPath: 'feed.entry',
    titlePath: 'title',
    urlPath: 'link',
    summaryPath: 'summary',
    publishedAtPath: 'updated',
    guidPath: 'id'
  });

  const articles = parseFeedXml(atomXml, source);

  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'Atom title');
  assert.equal(articles[0].url, 'https://example.com/atom-post');
  assert.equal(articles[0].summary, 'Atom summary');
  assert.equal(articles[0].guid, 'atom-id-1');
  assert.equal(articles[0].publishedAt, '2024-10-01T14:00:00.000Z');
});

test('reports per-source errors without preventing another enabled source from being processed', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('broken')) {
      throw new Error('Broken source fetch failed');
    }

    return {
      ok: true,
      text: async () => rssXml
    };
  };

  const originalSources = feedSourcesModule.feedSources;
  feedSourcesModule.feedSources = [
    {
      id: 'broken',
      name: 'Broken Source',
      enabled: true,
      feedType: 'rss',
      url: 'https://example.invalid/broken.xml',
      library: 'Recall'
    },
    {
      id: 'ok',
      name: 'Ok Source',
      enabled: true,
      feedType: 'rss',
      url: 'https://example.com/ok.xml',
      library: 'Recall'
    }
  ];

  try {
    const result = await refreshConfiguredArticles(['broken', 'ok'], { cutoffDays: 10 });
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].ok, false);
    assert.equal(result.results[1].ok, true);
  } finally {
    global.fetch = originalFetch;
    feedSourcesModule.feedSources = originalSources;
  }
});

test('skips invalid dates, missing required fields, and old articles', () => {
  const source = normalizeFeedSource({
    id: 'skip-demo',
    name: 'Skip Demo',
    enabled: true,
    feedType: 'rss',
    url: 'https://example.com/rss',
    library: 'Recall',
    itemPath: 'rss.channel.item',
    titlePath: 'title',
    urlPath: 'link',
    summaryPath: 'description',
    publishedAtPath: 'pubDate',
    guidPath: 'guid'
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>Valid title</title>
        <link>https://example.com/valid</link>
        <description>Valid summary</description>
        <pubDate>${new Date().toISOString()}</pubDate>
        <guid>guid-valid</guid>
      </item>
      <item>
        <title>Missing link</title>
        <description>Missing link summary</description>
        <pubDate>${new Date().toISOString()}</pubDate>
        <guid>guid-missing-link</guid>
      </item>
      <item>
        <title>Invalid date</title>
        <link>https://example.com/invalid-date</link>
        <description>Invalid date summary</description>
        <pubDate>not-a-date</pubDate>
        <guid>guid-invalid-date</guid>
      </item>
      <item>
        <title>Old title</title>
        <link>https://example.com/old</link>
        <description>Old summary</description>
        <pubDate>2000-01-01T00:00:00Z</pubDate>
        <guid>guid-old</guid>
      </item>
    </channel>
  </rss>`;

  const articles = parseFeedXml(xml, source);
  const filteredArticles = filterFeedItems(articles, { cutoffDays: 3 });

  assert.equal(filteredArticles.length, 1);
  assert.equal(filteredArticles[0].title, 'Valid title');
});
