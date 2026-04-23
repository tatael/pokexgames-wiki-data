# pokexgames-wiki-data

Static wiki-data pipeline for PokeXGames consumers.

This repo owns:
- source page inventory
- wiki scraping and normalization
- JSON bundle validation
- publishing `manifest.json`, nested `pages/...json`, and a root `index.html` landing page for GitHub Pages consumers

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
- `images`
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
- `images`
- `sections`
- `metadata`

Section contract (`schemaVersion: 2`):
- generated sections use `title` and optional `content`, not scraped `heading` / `paragraphs` / `items`
- `content.<locale>.paragraphs` is normalized prose that still belongs on the page
- `content.<locale>.bullets` is only for simple list content that has no stronger semantic model yet
- pipe-style source rows are published as `tables.<locale>[].rows[].cells[]` instead of string rows such as `A | B | C`
- semantic data is published in dedicated fields such as `facts`, `tasks`, `taskGroups`, `rewards`, `pokemon`, `profile`, `moves`, `effectiveness`, `variants`, `abilities`, `steps`, and `locations`
- consumers should treat those semantic fields as source of truth and should not re-parse raw wiki table/list text

## Pipeline Architecture

Wiki normalization is split by responsibility under `scripts/lib/transform/`:
- `text.mjs`: shared text cleanup, slug/dedupe helpers, image-reference stripping
- `pokemon.mjs`: Pokémon profile, tier, move, effectiveness, variant, and raw Pokémon-reference cleanup
- `rewards.mjs`: loot, ranking, difficulty, and task reward parsing
- `tasks.mjs`: task objective, requirement, group, and reward normalization
- `publish.mjs`: public schema projection from internal scraped fields to schema v2 fields

`scripts/lib/transform.mjs` is the orchestrator. Keep new parsers in the responsibility-specific module instead of growing `transform.mjs`.

Example task section shape:

```json
{
  "id": "nightmare-tasks",
  "kind": "tasks",
  "title": { "pt-BR": "Nightmare Tasks", "en": "Nightmare Tasks", "es": "Nightmare Tasks" },
  "content": {
    "pt-BR": {
      "paragraphs": ["As Nightmare Balls e Beast Balls NAO sao itens unicos."]
    }
  },
  "taskGroups": {
    "pt-BR": {
      "intro": ["As Nightmare Balls e Beast Balls NAO sao itens unicos."],
      "groups": [
        {
          "name": "Nightmare Cerulean",
          "tasks": [
            {
              "index": 1,
              "title": "NPC Missy",
              "npc": "Missy",
              "objective": "Derrotar: 300 Meowstic",
              "objectiveDetails": {
                "type": "defeat",
                "targets": [{ "name": "Meowstic", "slug": "meowstic", "amount": 300 }]
              },
              "requirements": { "level": 400, "nightmareLevel": 50 },
              "rewards": [
                { "type": "loot", "name": "Experiencia", "icon": "xp", "qty": "2.000.000" },
                { "type": "loot", "name": "Nightmare Experience", "icon": "nightmare-xp", "qty": "40.000" },
                { "type": "loot", "name": "Black Nightmare Gem", "qty": "2" }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

`images`, when present, contains the canonical remote wiki assets already resolved during sync:
- Pokémon pages now publish `hero.url` as the single canonical image field used for both base pages and variants
- non-Pokémon pages may still publish `sprite.url` and/or `hero.url` depending on the source page assets

Consumer apps should use these published image URLs as the source of truth and only own local binary caching/downloading on their side.

The transport manifest intentionally does not include local cache paths. Consumers should synthesize any local-only path fields when persisting cache.

Current locale note:
- source pages are scraped from the Portuguese wiki
- `en` and `es` currently mirror the normalized `pt-BR` text until a real translation source exists

## Local Commands

```bash
npm run sync
npm run validate
npm run serve
```

`npm run sync` fetches source pages, writes `dist/manifest.json` and `dist/pages/*.json`, then validates the generated bundle.
It also writes `dist/index.html`, which serves as a human-readable landing page for the published GitHub Pages site.

Useful environment overrides:
- `WIKI_DISCOVERY_FORCE=1`: rebuild the generated Pokémon inventory instead of reusing the cached file
- `WIKI_DISCOVERY_CONCURRENCY=48`: control API-based Pokémon discovery parallelism
- `WIKI_SYNC_CONCURRENCY=24`: control page sync parallelism
- `WIKI_DISCOVERY_CACHE_HOURS=168`: control how long `.cache/pokemon-pages.generated.json` is reused
- `WIKI_FETCH_MODE=live|cache|prefer-cache`: choose whether page HTML is fetched live, loaded only from `.cache/html`, or loaded from cache when fresh and fetched live otherwise
- `WIKI_FETCH_CACHE_HOURS=168`: control how long cached page HTML is considered fresh for `prefer-cache`
- `WIKI_SYNC_ONLY=entei,king-charizard-dungeon`: sync only specific page slugs or exact source URLs
- `WIKI_SYNC_CATEGORY=boss-fight,quests`: sync only specific categories
- `WIKI_REFRESH=entei,king-charizard-dungeon`: force a live refetch and cache refresh for specific page slugs or exact source URLs
- `WIKI_SKIP_VALIDATE=1`: skip bundle validation during fast local iteration

`npm run serve` starts a local HTTP server at `http://127.0.0.1:8787` that serves the `dist/` folder.
Set `PORT=<number>` to use a different port.

## Local Testing

To test changes without pushing to GitHub, serve the bundle locally and point your consumer app at it:

```bash
npm run sync     # regenerate dist/ after any scraper changes
npm run serve    # starts http://127.0.0.1:8787, keep running while you test
```

Fast local iteration examples:

```bash
WIKI_FETCH_MODE=prefer-cache npm run sync
WIKI_FETCH_MODE=prefer-cache WIKI_SYNC_ONLY=entei npm run sync
WIKI_FETCH_MODE=prefer-cache WIKI_SYNC_CATEGORY=boss-fight npm run sync
WIKI_FETCH_MODE=live WIKI_REFRESH=entei WIKI_SYNC_ONLY=entei npm run sync
WIKI_FETCH_MODE=cache WIKI_SYNC_ONLY=entei WIKI_SKIP_VALIDATE=1 npm run sync
```

Recommended local workflow:
- first fetch a page live once
- then iterate with `WIKI_FETCH_MODE=prefer-cache` or `WIKI_FETCH_MODE=cache`
- use `WIKI_REFRESH=<slug>` when you want to update the cached HTML for a specific page

Then configure your consumer app to read from `http://127.0.0.1:8787` instead of the published URL.
How to do this depends on the consumer; check its documentation for a wiki base URL override.

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
- Pokémon pages are discovered through the MediaWiki API, cached locally in `.cache/pokemon-pages.generated.json`, and then synced like any other page entry

Current known limitation:
- `Profissões` likely needs custom pathing/discovery rules beyond the generic recursive heuristics, because cross-linked profession systems can still produce semantically wrong branches if treated as a pure link graph

## Publish Flow

GitHub Actions runs the daily sync and deploys the generated `dist/` folder to GitHub Pages.

Default published URLs:
- `https://<owner>.github.io/pokexgames-wiki-data/`
- `https://<owner>.github.io/pokexgames-wiki-data/manifest.json`
- `https://<owner>.github.io/pokexgames-wiki-data/pages/<slug>.json`

The root URL is intentionally human-readable and documents the bundle shape, basic consumer notes, and visible category/page coverage by loading `manifest.json` client-side.

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
