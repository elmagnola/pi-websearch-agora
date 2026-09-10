import extension from "../index.ts";

const registered: { tools: { name: string }[]; commands: string[]; events: string[] } = {
  tools: [],
  commands: [],
  events: [],
};

const statuses: Record<string, string | undefined> = {};

const pi = {
  registerTool: (tool: { name: string }) => registered.tools.push({ name: tool.name }),
  registerCommand: (name: string) => registered.commands.push(name),
  on: (event: string) => registered.events.push(event),
  getFlag: () => undefined,
};

const ctx = {
  cwd: process.cwd(),
  ui: {
    notify: () => {},
    setStatus: (key: string, value: string | undefined) => {
      statuses[key] = value;
    },
    select: async () => undefined,
    input: async () => undefined,
  },
};

extension(pi as never);

console.log("tools:", registered.tools.map((t) => t.name));
console.log("commands:", registered.commands);
console.log("events:", registered.events);

const failures: string[] = [];
if (!registered.tools.some((t) => t.name === "web_search")) failures.push("missing web_search tool");
if (!registered.tools.some((t) => t.name === "web_fetch")) failures.push("missing web_fetch tool");
if (!registered.commands.includes("websearch")) failures.push("missing /websearch command");
if (!registered.events.includes("session_start")) failures.push("missing session_start hook");

const handler = (pi as unknown as { _handlers?: unknown })._handlers;
void handler;
void ctx;

if (failures.length > 0) {
  console.error("FAIL:", failures.join(", "));
  process.exit(1);
}
console.log("registration OK");
