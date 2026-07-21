const { refreshConfiguredArticles } = require("./feedCollector");

async function refreshEiaArticles() {
  const result = await refreshConfiguredArticles(["eia"]);
  const first = result.results[0] || {};

  if (!first.ok) {
    throw new Error(first.error || "EIA feed refresh failed.");
  }

  return {
    source: first.source,
    library: first.library,
    feedItemsFound: first.feedItemsFound,
    articlesProcessed: first.articlesProcessed,
    articlesSkipped: first.articlesSkipped
  };
}

module.exports = {
  refreshEiaArticles
};
