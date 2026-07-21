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
