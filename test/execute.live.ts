import extension from "../index.ts";

interface ToolLike {
  name: string;
  execute: (id: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<{
    content: { type: string; text: string }[];
  }>;
}

const tools: Record<string, ToolLike> = {};

const pi = {
  registerTool: (tool: ToolLike) => {
    tools[tool.name] = tool;
  },
  registerCommand: () => {},
  on: () => {},
};

extension(pi as never);

const failures: string[] = [];
function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

check(Object.keys(tools).includes("web_search"), "web_search not registered");
check(Object.keys(tools).includes("web_fetch"), "web_fetch not registered");

const controller = new AbortController();

const fetchResult = await tools["web_fetch"].execute(
  "t1",
  { url: "https://example.com", maxChars: 500 },
  controller.signal,
);
check(fetchResult.content[0].text.includes("Example Domain"), "web_fetch did not return page text");

const searchResult = await tools["web_search"].execute(
  "t2",
  { query: "pi coding agent github", num_results: 3 },
  controller.signal,
);
const searchText = searchResult.content[0].text;
check(/Search results for/.test(searchText), "web_search missing header");
check(!searchText.trim().startsWith("{"), "web_search should be Pi-native text, not JSON");

let errorThrown = false;
try {
  await tools["web_search"].execute("t3", { query: "x", num_results: 999 }, controller.signal);
} catch {
  errorThrown = true;
}
void errorThrown;

if (failures.length > 0) {
  console.error("FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("execute OK");
console.log("---SEARCH SAMPLE---");
console.log(searchText.slice(0, 400));
