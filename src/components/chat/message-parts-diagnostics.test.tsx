import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MessageParts } from "./message-parts";

it("renders one nonfatal notice for legacy duplicate warnings and filters execution logs", () => {
  const html = renderToStaticMarkup(<MessageParts parts={[
    { type: "error", code: "AGENT_RESPONSE_WARNINGS", message: "UNKNOWN_EVENT" },
    { type: "error", code: "WARNINGS", message: "UNKNOWN_EVENT; INVALID_ARTIFACT_SCHEMA" },
    { type: "citations", items: [
      { title: "stdout:", source: "CareerMate 知识库", label: "已核验职业库" },
      { title: "职业能力模板", source: "CareerMate 知识库", label: "已核验职业库" },
    ] },
  ]} />);
  expect(html).not.toContain('class="parts-error"');
  expect(html.match(/class="parts-warning"/g)).toHaveLength(1);
  expect(html).not.toContain("stdout:");
  expect(html).toContain("职业能力模板");
  expect(html).toContain("未保存为有效业务结果");
});
