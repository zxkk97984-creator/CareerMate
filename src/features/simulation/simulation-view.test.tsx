import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SimulationView } from "./simulation-view";

function renderCompleted(score: number | null, candidateId: string | null) {
  return renderToStaticMarkup(
    <SimulationView
      simulations={[{
        id: "session-1",
        scenarioTitle: "跨岗位沟通",
        transcript: [],
        status: "completed",
        turnCount: 3,
        actualMode: "api",
        score,
        candidateId,
      }]}
      profile={null}
      refresh={vi.fn(async () => undefined)}
      setNotice={vi.fn()}
    />,
  );
}

describe("SimulationView", () => {
  it("shows an unscored completion without claiming a candidate exists", () => {
    const html = renderCompleted(null, null);

    expect(html).toContain("本次未产生正式评分");
    expect(html).not.toContain("画像候选已生成");
    expect(html).not.toContain("训练得分： 分");
  });

  it("only claims a candidate when the session actually has one", () => {
    const html = renderCompleted(82, null);

    expect(html).toContain("训练得分：82 分");
    expect(html).not.toContain("画像候选已生成");
  });

  it("shows the candidate confirmation guidance when a candidate exists", () => {
    const html = renderCompleted(82, "candidate-1");

    expect(html).toContain("画像候选已生成");
    expect(html).toContain("记忆权限");
  });
});
