import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = args.indexOf("--out-dir");
const output = resolve(option >= 0 ? args[option + 1] : join(root, "artifacts/tbox-delivery"));
const read = (path) => readFileSync(join(root, path), "utf8").trim();
const written = new Set();
const save = (path, text) => { written.add(path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text + "\n"); };
const workflows = [
  ["V2画像评估", ["profile_assessment"]], ["V2职业探索", ["career_exploration"]],
  ["V2职业规划", ["career_plan"]], ["V2学习路线", ["learning_route"]],
  ["V2职场模拟", ["simulation_turn", "simulation_report"]], ["V2场景生成", ["simulation_scenario"]],
  ["V2简历作品", ["resume_review"]], ["V2成长复盘", ["growth_review"]],
];
const fixtureBuild = await build({ stdin: { contents: "export { buildPlatformContractExample } from './src/lib/agentic-v2/platform-contracts.ts';", resolveDir: root, sourcefile: "fixture-entry.ts", loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, tsconfig: join(root, "tsconfig.json") });
const fixtureModule = { exports: {} };
runInNewContext(fixtureBuild.outputFiles[0].text, { module: fixtureModule, exports: fixtureModule.exports });
const common = read("src/agentic-v2/platform/workflows/COMMON.md");
const inputs = "\n# 本轮实际输入\n用户任务：\n{{request}}\n\n任务上下文 JSON：\n{{task_context_json}}\n\n证据包 JSON：\n{{evidence_bundle_json}}";
const bindingSteps = `# 绑定步骤（不粘贴到模型）
1. 开始节点：request、task_context_json、evidence_bundle_json，均为必填文本。
2. 大模型节点：粘贴 llm-prompt.txt 全文，然后将末尾三个 {{...}} 槽删除，使用平台变量选择器分别选择“开始/对应字段”。平台生成 input_* 引用，不手写节点 ID。
3. 大模型输出：结果，文本类型。
4. 代码节点：粘贴 code-node.js 全文，不包代码围栏。无需安装依赖。输入 raw 引用“大模型/结果”；另增加 request、task_context_json、evidence_bundle_json 三个输入，分别引用开始节点，不能留空。
5. 代码输出：artifact，结构化对象，取值路径 artifact。
6. 结束节点：输出名称 artifact，引用“代码/artifact”，不输出第二份正文，不额外加信封。
7. 发布子工作流后回主 Agent 核对引用与三个参数取值；名称相同不证明发布版本相同。
8. start-input-example.json 是合成参数结构示例，不是完整业务验收数据。code-node-smoke-input.json 用于代码节点单测，输出应与 code-node-smoke-expected.json 一致；随后再用你自己的脱敏完整场景验证 success。
9. 节点代码是本地打包产物，平台粘贴大小限制尚需验证。如果被拒绝，保留旧发布版本并记录，不删减校验强行上线。`;
let bundle = "# CareerMate 百宝箱交付包\n\n这是分组件交付索引，不要把全文粘贴到主 Agent。先读 00-绑定与发布说明.md。\n";
const manifest = { generatedFrom: "current-workspace", bindingVerifiedOnPlatform: false, files: [] };
for (const [name, source] of [["主Agent", "main"], ["研究员V2P", "researcher"], ["审查员V2", "reviewer"]]) {
  const content = read(`src/agentic-v2/platform/prompts/${source}.md`);
  save(join(output, "agents", `${name}.txt`), content);
  bundle += `\n\n========== ${name} 可粘贴正文（需核对平台引用块） ==========\n\n${content}\n`;
  manifest.files.push(`agents/${name}.txt`);
}
for (const [name, types] of workflows) {
  const source = read(`src/agentic-v2/platform/workflows/${name}.md`);
  // Operator instructions and executable code belong outside the model prompt.
  const sections = source.split(/(?=^## )/m).filter((s) => !/^## (代码节点|验收)/.test(s));
  const prompt = `${common}\n\n${sections.join("\n").replace(/^结束节点.*$/gm, "").trim()}\n${inputs}`;
  const result = await build({
    stdin: { contents: `import { validatePlatformNode } from './src/lib/agentic-v2/platform-node.ts'; export const main = async (event) => validatePlatformNode(event, ${JSON.stringify(types)});`, resolveDir: root, sourcefile: "tbox-node-entry.ts", loader: "ts" },
    bundle: true, platform: "neutral", format: "iife", globalName: "CareerMateNode", target: "es2020", write: false,
    minify: true, legalComments: "none", tsconfig: join(root, "tsconfig.json"),
  });
  // Keep the platform entry explicit; do not replace its exports object.
  const code = "exports.main = async (event) => {\n" + result.outputFiles[0].text + "\nreturn CareerMateNode.main(event);\n};";
  const sample = fixtureModule.exports.buildPlatformContractExample(types[0]);
  const response = { schemaVersion: "1.0", taskType: types[0], status: "needs_input", summary: "需要补充业务信息", data: { question: "请补充本轮训练或规划目标" }, evidence: [], sources: [], assumptions: [], warnings: [], requiresUserConfirmation: false, baseVersion: null, nextActions: [] };
  save(join(output, "workflows", name, "start-input-example.json"), JSON.stringify(sample, null, 2));
  save(join(output, "workflows", name, "code-node-smoke-input.json"), JSON.stringify({ ...sample, raw: JSON.stringify(response) }, null, 2));
  save(join(output, "workflows", name, "code-node-smoke-expected.json"), JSON.stringify({ artifact: response }, null, 2));
  save(join(output, "workflows", name, "llm-prompt.txt"), prompt);
  save(join(output, "workflows", name, "code-node.js"), code);
  save(join(output, "workflows", name, "绑定步骤.md"), bindingSteps);
  manifest.files.push({ workflow: name, types, codeBytes: Buffer.byteLength(code), path: `workflows/${name}` });
  bundle += `\n\n========== ${name} 大模型完整提示词 ==========\n\n${prompt}\n\n【代码节点与绑定】\n使用交付目录 workflows/${name}/code-node.js 全文；绑定见同目录绑定步骤.md。代码不粘贴进大模型提示词。\n`;
}
const instructions = read("src/agentic-v2/platform/BINDINGS.md");
save(join(output, "00-绑定与发布说明.md"), instructions);
save(join(output, "careermate-tbox-bundle.txt"), bundle);
manifest.sha256 = Object.fromEntries([...written].map((path) => [relative(output, path), createHash("sha256").update(readFileSync(path)).digest("hex")]));
save(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
process.stdout.write(bundle);
process.stderr.write(`\n独立交付目录：${output}\n`);
