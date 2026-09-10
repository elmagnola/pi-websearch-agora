# pi-websearch-agora

A [Pi](https://pi.dev) agent extension that ports Agora's `WebSearchToolProvider`
(`app/src/main/java/com/newoether/agora/tool/WebSearchToolProvider.kt`) to TypeScript.

It registers two tools and one command:

| Tool / command | Purpose |
| --- | --- |
| `web_search` | Search the web for current information. |
| `web_fetch` | Fetch a URL and extract its readable text. |
| `/websearch` | Interactive configuration (provider, keys, results, base URL). |

## Install

Point Pi at the extension file:

```bash
pi -e ./index.ts
```

Or copy `index.ts` and `src/` under `~/.pi/agent/extensions/websearch-agora/` and
add an `index.ts` entry so Pi discovers it automatically.

The extension depends only on the Pi extensions API and `typebox`, both provided by
the Pi host. No third-party runtime dependencies are required.

## Configuration

Configuration is resolved in this order (first match wins):

1. Environment variables
2. `~/.pi/agent/websearch.json`

Environment variables:

| Variable | Meaning |
| --- | --- |
| `WEB_SEARCH_PROVIDER` | `duckduckgo`, `brave`, `kagi`, `serper`, `tavily`, `searxng` |
| `WEB_SEARCH_ENABLED` | `0` / `false` to disable |
| `WEB_SEARCH_NUM_RESULTS` | 1–10 (default 5) |
| `WEB_SEARCH_BASE_URL` | SearXNG base URL (default `https://searx.be`) |
| `BRAVE_API_KEY` | Brave Search key |
| `KAGI_API_KEY` | Kagi key |
| `SERPER_API_KEY` | Serper key |
| `TAVILY_API_KEY` | Tavily key |

The config file has the same shape as Agora's persisted settings:

```json
{
  "enabled": true,
  "provider": "duckduckgo",
  "apiKeys": { "brave": "..." },
  "numResults": 5,
  "baseUrl": ""
}
```

## Usage

```
/websearch                 # interactive menu
/websearch status          # show current configuration
/websearch enable
/websearch disable
/websearch provider brave
/websearch key tavily      # prompts for the key
/websearch results         # prompts for 1-10
/websearch baseurl https://searx.example.com
/websearch test pi agent   # run a live search
```

## Providers

| Provider | Key required | Notes |
| --- | --- | --- |
| DuckDuckGo | no | Scrapes `lite.duckduckgo.com` with auto-pagination and CAPTCHA detection. Default. |
| Brave | yes | `api.search.brave.com` |
| Kagi | yes | `kagi.com/api/v1/search` |
| Serper | yes | `google.serper.dev/search` |
| Tavily | yes | `api.tavily.com/search`, includes an AI answer when available. |
| SearXNG | no (URL) | `<baseUrl>/search?q=…&format=json` |

## Port parity notes

Ported faithfully from Agora:

- Five API providers plus the DuckDuckGo scraper.
- DuckDuckGo auto-pagination via the `vqd` token and `s` offset, with URL dedup,
  CAPTCHA detection, and partial-result tolerance.
- Kagi and Tavily response normalization, including Tavily's `answer` and `score`.
- `web_fetch` HTML→text extraction: caps raw HTML at 600k chars, strips comments,
  `script`/`style`/`noscript`/`svg`/`head`, and `nav`/`header`/`footer`/`aside`,
  decodes entities, collapses whitespace, and reports `truncated`/`totalChars`.
- `maxChars` bounds: default 8000, max 100000; `num_results` bounds: 1–10.
- SearXNG URL construction (trailing-slash stripping, no `engines=` pin, `+`-encoded
  spaces to match Kotlin's `URLEncoder`); a browser-like User-Agent is sent.
- Same errors surfaced: `no_api_key`, `no_results`, `captcha`, `network_error`,
  `search_error`.

Intentional differences:

- **Pi-native output.** Tool results are human/LLM-readable text (numbered results
  with titles, URLs, and snippets), not Agora's JSON envelope. Errors throw so Pi
  marks the tool result as failed.
- **Configuration** is via env vars / `websearch.json` and the `/websearch` command
  instead of Agora's Compose settings screen.
- Header casing and HTTP client differ (Node `fetch` vs OkHttp).

## Development

```bash
npm install          # peer deps for typechecking
npm run typecheck
npm test             # unit tests (no network)
npm run test:registration
npm run test:live    # hits DuckDuckGo + example.com
```

Layout:

```
index.ts                 extension wiring, tools, /websearch command
src/config.ts            config file + env resolution
src/http.ts              fetch helpers, timeouts, abort handling
src/html.ts              HTML -> readable text + entity decoding
src/entities.ts          named HTML entity table
src/search.ts            provider dispatch + num_results clamping
src/fetch.ts             web_fetch implementation
src/providers/api.ts     brave, kagi, serper, tavily, searxng
src/providers/duckduckgo.ts  DuckDuckGo scraper
```
