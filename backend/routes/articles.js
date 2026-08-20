const express = require("express");
const pool = require("../db");

const router = express.Router();

const allowedLibraries = [
  "Recall",
  "RecallNewBuild",
  "RegSourceGRC",
];

function isValidLibrary(library) {
  return allowedLibraries.includes(library);
}

// List articles. Optional example:
// GET /api/articles?library=Recall
router.get("/", async (req, res) => {
  const { library } = req.query;

  if (library && !isValidLibrary(library)) {
    return res.status(400).json({
      error: "Invalid library.",
      allowedLibraries,
    });
  }

  try {
    const values = [];
const filters = [
  "a.source_published_at >= CURRENT_DATE - INTERVAL '3 days'",
];

if (library) {
  values.push(library);
  filters.push(`alm.library = $${values.length}`);
}

const whereClause = `WHERE ${filters.join(" AND ")}`;

    const result = await pool.query(
      `
        SELECT
          a.id,
          a.source,
          a.canonical_url,
          a.title,
          a.summary,
          a.content,
          a.author,
          a.source_published_at,
          a.workflow_status,
          a.claimed_library,
          a.claimed_at,
          a.posted_at,
          alm.library,
          alm.match_rank
        FROM articles AS a
        INNER JOIN article_library_matches AS alm
          ON alm.article_id = a.id
        ${whereClause}
        ORDER BY
          alm.match_rank ASC,
          a.source_published_at DESC
      `,
      values
    );

    res.json({
      articles: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    console.error("Could not retrieve articles:", error);
    res.status(500).json({
      error: "Could not retrieve articles from the database.",
    });
  }
});

// Claim an available article for a library.
// Since article status is shared, a claim is visible in every library.
router.post("/:id/claim", async (req, res) => {
  const articleId = Number(req.params.id);
  const { library } = req.body;

  if (!Number.isInteger(articleId) || articleId < 1) {
    return res.status(400).json({ error: "Invalid article ID." });
  }

  if (!isValidLibrary(library)) {
    return res.status(400).json({
      error: "Invalid library.",
      allowedLibraries,
    });
  }

  try {
    const result = await pool.query(
      `
        UPDATE articles
        SET
          workflow_status = 'claimed',
          claimed_library = $2,
          claimed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND workflow_status = 'available'
        RETURNING *
      `,
      [articleId, library]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "This article is unavailable because it was already claimed or posted.",
      });
    }

    res.json({
      message: "Article claimed.",
      article: result.rows[0],
    });
  } catch (error) {
    console.error("Could not claim article:", error);
    res.status(500).json({ error: "Could not claim the article." });
  }
});

// Release a claimed article back to available.
router.post("/:id/release", async (req, res) => {
  const articleId = Number(req.params.id);

  if (!Number.isInteger(articleId) || articleId < 1) {
    return res.status(400).json({ error: "Invalid article ID." });
  }

  try {
    const result = await pool.query(
      `
        UPDATE articles
        SET
          workflow_status = 'available',
          claimed_library = NULL,
          claimed_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND workflow_status = 'claimed'
        RETURNING *
      `,
      [articleId]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Only a currently claimed article can be released.",
      });
    }

    res.json({
      message: "Article released.",
      article: result.rows[0],
    });
  } catch (error) {
    console.error("Could not release article:", error);
    res.status(500).json({ error: "Could not release the article." });
  }
});

// Mark an article posted everywhere it appears.
router.post("/:id/posted", async (req, res) => {
  const articleId = Number(req.params.id);

  if (!Number.isInteger(articleId) || articleId < 1) {
    return res.status(400).json({ error: "Invalid article ID." });
  }

  try {
    const result = await pool.query(
      `
        UPDATE articles
        SET
          workflow_status = 'posted',
          posted_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND workflow_status IN ('available', 'claimed')
        RETURNING *
      `,
      [articleId]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "This article is already marked as posted or does not exist.",
      });
    }

    res.json({
      message: "Article marked as posted.",
      article: result.rows[0],
    });
  } catch (error) {
    console.error("Could not mark article as posted:", error);
    res.status(500).json({ error: "Could not mark the article as posted." });
  }
});
// Return a posted article to available.
router.post("/:id/not-posted", async (req, res) => {
  const articleId = Number(req.params.id);

  if (!Number.isInteger(articleId) || articleId < 1) {
    return res.status(400).json({ error: "Invalid article ID." });
  }

  try {
    const result = await pool.query(
      `
        UPDATE articles
        SET
          workflow_status = 'available',
          claimed_library = NULL,
          claimed_at = NULL,
          posted_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND workflow_status = 'posted'
        RETURNING *
      `,
      [articleId]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Only a currently posted article can be returned to available.",
      });
    }

    res.json({
      message: "Article returned to available.",
      article: result.rows[0],
    });
  } catch (error) {
    console.error("Could not return article to available:", error);
    res.status(500).json({
      error: "Could not return the article to available.",
    });
  }
});

module.exports = router;

