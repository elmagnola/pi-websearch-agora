import { AGORA_USER_AGENT, type SearchOutcome, type SearchResult } from "../http.ts";
import { decodeHtmlEntities, stripHtml } from "../html.ts";

const BASE_URL = "https://lite.duckduckgo.com/lite/";
const PAGE_SIZE = 10;
const MAX_PAGES = 5;

const LINK_TAG_REGEX = /<a\s[^>]*class=['"]result-link['"][^>]*>/g;
const HREF_REGEX = /href=['"]([^'"]*?)['"]/;
const LINK_TEXT_REGEX = /<a\s[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_REGEX = /<td[^>]+class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g;
const UDDG_REGEX = /uddg=([^&]+)/;
const CAPTCHA_REGEX = /anomaly-modal|challenge-form|Unfortunately.*bots/;
const VQD_REGEX = /name="vqd"\s+value="([^"]*)"/;
const OFFSET_REGEX = /name="s"\s+value="(\d+)"/;

type PageResult = { ok: true; html: string } | { ok: false; message: string };

export function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkTags = [...html.matchAll(LINK_TAG_REGEX)];
  const linkTexts = [...html.matchAll(LINK_TEXT_REGEX)];
  const snippets = [...html.matchAll(SNIPPET_REGEX)];

  for (let i = 0; i < linkTexts.length; i++) {
    if (results.length >= maxResults) break;
    const linkTag = linkTags[i]?.slice(0) ?? [];
    const tag = linkTag[0];
    if (!tag) continue;
    const href = HREF_REGEX.exec(tag)?.[1];
    if (!href) continue;
    const title = stripHtml(linkTexts[i][1]);
    const snippet = snippets[i] ? stripHtml(snippets[i][1]) : "";
    const url = extractUrl(href);
    if (url && title) results.push({ title, url, description: snippet });
  }
  return results;
}

function extractUrl(href: string): string {
  const uddg = UDDG_REGEX.exec(href)?.[1];
  if (uddg) {
    try {
      return decodeURIComponent(uddg);
    } catch {
      return uddg;
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

async function fetchPage(
  query: string,
  offset: number,
  vqd: string,
  signal: AbortSignal | undefined,
): Promise<PageResult> {
  const form = new URLSearchParams();
  form.set("q", query);
  if (offset > 0 && vqd) {
    form.set("s", String(offset));
    form.set("vqd", vqd);
  }
  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "User-Agent": AGORA_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal,
    });
    if (!response.ok) return { ok: false, message: `DuckDuckGo returned HTTP ${response.status}.` };
    return { ok: true, html: await response.text() };
  } catch (error) {
    return { ok: false, message: `Network error: ${(error as Error).message}` };
  }
}

export async function duckDuckGoSearch(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();
  let offset = 0;
  let vqd = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    if (allResults.length >= maxResults) break;

    const pageResult = await fetchPage(query, offset, vqd, signal);
    if (!pageResult.ok) {
      if (allResults.length === 0) return { ok: false, error: "network_error", message: pageResult.message };
      break;
    }

    const html = pageResult.html;
    if (CAPTCHA_REGEX.test(html)) {
      if (allResults.length === 0) {
        return {
          ok: false,
          error: "captcha",
          message:
            "DuckDuckGo bot detection triggered. Try again later or use a different search provider.",
        };
      }
      break;
    }

    if (page === 0) vqd = VQD_REGEX.exec(html)?.[1] ?? "";

    const pageResults = parseDuckDuckGoResults(html, PAGE_SIZE);
    let newInThisPage = 0;
    for (const result of pageResults) {
      if (allResults.length >= maxResults) break;
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        allResults.push(result);
        newInThisPage++;
      }
    }

    if (newInThisPage === 0) break;
    if (!vqd) break;
    const nextOffset = OFFSET_REGEX.exec(html)?.[1];
    if (nextOffset === undefined) break;
    offset = Number.parseInt(nextOffset, 10);
  }

  if (allResults.length === 0) {
    return { ok: false, error: "no_results", message: "DuckDuckGo returned no results for this query." };
  }
  return { ok: true, results: allResults };
}

export { decodeHtmlEntities };
