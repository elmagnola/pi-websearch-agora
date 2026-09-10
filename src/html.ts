import { MAX_WEB_FETCH_HTML_LENGTH } from "./config.ts";
import { NAMED_ENTITIES } from "./entities.ts";

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => {
      const key = name.toLowerCase();
      return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : match;
    });
}

const BLOCK_TAGS =
  "p|div|br|hr|li|ul|ol|tr|td|th|table|section|article|blockquote|pre|h[1-6]|form|figure|figcaption";

export function stripHtml(rawHtml: string): string {
  return decodeHtmlEntities(rawHtml.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToReadableText(rawHtml: string): string {
  const stripped = rawHtml
    .slice(0, MAX_WEB_FETCH_HTML_LENGTH)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const flattened = decodeHtmlEntities(
    stripped.replace(
      new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"),
      "\n",
    ).replace(/<[^>]*>/g, " "),
  );

  return flattened
    .replace(/[ \t\u000b\f\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
