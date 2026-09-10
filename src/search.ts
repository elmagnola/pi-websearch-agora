import type { WebSearchConfig } from "./config.ts";
import { PROVIDER_LABELS } from "./config.ts";
import type { SearchOutcome } from "./http.ts";
import { duckDuckGoSearch } from "./providers/duckduckgo.ts";
import {
  braveSearch,
  kagiSearch,
  searxngSearch,
  serperSearch,
  tavilySearch,
} from "./providers/api.ts";

export const MAX_RESULTS = 10;

export function clampNumResults(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  const basis = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(MAX_RESULTS, Math.max(1, Math.trunc(basis)));
}

export async function runWebSearch(
  query: string,
  requestedNumResults: unknown,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const numResults = clampNumResults(requestedNumResults, config.numResults);
  const provider = config.provider;

  try {
    if (provider === "duckduckgo") {
      return await duckDuckGoSearch(query, numResults, signal);
    }

    const apiKey = config.apiKeys[provider] ?? "";
    if (provider !== "searxng" && !apiKey) {
      return {
        ok: false,
        error: "no_api_key",
        message: `${PROVIDER_LABELS[provider]} requires an API key. Run /websearch to configure it.`,
      };
    }

    switch (provider) {
      case "brave":
        return await braveSearch(query, numResults, apiKey, signal);
      case "kagi":
        return await kagiSearch(query, numResults, apiKey, signal);
      case "serper":
        return await serperSearch(query, numResults, apiKey, signal);
      case "tavily":
        return await tavilySearch(query, numResults, apiKey, signal);
      case "searxng":
        return await searxngSearch(query, numResults, apiKey, config.baseUrl, signal);
    }
  } catch (error) {
    return { ok: false, error: "search_error", message: (error as Error).message };
  }
}
