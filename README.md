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
- `pagePath`

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

Optional entry fields:
- `navigationPath`: ordered path for future app organization, for example `["Profissões", "Estilista", "Decorador", "Decorator Workshop"]`
- `pageKind`: lightweight page classification such as `overview`, `craft`, `specialization`, `workshop`, `dungeons`
- `children`: discovery rule for seed/index pages; currently supports `mode: "discover-links"` to expand internal wiki links into generated entries
  - `maxDepth`: recursive discovery depth, for example `3` for `Profissões`

Discovery behavior:
- translated variant pages such as `(ES)` / `(EN)` are skipped during recursive discovery
- generic heading labels such as `Índice`, `Introdução`, or `Primeros pasos` are ignored in generated navigation paths
- semantic child pages prefer normalized filenames such as `crafts.json`, `workshop.json`, `dungeons.json`, and `maps.json`

Current known limitation:
- `Profissões` likely needs custom pathing/discovery rules beyond the generic recursive heuristics, because cross-linked profession systems can still produce semantically wrong branches if treated as a pure link graph

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

## Discovery Output

When `children.mode` is enabled on a config entry, the sync pipeline also writes:
- `dist/discovered-pages.json`

That file is a review/debug artifact showing which child pages were discovered from seed pages such as `NPC's`.

Published page files now live under category and hierarchy folders, for example:
- `dist/pages/clans/volcanic.json`
- `dist/pages/npcs/roberto.json`
- `dist/pages/professions/estilista/decorador/decorator-workshop.json`
