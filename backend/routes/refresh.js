const express = require("express");
const { refreshEiaArticles } = require("../services/eiaCollector");
const { refreshConfiguredArticles } = require("../services/feedCollector");

const router = express.Router();

router.post("/eia", async (req, res) => {
  try {
    const result = await refreshEiaArticles();

    res.json({
      message: "EIA articles refreshed successfully.",
      ...result
    });
  } catch (error) {
    console.error("Could not refresh EIA articles:", error);

    res.status(500).json({
      error: "Could not refresh EIA articles."
    });
  }
});

router.post("/all", async (req, res) => {
  try {
    const result = await refreshConfiguredArticles();

    res.json({
      message: "Configured feed sources refreshed successfully.",
      ...result
    });
  } catch (error) {
    console.error("Could not refresh configured feed sources:", error);

    res.status(500).json({
      error: "Could not refresh configured feed sources."
    });
  }
});

module.exports = router;
