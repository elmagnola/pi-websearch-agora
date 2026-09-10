# pi-websearch-agora

A [Pi](https://pi.dev) agent extension that ports [Agora's](https://github.com/newo-ether/Agora/) excellent  `WebSearchToolProvider`
(`app/src/main/java/com/newoether/agora/tool/WebSearchToolProvider.kt`).

Agora's search just works; most models return properly formatted results and I wanted that for my pi agent. No other extension worked as seamlessly as Agora's native search. Ported with Deepseek Flash v4.1

It registers two tools and one command:

| Tool / command | Purpose |
| --- | --- |
| `web_search` | Search the web for current information. |
| `web_fetch` | Fetch a URL and extract its readable text. |
| `/websearch` | Interactive configuration (provider, keys, results, base URL). |

## Install

Copy the entire package into `~/.pi/agent/extensions/websearch-agora/`

## Configuration

run `/websearch` for a nice UI config interface!

Configuration store is resolved in this order:
1. Environment variables
2. `~/.pi/agent/websearch.json`

## Usage

| `/websearch` | interactive config menu |
| `/websearch status` | show current configuration |
| `/websearch enable` | give pi websearch access |
| `/websearch disable` | take away pi websearch access |
| `/websearch provider` | change search provider |
| `/websearch key tavily` | prompts for your tavily API key |
| `/websearch results 2` | only fetch 2 results |
| `/websearch baseurl ` | i dunno what this does. change search API URL i guess |
| `/websearch test` | run a test search |


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

- DuckDuckGo auto-pagination via the `vqd` token and `s` offset, with URL dedup,
  CAPTCHA detection, and partial-result tolerance.
- Kagi and Tavily response normalization, including Tavily's `answer` and `score`.
- `web_fetch` HTML→text extraction: caps raw HTML at 600k chars, strips comments,
  `script`/`style`/`noscript`/`svg`/`head`, and `nav`/`header`/`footer`/`aside`,
  decodes entities, collapses whitespace, and reports `truncated`/`totalChars`.
- Same errors surfaced: `no_api_key`, `no_results`, `captcha`, `network_error`,
  `search_error`.

Intentional differences:

- **Pi-native output.** Tool results are human/LLM-readable text (numbered results
  with titles, URLs, and snippets), not Agora's JSON envelope. Errors throw so Pi
  marks the tool result as failed.
- **Configuration** is via env vars / `websearch.json` and the `/websearch` command
  instead of Agora's Compose settings screen.
- Header casing and HTTP client differ (Node `fetch` vs OkHttp).
