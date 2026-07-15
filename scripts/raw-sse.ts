import { loadEnvConfig } from "@next/env";
import { getTboxConfig } from "../src/lib/env";

void (async () => {
loadEnvConfig(process.cwd());
const config = getTboxConfig();

if (config.mode !== "api") { console.error("mode not api"); process.exit(1); }

const res = await fetch(config.chatEndpoint, {
  method: "POST",
  headers: { Authorization: config.apiKey, "Content-Type": "application/json", Accept: "text/event-stream" },
  body: JSON.stringify({ agent_id: config.agentId, question: "DBA需要学习哪些核心技能？请列出并简要说明", user_id: "raw-sse-3", stream: true, search_engine: true }),
});

console.log("STATUS:", res.status);
const reader = res.body!.getReader();
const dec = new TextDecoder();
let buf = "", n = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const l of lines) {
    const t = l.trim();
    if (t) { n++; console.log(`[${n}]`, t.length > 600 ? t.slice(0, 600) + "…" : t); }
  }
}
if (buf.trim()) console.log(`[${++n}]`, buf.trim().slice(0, 600));
console.log("TOTAL:", n);
})();
