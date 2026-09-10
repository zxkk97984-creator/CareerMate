import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SimulationView, SimulationReport } from "./simulation-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function renderCompleted(score: number | null, candidateId: string | null) {
  return renderToStaticMarkup(
    <SimulationReport
      active={{
        id: "session-1",
        scenarioKey: "cross_role_communication",
        scenarioTitle: "跨岗位沟通",
        transcript: [],
        status: "completed",
        turnCount: 3,
        actualMode: "api",
        requestedMode: "api",
        score,
        candidateId,
        feedback: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }}
      onRestart={vi.fn()}
    />,
  );
}

describe("SimulationView", () => {
  it("shows an unscored completion without claiming a candidate exists", () => {
    const html = renderCompleted(null, null);

    // 语义上应呈现“未产生正式评分”，而非一个 0 分圆环或“训练得分： 分”旧文案
    expect(html).toContain("未产生正式评分");
    expect(html).not.toContain("画像候选已生成");
    expect(html).not.toContain("训练得分： 分");
  });

  it("only claims a candidate when the session actually has one", () => {
    const html = renderCompleted(82, null);

    // 新评分 UI 用可访问名“综合得分 82 分”，不再使用“训练得分：82 分”旧文案
    expect(html).toContain('aria-label="综合得分 82 分"');
    expect(html).not.toContain("训练得分：82 分");
    expect(html).not.toContain("画像候选已生成");
    // 未生成候选时明确提示，避免把候选建议写成已确认的能力提升
    expect(html).toContain("本次未生成能力更新候选");
  });

  it("shows the candidate confirmation guidance when a candidate exists", () => {
    const html = renderCompleted(82, "candidate-1");

    expect(html).toContain("能力证据候选已生成");
    // 深链接到“待确认建议”标签（T18），不再用旧的“记忆权限”泛指
    expect(html).toContain("待确认建议");
    expect(html).toContain('/memory?tab=candidates');
  });
});

 it("renders a scenario lobby without an answer composer", () => {
 const html = renderToStaticMarkup(<SimulationView simulations={[]} profile={null} refresh={vi.fn()} setNotice={vi.fn()}/>);
 expect(html).toContain("推荐场景"); expect(html).toContain("自定义场景"); expect(html).toContain("training-grid"); expect(html).not.toContain('aria-label="训练回答"');
 });
