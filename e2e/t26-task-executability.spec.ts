import { verifyV2MockReadOnly } from "./helpers/v2-mock";
const v2Mock = process.env.E2E_AGENTIC_V2 === "true";
import { expect, test } from "@playwright/test";

/**
 * T26 任务可执行性验证：逐条走查脚本中的 7 个业务闭环，证明在当前产品中均可完成。
 * 这不是真实用户观察（真实 5–8 人仍由负责人执行），而是验证"任务可执行性"——
 * 脚本设计的每个任务在当前路由/模式/构建下都确实可达、可完成，含日期与提交证据。
 */
async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.goto("/dashboard");
}

async function openAssistant(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /AI 助手/ }).first().click();
  await expect(page.locator(".assistant-panel")).toBeVisible();
  await page.locator(".assistant-panel").getByRole("button", { name: "新对话", exact: true }).click();
}

async function openSimulationPreview(page: import("@playwright/test").Page) {
  const scenariosLoaded = page.waitForResponse(
    (response) => response.url().includes("/api/simulations/scenarios") && response.request().method() === "GET",
  );
  await page.goto("/simulation");
  await scenariosLoaded;
  await page.waitForTimeout(250);
  await page.locator(".training-card").first().click();
}

test.describe("T26 七项真实用户任务的可执行性走查", () => {
  test("任务1 找到 AI 助手并提问", async ({ page }) => {
    await login(page);
    // 入口：页头有 AI 助手按钮
    await expect(page.getByRole("button", { name: /AI 助手/ })).toBeVisible();
    await openAssistant(page);
    const ta = page.getByPlaceholder(/输入你的问题/);
    await ta.fill("数据分析师需要哪些能力？");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".assistant-panel .message-assistant").last()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".assistant-panel .streaming-cursor")).toHaveCount(0, { timeout: 15000 });
  });

  test("任务2 在成长概览理解「成长参考分」", async ({ page }) => {
    await login(page);
    const abilities = page.getByRole("region", { name: "能力与成长", exact: true });
    await expect(abilities.getByText("成长参考分", { exact: true })).toBeVisible();
    await expect(abilities.locator(".growth-score strong")).toHaveText(/^(\d+|待评估)$/);
    await expect(abilities.getByText(/不代表岗位胜任概率/)).toBeVisible();
  });

  test(v2Mock ? "任务3 V2 Mock 规划请求遵守不写入契约" : "任务3 生成职业计划并进入可执行", async ({ page }) => {
    await login(page);
    await openAssistant(page);
    if (v2Mock) { await verifyV2MockReadOnly(page, "帮我制定一个3个月学习计划"); return; }
    await page.getByPlaceholder(/输入你的问题/).fill("帮我制定一个3个月学习计划");
    await page.getByLabel("发送消息").click();
    const planCard = page.locator(".assistant-panel").getByRole("region", { name: /计划/ }).last();
    await expect(planCard).toBeVisible({ timeout: 20000 });
    const acceptButton = planCard.getByRole("button", { name: "确认新版本" });
    await expect(acceptButton).toBeVisible({ timeout: 10000 });
    await acceptButton.click();
    await expect(acceptButton).toHaveCount(0);
    // 确认后进入路径页可读到正式计划
    await page.goto("/path");
    await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible({ timeout: 10000 });
  });

  test("任务4 开始一个本月任务并看详情", async ({ page }) => {
    await login(page);
    // 本月任务卡片存在并有"开始"或状态更新入口；点击查看详情
    await page.goto("/path");
    await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible({ timeout: 10000 });
    const card = page.locator(".path-task-cards").getByRole("button", { name: /详情/ }).first();
    await card.click();
    const detail = page.getByTestId("unified-task-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText("预计投入", { exact: true })).toBeVisible();
  });

  test("任务5 完成一次模拟训练三轮并评分", async ({ page }) => {
    await login(page);
    await openSimulationPreview(page);
    await page.getByRole("button", { name: "开始训练" }).click();
  await expect(page.locator(".training-chat-bar")).toContainText("0/6");
    const answers = [
      "目标是帮助用户快速发现简历问题并获得改进建议。",
      "优先完成文件解析和核心评分，验收标准是结果稳定可解释。",
      "失败时保留输入并提示重试，同时记录错误用于复盘。",
    ];
    for (const [index, answer] of answers.entries()) {
      await page.locator(".chat-composer textarea").fill(answer);
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
      await expect(page.locator(".training-chat-bar").filter({ hasText: `${index + 1}/6` })).toBeVisible();
    }
    await page.getByRole("button", { name: "结束并生成报告" }).click();
    await expect(page.locator("[aria-label^='综合得分']")).toBeVisible();
  });

  test("任务6 理解待确认建议与正式画像的区别", async ({ page }) => {
    await login(page);
    await page.goto("/memory?tab=candidates");
    // 待确认建议标签可达；迁移记忆标签可达（画像与证据只读）
    await expect(page.getByRole("tab", { name: /待确认建议/ }).first()).toBeVisible();
    await expect(page.getByText(/待确认|确认后|候选/).first()).toBeVisible();
  });

  test("任务7 找到隐私控制（账号/导出/清空）", async ({ page }) => {
    await login(page);
    await page.goto("/settings?tab=privacy");
    // 导出/清空已迁到设置页；长期记忆开关仍在 /memory 的“长期记忆”标签
    await expect(page.getByRole("tab", { name: "隐私与数据" }).first()).toBeVisible();
    await expect(page.getByText("隐私与数据").first()).toBeVisible();
    await expect(page.getByText("导出 JSON").first()).toBeVisible();
    await expect(page.getByText(/清空|清除成长/).first()).toBeVisible();
  });
});
