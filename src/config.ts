import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type WebSearchProvider =
  | "duckduckgo"
  | "brave"
  | "kagi"
  | "serper"
  | "tavily"
  | "searxng"
  | "firecrawl";

export const WEB_SEARCH_PROVIDERS: readonly WebSearchProvider[] = [
  "duckduckgo",
  "brave",
  "kagi",
  "serper",
  "tavily",
  "searxng",
  "firecrawl",
];

export interface WebSearchConfig {
  enabled: boolean;
  provider: WebSearchProvider;
  apiKeys: Partial<Record<WebSearchProvider, string>>;
  numResults: number;
  baseUrl: string;
}

export const PROVIDER_LABELS: Record<WebSearchProvider, string> = {
  duckduckgo: "DuckDuckGo",
  brave: "Brave Search",
  kagi: "Kagi",
  serper: "Serper",
  tavily: "Tavily",
  searxng: "SearXNG",
  firecrawl: "Firecrawl",
};

export const PROVIDER_DESCRIPTIONS: Record<WebSearchProvider, string> = {
  duckduckgo: "Free, no API key. Scrapes lite.duckduckgo.com. May be unstable.",
  brave: "Privacy-focused search API. Free tier available.",
  kagi: "Premium search API with personalized results. Pay per use.",
  serper: "Fast Google Search API. 2,500 free queries/month.",
  tavily: "AI-optimized search API. Built for LLM agents.",
  searxng: "Self-hosted metasearch engine. Provide your own instance URL.",
  firecrawl: "Web data API for AI. Scrapes or searches and returns clean results.",
};

function resolveConfigPath(): string {
  const envDir = process.env.PI_AGENT_DIR;
  if (envDir) return join(envDir, "websearch.json");
  return join(homedir(), ".pi", "agent", "websearch.json");
}

const CONFIG_PATH = resolveConfigPath();

const DEFAULT_CONFIG: WebSearchConfig = {
  enabled: true,
  provider: "duckduckgo",
  apiKeys: {},
  numResults: 5,
  baseUrl: "",
};

export const DEFAULT_SEARXNG_BASE_URL = "https://searx.be";
export const DEFAULT_WEB_FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const MAX_WEB_FETCH_HTML_LENGTH = 600_000;
export const NETWORK_TOOL_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_FETCH_CHARS = 8000;
export const MAX_MAX_FETCH_CHARS = 100_000;

export function normalizeProvider(provider: unknown): WebSearchProvider {
  const normalized = String(provider ?? "").trim().toLowerCase();
  return (WEB_SEARCH_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as WebSearchProvider)
    : "duckduckgo";
}

function clampNumResults(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CONFIG.numResults;
  return Math.min(10, Math.max(1, Math.trunc(parsed)));
}

const ENV_PROVIDER = process.env.WEB_SEARCH_PROVIDER;
const ENV_NUM_RESULTS = process.env.WEB_SEARCH_NUM_RESULTS;
const ENV_BASE_URL = process.env.WEB_SEARCH_BASE_URL;
const ENV_ENABLED = process.env.WEB_SEARCH_ENABLED;
const ENV_KEYS: Record<WebSearchProvider, string | undefined> = {
  brave: process.env.BRAVE_API_KEY,
  kagi: process.env.KAGI_API_KEY,
  serper: process.env.SERPER_API_KEY,
  tavily: process.env.TAVILY_API_KEY,
  firecrawl: process.env.FIRECRAWL_API_KEY,
  duckduckgo: undefined,
  searxng: undefined,
};

function readConfigFile(): Partial<WebSearchConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadConfig(): WebSearchConfig {
  const file = readConfigFile();
  const fileKeys =
    file.apiKeys && typeof file.apiKeys === "object" ? file.apiKeys : {};

  const apiKeys: Partial<Record<WebSearchProvider, string>> = {};
  for (const provider of WEB_SEARCH_PROVIDERS) {
    const fromEnv = ENV_KEYS[provider];
    const fromFile = (fileKeys as Record<string, unknown>)[provider];
    const value = fromEnv ?? fromFile;
    if (typeof value === "string" && value.trim()) apiKeys[provider] = value.trim();
  }

  const enabled =
    ENV_ENABLED !== undefined
      ? ENV_ENABLED !== "0" && ENV_ENABLED.toLowerCase() !== "false"
      : (file.enabled ?? DEFAULT_CONFIG.enabled);

  return {
    enabled,
    provider: normalizeProvider(ENV_PROVIDER ?? file.provider),
    apiKeys,
    numResults: clampNumResults(ENV_NUM_RESULTS ?? file.numResults),
    baseUrl: (ENV_BASE_URL ?? file.baseUrl ?? DEFAULT_CONFIG.baseUrl).trim(),
  };
}

export function saveConfig(config: WebSearchConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function normalizeSearxngBaseUrl(configuredBaseUrl: string): string {
  const base = configuredBaseUrl.trim() || DEFAULT_SEARXNG_BASE_URL;
  return base.replace(/\/+$/, "");
}
