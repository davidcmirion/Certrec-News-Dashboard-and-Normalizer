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
  },
  {
    id: "iaea-top-news",
    name: "IAEA Top News",
    enabled: false,
    feedType: "rss",
    url: "https://www.iaea.org/feeds/topnews",
    library: "Recall",
    contentCategory: "nuclear"
  },
  {
    id: "ans-nuclear-news",
    name: "ANS.ORG",
    enabled: true,
    feedType: "rss",
    url: "https://ans.org/news/feed",
    library: "Recall",
    contentCategory: "nuclear"
  },
  {
    id: "renewable-energy-world",
    name: "RENEWABLEENERGYWORLD.COM",
    enabled: true,
    feedType: "rss",
    url: "https://www.renewableenergyworld.com/feed/",
    library: "RegSourceGRC",
    contentCategory: "general"
  },
  {
    id: "power-technology",
    name: "POWER-TECHNOLOGY.COM",
    enabled: true,
    feedType: "rss",
    url: "https://www.power-technology.com/feed/",
    library: "RegSourceGRC",
    contentCategory: "general"
  },

  {
    id: "utility-dive",
    name: "UTILITYDIVE.COM",
    enabled: true,
    feedType: "rss",
    url: "https://utilitydive.com/feeds/news",
    library: "RegSourceGRC",
    contentCategory: "general"
  },
  {
    id: "power-engineering",
    name: "POWER-ENG.COM",
    enabled: true,
    feedType: "rss",
    url: "https://www.power-eng.com/feed/",
    library: "RegSourceGRC",
    contentCategory: "general"
  },
  {
    id: "energy-gov-nuclear",
    name: "ENERGY.GOV",
    enabled: false,
    feedType: "rss",
    library: "Recall",
    contentCategory: "nuclear"
  },
  {
    id: "nrc-news-releases",
    name: "NRC PRESS RELEASE",
    enabled: false,
    feedType: "rss",
    library: "Recall",
    contentCategory: "nuclear"
  },
  {
    id: "world-nuclear-association",
    name: "WORLD-NUCLEAR.ORG",
    enabled: false,
    feedType: "rss",
    library: "Recall",
    contentCategory: "nuclear"
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
