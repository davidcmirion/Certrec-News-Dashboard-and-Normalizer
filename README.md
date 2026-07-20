# Certrec News Dashboard and Normalizer

## Purpose

The Certrec News Dashboard and Normalizer is an internal tool designed to help the Data Team find timely, relevant news articles and prepare them for posting in the existing Certrec publishing portal.

## Problem Being Solved

The current workflow requires staff to manually visit approved news sources each day to find recent and appropriate articles. This can result in time being spent on sources with no usable content, articles that are too old to post, or duplicate work between the Recall and Recall New Build article repositories.

Preparing article text for posting also requires several manual cleanup steps, including correcting smart quotes, en/em dashes, invisible characters, formatting, and hyperlinks.

## Project Goals

This tool will:

- Pull recent article titles and links from selected approved news sources.
- Allow users to filter articles by repository and publication age.
- Help Recall and Recall New Build users avoid selecting the same article.
- Provide a separate text normalizer for preparing copied article content before it is pasted into the existing publishing portal.
- Preserve valid hyperlinks while removing unnecessary formatting and common problematic characters.
- Reduce or eliminate the current manual Notepad++ cleanup step.

## Intended Users

The tool is intended for the three Data Team staff members who post articles for:

- Recall
- Recall New Build
- RegSource GRC

## Planned Technology

- GitHub and GitHub Codespaces for code storage and development
- HTML, CSS, and JavaScript for the user-facing pages
- Python for backend processing
- Render for hosting
- Neon Postgres for shared persistent article and claim data

## Important Scope Note

The normalizer will process pasted article content locally in the user's browser. The application will store only article metadata and workflow status, such as source, link, publication date, claim status, and posted status.

The tool will not replace the official Certrec validation or publishing process.
