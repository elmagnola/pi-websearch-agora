import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SearchResult } from "./src/http.ts";
import { Type } from "typebox";
import {
  PROVIDER_DESCRIPTIONS,
  PROVIDER_LABELS,
  WEB_SEARCH_PROVIDERS,
  getConfigPath,
  loadConfig,
  saveConfig,
  type WebSearchConfig,
  type WebSearchProvider,
} from "./src/config.ts";
import { runWebSearch, MAX_RESULTS } from "./src/search.ts";
import { webFetch } from "./src/fetch.ts";

const STATUS_KEY = "websearch";
const TOOL_SEARCH = "web_search";
const TOOL_FETCH = "web_fetch";

let config: WebSearchConfig = loadConfig();

function refreshConfig(): WebSearchConfig {
  config = loadConfig();
  return config;
}

function requireConfig(): WebSearchConfig {
  return config ?? refreshConfig();
}

function formatSearchResults(
  query: string,
  results: SearchResult[],
  answer: string | undefined,
  provider: WebSearchProvider,
): string {
  const lines: string[] = [`Search results for "${query}" (${PROVIDER_LABELS[provider]}):`];
  if (answer) lines.push("", `Answer: ${answer}`);
  lines.push("");
  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title || "(untitled)"}`);
    lines.push(`   ${result.url}`);
    if (result.description) lines.push(`   ${result.description}`);
    if (result.score !== undefined) lines.push(`   (relevance ${result.score.toFixed(2)})`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function searchErrorMessage(query: string, error: string, message?: string): string {
  const suffix = message ? `: ${message}` : "";
  switch (error) {
    case "no_query":
      return "Error: no search query was provided.";
    case "no_api_key":
      return `Error: ${message ?? "No API key configured for the selected provider."}`;
    case "no_results":
      return `No results found for "${query}": ${message ?? "the provider returned an empty result set."}`;
    case "captcha":
      return `Search blocked: ${message ?? "the provider triggered bot detection."}`;
    case "network_error":
      return `Network error while searching for "${query}"${suffix}`;
    case "no_response":
      return `The provider returned an empty response for "${query}".`;
    default:
      return `Search failed for "${query}"${suffix}`;
  }
}

export default function (pi: ExtensionAPI) {
  refreshConfig();

  const searchTool = {
    name: TOOL_SEARCH,
    label: "Web Search",
    description:
      "Search the web for current information. Use this to find facts, news, or data not in your training set.",
    promptSnippet: "Search the web for current information",
    promptGuidelines: [
      "Use web_search when you need facts, news, or data that may not be in your training set.",
      "Use web_fetch after web_search when you need the full text of a specific result page.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query to execute." }),
      num_results: Type.Optional(
        Type.Integer({
          description: `Number of results to return (1-${MAX_RESULTS}).`,
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { query: string; num_results?: number },
      signal: AbortSignal,
    ) {
      const current = requireConfig();
      if (!current.enabled) {
        throw new Error("Web search is disabled. Run /websearch to enable it.");
      }
      const outcome = await runWebSearch(params.query, params.num_results, current, signal);
      if (!outcome.ok) throw new Error(searchErrorMessage(params.query, outcome.error, outcome.message));
      return {
        content: [
          {
            type: "text" as const,
            text: formatSearchResults(params.query, outcome.results, outcome.answer, current.provider),
          },
        ],
        details: {
          provider: current.provider,
          query: params.query,
          count: outcome.results.length,
          results: outcome.results,
        },
      };
    },
  };

  const fetchTool = {
    name: TOOL_FETCH,
    label: "Web Fetch",
    description:
      "Fetch and read the full text content of a web page. Use this after web_search when you need more detail from a specific page.",
    promptSnippet: "Fetch and read the full text content of a web page",
    promptGuidelines: [
      "Use web_fetch when you have a specific URL and need its readable text content.",
      "If web_fetch returns a truncated result, call it again with a larger maxChars.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL of the page to fetch." }),
      maxChars: Type.Optional(
        Type.Integer({
          description:
            'Maximum characters of text to return (default 8000, max 100000). If the result says it was truncated, call again with a larger maxChars.',
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { url: string; maxChars?: number },
      signal: AbortSignal,
    ) {
      const outcome = await webFetch(params.url, params.maxChars, signal);
      if (!outcome.ok) throw new Error(`Failed to fetch ${params.url}: ${outcome.message}`);
      const header = outcome.truncated
        ? `Content of ${outcome.url} (truncated: showing ${outcome.text.length} of ${outcome.totalChars} chars — call again with a larger maxChars for more):`
        : `Content of ${outcome.url}:`;
      return {
        content: [{ type: "text" as const, text: `${header}\n\n${outcome.text}` }],
        details: { url: outcome.url, truncated: outcome.truncated, totalChars: outcome.totalChars },
      };
    },
  };

  pi.registerTool(searchTool);
  pi.registerTool(fetchTool);

  pi.registerCommand("websearch", {
    description: "Configure the web search provider, API keys, and result count",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["status", "enable", "disable", "provider", "key", "results", "baseurl", "test"];
      const matches = subcommands
        .filter((value) => value.startsWith(prefix.trim()))
        .map((value) => ({ value, label: value }));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args: string, ctx: ExtensionContext) => {
      const [subcommand, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      switch (subcommand) {
        case "status":
          showStatus(ctx);
          return;
        case "enable":
          updateConfig({ enabled: true });
          ctx.ui.notify("Web search enabled.", "info");
          syncStatus(ctx);
          return;
        case "disable":
          updateConfig({ enabled: false });
          ctx.ui.notify("Web search disabled.", "info");
          syncStatus(ctx);
          return;
        case "provider":
          await chooseProvider(rest[0], ctx);
          return;
        case "key":
          await setApiKey(rest[0], ctx);
          return;
        case "results":
          await setNumResults(ctx);
          return;
        case "baseurl":
          await setBaseUrl(rest.join(" "), ctx);
          return;
        case "test":
          await runTestSearch(rest.join(" "), ctx);
          return;
        default:
          await interactiveMenu(ctx);
          return;
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    syncStatus(ctx);
  });

  function updateConfig(patch: Partial<WebSearchConfig>): WebSearchConfig {
    config = { ...config, ...patch };
    saveConfig(config);
    return config;
  }

  function showStatus(ctx: ExtensionContext): void {
    const current = requireConfig();
    const lines = [
      `Web search: ${current.enabled ? "enabled" : "disabled"}`,
      `Provider: ${PROVIDER_LABELS[current.provider]}`,
      `Results: ${current.numResults}`,
      `API key: ${current.provider === "duckduckgo" ? "n/a" : current.provider === "searxng" ? "n/a" : current.apiKeys[current.provider] ? "set" : "missing"}`,
      current.provider === "searxng" ? `SearXNG URL: ${current.baseUrl || "https://searx.be (default)"}` : undefined,
      `Config file: ${getConfigPath()}`,
    ].filter((line): line is string => Boolean(line));
    ctx.ui.notify(lines.join("\n"), "info");
  }

  function syncStatus(ctx: ExtensionContext): void {
    const current = requireConfig();
    ctx.ui.setStatus(
      STATUS_KEY,
      current.enabled ? `search: ${PROVIDER_LABELS[current.provider]}` : "search: off",
    );
  }

  async function chooseProvider(argument: string | undefined, ctx: ExtensionContext): Promise<void> {
    const trimmed = (argument ?? "").trim().toLowerCase();
    let provider: WebSearchProvider | undefined;
    if (trimmed && (WEB_SEARCH_PROVIDERS as readonly string[]).includes(trimmed)) {
      provider = trimmed as WebSearchProvider;
    } else {
      const choice = await ctx.ui.select(
        "Choose web search provider",
        WEB_SEARCH_PROVIDERS.map(
          (value) => `${PROVIDER_LABELS[value]} — ${PROVIDER_DESCRIPTIONS[value]}`,
        ),
      );
      if (!choice) return;
      provider = WEB_SEARCH_PROVIDERS.find((value) => choice.startsWith(PROVIDER_LABELS[value]));
    }
    if (!provider) {
      ctx.ui.notify("Unknown provider. Valid options: " + WEB_SEARCH_PROVIDERS.join(", "), "warning");
      return;
    }
    updateConfig({ provider });
    ctx.ui.notify(`Provider set to ${PROVIDER_LABELS[provider]}.`, "info");
    syncStatus(ctx);
    if (provider !== "duckduckgo" && provider !== "searxng" && !config.apiKeys[provider]) {
      ctx.ui.notify(`Remember to set the ${PROVIDER_LABELS[provider]} API key with /websearch key.`, "warning");
    }
  }

  async function setApiKey(providerArg: string | undefined, ctx: ExtensionContext): Promise<void> {
    let provider = (providerArg ?? "").trim().toLowerCase() as WebSearchProvider;
    if (!(WEB_SEARCH_PROVIDERS as readonly string[]).includes(provider)) {
      const choice = await ctx.ui.select(
        "Set API key for which provider?",
        WEB_SEARCH_PROVIDERS.filter((value) => value !== "duckduckgo" && value !== "searxng").map(
          (value) => PROVIDER_LABELS[value],
        ),
      );
      if (!choice) return;
      provider = (WEB_SEARCH_PROVIDERS as readonly string[]).find(
        (value) => PROVIDER_LABELS[value as WebSearchProvider] === choice.trim(),
      ) as WebSearchProvider;
    }
    if (provider === "duckduckgo" || provider === "searxng") {
      ctx.ui.notify(`${PROVIDER_LABELS[provider]} does not use an API key.`, "warning");
      return;
    }
    const key = await ctx.ui.input(`API key for ${PROVIDER_LABELS[provider]}:`, "paste key");
    if (key === undefined) return;
    const apiKeys = { ...config.apiKeys, [provider]: key.trim() };
    updateConfig({ apiKeys });
    ctx.ui.notify(key.trim() ? `${PROVIDER_LABELS[provider]} API key saved.` : "API key cleared.", "info");
  }

  async function setNumResults(ctx: ExtensionContext): Promise<void> {
    const answer = await ctx.ui.input("Number of search results (1-10):", String(config.numResults));
    if (answer === undefined) return;
    const parsed = Number.parseInt(answer.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_RESULTS) {
      ctx.ui.notify(`Enter a number between 1 and ${MAX_RESULTS}.`, "warning");
      return;
    }
    updateConfig({ numResults: parsed });
    ctx.ui.notify(`Search result count set to ${parsed}.`, "info");
  }

  async function setBaseUrl(argument: string, ctx: ExtensionContext): Promise<void> {
    const value = argument.trim() || (await ctx.ui.input("SearXNG base URL:", config.baseUrl || "https://searx.be"));
    if (value === undefined) return;
    updateConfig({ baseUrl: value.trim() });
    ctx.ui.notify(`SearXNG base URL set to ${value.trim() || "(default https://searx.be)"}.`, "info");
  }

  async function runTestSearch(queryArg: string, ctx: ExtensionContext): Promise<void> {
    const query = queryArg.trim() || (await ctx.ui.input("Test query:", "pi coding agent"));
    if (!query) return;
    const current = requireConfig();
    ctx.ui.notify(`Searching via ${PROVIDER_LABELS[current.provider]}...`, "info");
    const outcome = await runWebSearch(query, current.numResults, current);
    if (!outcome.ok) {
      ctx.ui.notify(searchErrorMessage(query, outcome.error, outcome.message), "error");
      return;
    }
    ctx.ui.notify(
      formatSearchResults(query, outcome.results, outcome.answer, current.provider),
      "info",
    );
  }

  async function interactiveMenu(ctx: ExtensionContext): Promise<void> {
    const current = requireConfig();
    const choice = await ctx.ui.select("Web search settings", [
      `Toggle (currently ${current.enabled ? "enabled" : "disabled"})`,
      `Provider (currently ${PROVIDER_LABELS[current.provider]})`,
      "Set API key",
      `Result count (currently ${current.numResults})`,
      "Set SearXNG URL",
      "Run test search",
      "Show status",
    ]);
    if (!choice) return;
    if (choice.startsWith("Toggle")) {
      updateConfig({ enabled: !current.enabled });
      ctx.ui.notify(`Web search ${config.enabled ? "enabled" : "disabled"}.`, "info");
      syncStatus(ctx);
    } else if (choice.startsWith("Provider")) {
      await chooseProvider(undefined, ctx);
    } else if (choice.startsWith("Set API key")) {
      await setApiKey(undefined, ctx);
    } else if (choice.startsWith("Result count")) {
      await setNumResults(ctx);
    } else if (choice.startsWith("Set SearXNG URL")) {
      await setBaseUrl("", ctx);
    } else if (choice.startsWith("Run test search")) {
      await runTestSearch("", ctx);
    } else if (choice.startsWith("Show status")) {
      showStatus(ctx);
    }
  }

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
