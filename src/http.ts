import { NETWORK_TOOL_TIMEOUT_MS, DEFAULT_WEB_FETCH_USER_AGENT } from "./config.ts";

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  score?: number;
}

export type SearchOutcome =
  | { ok: true; results: SearchResult[]; answer?: string }
  | { ok: false; error: string; message?: string };

export const AGORA_USER_AGENT = "Mozilla/5.0 (compatible; Agora/1.0)";

export interface FetchOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function combineSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener("abort", onAbort);
    },
  };
}

export async function httpText(
  url: string,
  options: FetchOptions = {},
): Promise<{ ok: true; body: string } | { ok: false; error: string; message: string }> {
  const timeoutMs = options.timeoutMs ?? NETWORK_TOOL_TIMEOUT_MS;
  const { signal, cleanup } = combineSignals(options.signal, timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": DEFAULT_WEB_FETCH_USER_AGENT, ...options.headers },
      signal,
      redirect: "follow",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: "network_error",
        message: `HTTP ${response.status} ${response.statusText}`,
      };
    }
    return { ok: true, body: await response.text() };
  } catch (error) {
    return { ok: false, error: "network_error", message: (error as Error).message };
  } finally {
    cleanup();
  }
}

export async function httpJson(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  options: FetchOptions = {},
): Promise<{ ok: true; body: string } | { ok: false; error: string; message: string }> {
  const timeoutMs = options.timeoutMs ?? NETWORK_TOOL_TIMEOUT_MS;
  const { signal, cleanup } = combineSignals(options.signal, timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { "User-Agent": DEFAULT_WEB_FETCH_USER_AGENT, ...init.headers },
      body: init.body,
      signal,
      redirect: "follow",
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        error: "network_error",
        message: `HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`,
      };
    }
    return { ok: true, body };
  } catch (error) {
    return { ok: false, error: "network_error", message: (error as Error).message };
  } finally {
    cleanup();
  }
}

export function safeJsonParse<T = unknown>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
