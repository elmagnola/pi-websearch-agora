import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToReadableText, decodeHtmlEntities, stripHtml } from "../src/html.ts";
import { searxngSearchUrl, kagiSearchRequestBody, normalizeKagiSearchResponse, normalizeFirecrawlSearchResponse } from "../src/providers/api.ts";
import { parseDuckDuckGoResults } from "../src/providers/duckduckgo.ts";
import { normalizeProvider, loadConfig } from "../src/config.ts";
import { clampNumResults } from "../src/search.ts";

test("searxng builds canonical url with trailing slash stripped and no engines pin", () => {
  const url = searxngSearchUrl("https://search.example.test/", "hello world/中文");
  assert.equal(
    url,
    "https://search.example.test/search?q=hello+world%2F%E4%B8%AD%E6%96%87&format=json",
  );
  assert.ok(!url.includes("engines="));
  assert.ok(!url.includes(".test//search"));
});

test("searxng falls back to searx.be when base url blank", () => {
  assert.equal(searxngSearchUrl("", "abc"), "https://searx.be/search?q=abc&format=json");
});

test("kagi request body clamps limit to 1-10", () => {
  assert.deepEqual(JSON.parse(kagiSearchRequestBody("q", 50)), {
    query: "q",
    workflow: "search",
    limit: 10,
  });
  assert.deepEqual(JSON.parse(kagiSearchRequestBody("q", 0)), {
    query: "q",
    workflow: "search",
    limit: 1,
  });
});

test("kagi normalization extracts url/title/snippet and respects limit", () => {
  const body = JSON.stringify({
    data: {
      search: [
        { url: "https://a.test", title: "A", snippet: "sa" },
        { url: "https://b.test", title: "B", snippet: "sb" },
        { url: "", title: "skip" },
      ],
    },
  });
  const outcome = normalizeKagiSearchResponse(body, 1);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.results.length, 1);
  assert.deepEqual(outcome.results[0], { title: "A", url: "https://a.test", description: "sa" });
});

test("kagi normalization reports no_results on malformed data", () => {
  assert.deepEqual(normalizeKagiSearchResponse("{}", 5), { ok: false, error: "no_results" });
  assert.deepEqual(normalizeKagiSearchResponse(JSON.stringify({ data: { search: [] } }), 5), {
    ok: false,
    error: "no_results",
  });
});

test("firecrawl normalization extracts url/title/description from data.web", () => {
  const body = JSON.stringify({
    success: true,
    data: {
      web: [
        { url: "https://firecrawl.dev/", title: "Firecrawl", description: "The web data API.", position: 1 },
        { url: "https://github.com/firecrawl/firecrawl", title: "GitHub repo", description: "Source code.", position: 2 },
        { url: "", title: "skip-empty-url", description: "x" },
      ],
    },
  });
  const outcome = normalizeFirecrawlSearchResponse(body);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.results.length, 2);
  assert.deepEqual(outcome.results[0], {
    title: "Firecrawl",
    url: "https://firecrawl.dev/",
    description: "The web data API.",
  });
});

test("firecrawl normalization reports no_results on empty or malformed data", () => {
  assert.deepEqual(normalizeFirecrawlSearchResponse("{}"), { ok: false, error: "no_results" });
  assert.deepEqual(
    normalizeFirecrawlSearchResponse(JSON.stringify({ data: { web: [] } })),
    { ok: false, error: "no_results" },
  );
});

test("duckduckgo parser extracts results and decodes uddg redirects", () => {
  const html = `
    <a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=x">Example <b>Title</b></a>
    <td class="result-snippet">Some &amp; snippet</td>
    <a class="result-link" href="https://direct.test">Direct</a>
    <td class="result-snippet">direct snippet</td>
  `;
  const results = parseDuckDuckGoResults(html, 10);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    title: "Example Title",
    url: "https://example.com/page",
    description: "Some & snippet",
  });
  assert.equal(results[1].url, "https://direct.test");
});

test("duckduckgo parser respects max results cap", () => {
  const rows = Array.from(
    { length: 5 },
    (_v, i) => `<a class="result-link" href="https://x${i}.test">T${i}</a><td class="result-snippet">S</td>`,
  ).join("");
  assert.equal(parseDuckDuckGoResults(rows, 3).length, 3);
});

test("htmlToReadableText strips script/style/nav and decodes entities", () => {
  const html = `
    <html><head><title>x</title><style>.a{color:red}</style></head>
    <body>
      <nav>Nav links</nav>
      <article><p>Hello&nbsp;world &mdash; caf&eacute;</p><p>Second &#8212; para</p></article>
      <script>var x = 1;</script>
      <footer>Footer junk</footer>
    </body></html>
  `;
  const text = htmlToReadableText(html);
  assert.ok(text.includes("Hello\u00a0world \u2014 caf\u00e9") || text.includes("Hello world \u2014 café"));
  assert.ok(text.includes("Second \u2014 para"));
  assert.ok(!text.includes("var x"));
  assert.ok(!text.includes("Nav links"));
  assert.ok(!text.includes("Footer junk"));
  assert.ok(!text.includes("color:red"));
});

test("decodeHtmlEntities handles named, decimal, and hex refs", () => {
  assert.equal(decodeHtmlEntities("&amp;&lt;&gt;&#39;&#x27;&hellip;"), "&<>''\u2026");
});

test("stripHtml collapses whitespace", () => {
  assert.equal(stripHtml("<p>a   b</p>\n\n<i>c</i>"), "a b c");
});

test("normalizeProvider falls back to duckduckgo for unknown values", () => {
  assert.equal(normalizeProvider(" OpenAI "), "duckduckgo");
  assert.equal(normalizeProvider(" KAGI "), "kagi");
  assert.equal(normalizeProvider(undefined), "duckduckgo");
});

test("clampNumResults bounds to 1-10", () => {
  assert.equal(clampNumResults(50, 5), 10);
  assert.equal(clampNumResults(0, 5), 1);
  assert.equal(clampNumResults(undefined, 7), 7);
  assert.equal(clampNumResults("3", 5), 3);
});

test("loadConfig defaults are sane", () => {
  const config = loadConfig();
  assert.equal(typeof config.enabled, "boolean");
  assert.ok(config.numResults >= 1 && config.numResults <= 10);
});
