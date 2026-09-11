# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`pi-websearch-agora` is a [Pi](https://pi.dev) agent extension that ports
[Agora's](https://github.com/newo-ether/Agora/) `WebSearchToolProvider`
(`WebSearchToolProvider.kt`). It registers two tools — `web_search` and
`web_fetch` — and one interactive `/websearch` config command.

Logic is deliberately split into small, single-responsibility modules under
`src/`. Output is Pi-native human/LLM-readable text (not a JSON envelope).

## Project layout

| Path | Responsibility |
| --- | --- |
| `index.ts` | Entry point. Registers tools/commands, formats results, `/websearch` UI, config mutations. |
| `src/config.ts` | Provider registry + typed config model, env/file loading, normalization. **Add new providers here first.** |
| `src/search.ts` | Orchestrates a `web_search`: clamps result count, dispatches to the selected provider. |
| `src/fetch.ts` | Orchestrates `web_fetch`: fetches a URL and extracts readable text. |
| `src/providers/` | Individual backend implementations (one file per concern). |
| `src/http.ts` | Low-level HTTP helpers (`httpJson`, `httpText`, `safeJsonParse`) + `SearchResult` / `SearchOutcome` types. |
| `src/html.ts` | HTML→text / entity / tag utilities. |
| `src/entities.ts` | Named HTML entity table (`NAMED_ENTITIES`). |
| `docs/firecrawl-docs.md` | Reference docs for the Firecrawl API provider. |
| `test/` | Unit, registration, and live smoke tests. |

## How a search flows

1. `web_search` tool calls `runWebSearch(query, num_results, config)` in `src/search.ts`.
2. `runWebSearch` clamps the result count with `clampNumResults` (1–10), reads
   `config.provider`, and dispatches to a provider function:
   - `duckduckgo` → `duckDuckGoSearch` (`src/providers/duckduckgo.ts`)
   - everything else → `src/providers/api.ts` (`braveSearch`, `kagiSearch`,
     `serperSearch`, `tavilySearch`, `firecrawlSearch`, `searxngSearch`)
3. Each provider returns a `SearchOutcome`, which `index.ts` formats into text.

## Adding a new search provider

Follow this exact order so the registry stays consistent (every touchpoint is
covered by `normalizeProvider`, the `/websearch` menu, and the key-prompt logic):

1. **`src/config.ts`**
   - Add the id to the `WebSearchProvider` union and to `WEB_SEARCH_PROVIDERS`.
   - Add a label to `PROVIDER_LABELS` and description to `PROVIDER_DESCRIPTIONS`.
   - If it needs an API key, add a `process.env.*_API_KEY` entry to `ENV_KEYS`.
2. **`src/providers/api.ts`** — add an `xxxSearch` function returning
   `Promise<SearchOutcome>`; export a `normalizeXxxSearchResponse` helper so the
   response mapping can be unit-tested without a live network call.
3. **`src/search.ts`** — import it and add a `case "xxx":` to the `switch`.
4. **`test/unit.test.ts`** — add a normalization test.
5. **`README.md`** — add the provider to the env-var and providers tables.

Automatic handling (no manual wiring) in `index.ts`:
- `duckduckgo` and `searxng` are treated as *no-key* providers; everything else
  is treated as *key-required*. A new key-required provider is picked up
  automatically by the status display, `setApiKey` menu, and the
  "remember to set the API key" warning.

## Conventions

- **TypeScript, strict.** Run `npm run typecheck` (`tsc --noEmit`) after changes.
- **No comments** in code — naming is self-descriptive.
- **Return `SearchOutcome`** (tagged union with `ok: true/false`) from providers;
  the caller formats/throws. Reuse the existing error codes:
  `no_api_key`, `no_results`, `captcha`, `network_error`, `no_response`, `no_query`, `search_error`.
- **Provider response parsing:** normalize into `{ title, url, description }`,
  skip entries with an empty/absent URL, and return `{ ok: false, error: "no_results" }`
  when nothing usable remains.
- **Keep `httpJson`/`httpText` usage local** to `src/providers/api.ts` and
  `src/fetch.ts`; pass `{ signal }` through so aborts propagate.
- **No third-party runtime deps** beyond the `@earendil-works/pi-coding-agent`
  and `typebox` peer dependencies; HTTP uses the built-in `fetch`.
- Numeric inputs are coerced with `Number.parseInt(...)` (as used in `config.ts`,
  `search.ts`, and `fetch.ts`) so callers may pass strings or numbers.

## Tests

| Command | Purpose |
| --- | --- |
| `npm test` | Unit tests (`node --test --experimental-strip-types`). No network. |
| `npm run test:registration` | Confirms `web_search`, `web_fetch`, `/websearch`, and hooks register. |
| `npm run test:live` | Live smoke test hitting real endpoints (requires network + keys). |
| `npm run typecheck` | `tsc --noEmit`. |

`tsc` is not a CLI dependency; install TypeScript locally (`npm install --no-save typescript`)
if it is missing before running `typecheck`.

## Config storage

Resolved in order: environment variables, then `~/.pi/agent/websearch.json`
(or `$PI_AGENT_DIR/websearch.json`). See `README.md` for the full variable list.

## Docs

`docs/firecrawl-docs.md` is the reference for the Firecrawl provider. Keep it in
sync when the provider behavior changes.