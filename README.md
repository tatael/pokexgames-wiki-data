# pokexgames-wiki-data

Static wiki-data pipeline for PokeXGames consumers.

This repo owns:
- source page inventory
- wiki scraping and normalization
- JSON bundle validation
- publishing `manifest.json` and `pages/<slug>.json`

This repo does not own:
- app-side caching
- app-side fallback behavior
- UI rendering

## Bundle Contract

Published bundle shape:
- `manifest.json`
- `pages/<slug>.json`

`manifest.json` fields:
- `schemaVersion`
- `source`
- `updatedAt`
- `categories`
- `pages`

Each page summary inside `manifest.json` contains:
- `category`
- `slug`
- `url`
- `title`
- `summary`
- `fetchedAt`

Each `pages/<slug>.json` contains:
- `category`
- `slug`
- `url`
- `source`
- `fetchedAt`
- `title`
- `summary`
- `sections`
- `metadata`

The transport manifest intentionally does not include local cache paths. Consumers should synthesize any local-only path fields when persisting cache.

Current locale note:
- source pages are scraped from the Portuguese wiki
- `en` and `es` currently mirror the normalized `pt-BR` text until a real translation source exists

## Local Commands

```bash
npm run sync
npm run validate
```

`npm run sync` fetches source pages, writes `dist/manifest.json` and `dist/pages/*.json`, then validates the generated bundle.

## Source Inventory

Source pages live in `config/wiki-pages.json`.

Each entry must define:
- `category`
- `categoryLabel`
- `slug`
- `url`
- `title`

## Publish Flow

GitHub Actions runs the daily sync and deploys the generated `dist/` folder to GitHub Pages.

Default published URLs:
- `https://<owner>.github.io/pokexgames-wiki-data/manifest.json`
- `https://<owner>.github.io/pokexgames-wiki-data/pages/<slug>.json`

## Validation Rules

The bundle publish must fail if:
- a slug is duplicated or invalid
- a page file is missing
- a page category is missing from the manifest
- required localized fields are empty
- timestamps are missing or not RFC3339
- JSON shape does not match the expected contract
