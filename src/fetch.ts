import {
  DEFAULT_MAX_FETCH_CHARS,
  DEFAULT_WEB_FETCH_USER_AGENT,
  MAX_MAX_FETCH_CHARS,
} from "./config.ts";
import { httpText } from "./http.ts";
import { htmlToReadableText } from "./html.ts";

export interface FetchSuccess {
  ok: true;
  url: string;
  text: string;
  truncated: boolean;
  totalChars: number;
}

export interface FetchFailure {
  ok: false;
  error: string;
  message: string;
}

export async function webFetch(
  url: string,
  requestedMaxChars: unknown,
  signal?: AbortSignal,
): Promise<FetchSuccess | FetchFailure> {
  const parsed =
    typeof requestedMaxChars === "number"
      ? requestedMaxChars
      : Number.parseInt(String(requestedMaxChars ?? ""), 10);
  const maxChars = Math.min(
    MAX_MAX_FETCH_CHARS,
    Math.max(1, Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_MAX_FETCH_CHARS),
  );

  const response = await httpText(url, {
    headers: {
      "User-Agent": DEFAULT_WEB_FETCH_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    signal,
  });
  if (!response.ok) return { ok: false, error: response.error, message: response.message };

  const fullText = htmlToReadableText(response.body);
  const text = fullText.slice(0, maxChars);
  return {
    ok: true,
    url,
    text,
    truncated: fullText.length > text.length,
    totalChars: fullText.length,
  };
}
