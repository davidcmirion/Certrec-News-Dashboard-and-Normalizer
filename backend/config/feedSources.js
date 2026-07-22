let feedSources = [
  {
    id: "eia",
    name: "EIA.GOV",
    enabled: true,
    feedType: "rss",
    url: "https://www.eia.gov/rss/todayinenergy.xml",
    library: "RegSourceGRC",
    itemPath: "rss.channel.item",
    titlePath: "title",
    urlPath: "link",
    summaryPath: "description",
    publishedAtPath: "pubDate",
    guidPath: "guid"
  },
  {
    id: "world-nuclear-news",
    name: "WORLD-NUCLEAR-NEWS.ORG",
    enabled: true,
    contentCategory: "nuclear",
    feedType: "rss",
    url: "https://world-nuclear-news.org/rss",
    itemPath: "rss.channel.item",
    titlePath: "title",
    urlPath: "link",
    summaryPath: "description",
    publishedAtPath: "pubDate",
    guidPath: "guid"
  },
  {
    id: "power-magazine",
    name: "WWW.POWERMAG.COM",
    enabled: true,
    feedType: "rss",
    url: "https://www.powermag.com/feed/",
    itemPath: "rss.channel.item",
    titlePath: "title",
    urlPath: "link",
    summaryPath: "description",
    publishedAtPath: "pubDate",
    guidPath: "guid"
  }
];

function getEnabledFeedSources(sourceIds = null) {
  const requestedIds = Array.isArray(sourceIds)
    ? sourceIds
    : sourceIds
      ? [sourceIds]
      : null;

  return feedSources.filter(source => {
    if (!source.enabled) {
      return false;
    }

    if (!requestedIds || requestedIds.length === 0) {
      return true;
    }

    return requestedIds.includes(source.id);
  });
}

module.exports = {
  get feedSources() {
    return feedSources;
  },
  set feedSources(value) {
    feedSources = value;
  },
  getEnabledFeedSources
};
