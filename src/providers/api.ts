import {
  httpJson,
  safeJsonParse,
  type SearchOutcome,
  type SearchResult,
} from "../http.ts";
import { normalizeSearxngBaseUrl } from "../config.ts";

interface RawResult {
  [key: string]: unknown;
}

function asArray(value: unknown): RawResult[] {
  return Array.isArray(value) ? (value as RawResult[]) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function searxngSearchUrl(configuredBaseUrl: string, query: string): string {
  const base = normalizeSearxngBaseUrl(configuredBaseUrl);
  return `${base}/search?q=${encodeQueryComponent(query)}&format=json`;
}

function encodeQueryComponent(query: string): string {
  return encodeURIComponent(query)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function kagiSearchRequestBody(query: string, numResults: number): string {
  return JSON.stringify({
    query,
    workflow: "search",
    limit: Math.min(10, Math.max(1, numResults)),
  });
}

export function normalizeKagiSearchResponse(
  responseBody: string,
  numResults: number,
): SearchOutcome {
  const root = safeJsonParse<RawResult>(responseBody);
  const data = root?.["data"] as RawResult | undefined;
  const searchResults = data?.["search"];
  if (!Array.isArray(searchResults)) return { ok: false, error: "no_results" };

  const results: SearchResult[] = [];
  for (const element of searchResults) {
    if (results.length >= Math.min(10, Math.max(1, numResults))) break;
    const result = element as RawResult;
    const url = str(result["url"]);
    if (!url) continue;
    results.push({
      title: str(result["title"]),
      url,
      description: str(result["snippet"]),
    });
  }
  if (results.length === 0) return { ok: false, error: "no_results" };
  return { ok: true, results };
}

export async function braveSearch(
  query: string,
  numResults: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;
  const response = await httpJson(
    url,
    {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    },
    { signal },
  );
  if (!response.ok) return { ok: false, error: response.error, message: response.message };

  const json = safeJsonParse<RawResult>(response.body);
  const web = json?.["web"] as RawResult | undefined;
  const resultsArray = asArray(web?.["results"]);
  if (resultsArray.length === 0) return { ok: false, error: "no_results" };

  return { ok: true, results: resultsArray.map(mapGenericResult) };
}

export async function kagiSearch(
  query: string,
  numResults: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const response = await httpJson(
    "https://kagi.com/api/v1/search",
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: kagiSearchRequestBody(query, numResults),
    },
    { signal },
  );
  if (!response.ok) return { ok: false, error: response.error, message: response.message };
  return normalizeKagiSearchResponse(response.body, numResults);
}

export async function serperSearch(
  query: string,
  numResults: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const response = await httpJson(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: numResults }),
    },
    { signal },
  );
  if (!response.ok) return { ok: false, error: response.error, message: response.message };

  const json = safeJsonParse<RawResult>(response.body);
  const resultsArray = asArray(json?.["organic"]);
  if (resultsArray.length === 0) return { ok: false, error: "no_results" };
  return { ok: true, results: resultsArray.map(mapGenericResult) };
}

export async function tavilySearch(
  query: string,
  numResults: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const response = await httpJson(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: numResults,
        search_depth: "advanced",
        include_answer: true,
      }),
    },
    { signal },
  );
  if (!response.ok) return { ok: false, error: response.error, message: response.message };

  const json = safeJsonParse<RawResult>(response.body);
  const resultsArray = asArray(json?.["results"]);
  if (resultsArray.length === 0) return { ok: false, error: "no_results" };

  const answer = str(json?.["answer"]);
  const results: SearchResult[] = resultsArray.map((obj) => {
    const score = typeof obj["score"] === "number" ? (obj["score"] as number) : undefined;
    return {
      title: str(obj["title"]),
      url: str(obj["url"]),
      description: str(obj["content"]),
      ...(score !== undefined ? { score } : {}),
    };
  });
  return { ok: true, results, ...(answer ? { answer } : {}) };
}

export async function searxngSearch(
  query: string,
  numResults: number,
  apiKey: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const response = await httpJson(
    searxngSearchUrl(baseUrl, query),
    { headers: { "User-Agent": WEB_SEARCH_PROVIDER_UA } },
    { signal },
  );
  if (!response.ok) return { ok: false, error: response.error, message: response.message };

  const json = safeJsonParse<RawResult>(response.body);
  const resultsArray = asArray(json?.["results"]).slice(0, numResults);
  if (resultsArray.length === 0) return { ok: false, error: "no_results" };

  const results: SearchResult[] = resultsArray.map((obj) => ({
    title: str(obj["title"]),
    url: str(obj["url"]),
    description: str(obj["content"]) || str(obj["snippet"]),
  }));
  return { ok: true, results };
}

function mapGenericResult(obj: RawResult): SearchResult {
  return {
    title: str(obj["title"]),
    url: str(obj["link"]) || str(obj["url"]),
    description: str(obj["snippet"]) || str(obj["content"]) || str(obj["description"]),
  };
}

const WEB_SEARCH_PROVIDER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
