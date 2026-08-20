-- Feed ingestion fields for full-text articles and stable feed-item deduplication.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

UPDATE articles
SET dedupe_key = COALESCE(source, '') || ':' || COALESCE(NULLIF(source_guid, ''), canonical_url)
WHERE dedupe_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS articles_dedupe_key_idx
  ON articles (dedupe_key);
