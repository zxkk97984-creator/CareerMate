import { expect, test } from "@playwright/test";

/**
 * P0 流程（更新后）：登录 → /dashboard。聊天统一在助手面板（assistant-panel）。
 * 独立聊天首页已移除（/chat → redirect /dashboard），因此聊天类用例改为打开助手面板交互。
 */
async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openAssistant(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /AI 助手/ }).first().click();
  await expect(page.locator(".assistant-panel")).toBeVisible();
  return page.getByPlaceholder(/输入你的问题/);
}

test("login recovers when the server returns an empty error response", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({ status: 500, body: "" });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page.getByText("登录服务暂时不可用，请稍后重试")).toBeVisible();
  await expect(page.getByRole("button", { name: "进入 CareerMate" })).toBeEnabled();
});

test("chat-first persistent conversation continues across page visits", async ({ page }) => {
  await login(page);
  const textarea = await openAssistant(page);

  // 在助手面板发送消息
  await textarea.fill("我想做 AI 产品经理");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".assistant-panel .message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".assistant-panel .streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 客户端导航到职业路径页（点侧栏链接，保持 SPA 状态）
  await page.getByRole("link", { name: "职业路径" }).click();
  await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible();

  // 点侧栏回概览，助手面板跨路由保持打开，消息仍在（T06a 控制器跨路由保持）
  await page.getByRole("link", { name: "成长概览" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator(".assistant-panel")).toBeVisible();
  await expect(page.locator(".assistant-panel .message-assistant")).toHaveCount(1, { timeout: 10000 });

  // 在已有会话中继续对话
  await page.getByPlaceholder(/输入你的问题/).fill("那我本月先做什么？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".assistant-panel .message-assistant")).toHaveCount(2, { timeout: 15000 });
});

test("user completes a three-round simulation and receives a score", async ({ page }) => {
  await login(page);
  await page.goto("/simulation");
  await page.getByRole("button", { name: "开始新训练" }).click();
  const answers = ["目标是帮助用户快速发现简历问题并获得改进建议。", "优先完成文件解析和核心评分，验收标准是结果稳定可解释。", "失败时保留输入并提示重试，同时记录错误用于复盘。"];
  for (const [index, answer] of answers.entries()) {
    await page.getByLabel("训练回答").fill(answer);
    await page.getByRole("button", { name: /提交第/ }).click();
    await expect(page.getByText(`已完成 ${index + 1}/6 轮`)).toBeVisible();
  }
  await page.getByRole("button", { name: "完成并评分" }).click();
  // T17b：null score 不渲染 0 环；评分报告用“综合得分 N 分”可访问名
  await expect(page.locator("[aria-label^='综合得分']")).toBeVisible();
  await expect(page.getByText("本次未生成画像更新候选。")).toBeVisible();
});

test("new account registers and enters the workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "注册" }).click();
  await page.getByLabel("账号").fill(`e2e_${Date.now()}`);
  await page.getByLabel("昵称").fill("端到端用户");
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "创建账号" }).click();
  // 新账号注册后进入 /onboarding（新手引导），登录账号才落在 /dashboard
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.locator('[data-testid="page-content"]')).toBeVisible();
});

test("admin generates and approves a validated role draft", async ({ page }) => {
  await login(page, "admin");
  // 直接进入管理页；persistent Kurisu 助手挂件（fixed 定位）可能遮挡侧栏入口，
  // 而该用例目标在管理页的草稿流程本身，故以目标路由为准。
  await page.goto("/admin");
  const roleName = `AI 客户成功 ${Date.now()}`;
  await expect(page.getByLabel("岗位名称")).toBeVisible({ timeout: 10000 });
  await page.getByLabel("岗位名称").fill(roleName);
  await page.getByLabel("岗位分类").fill("客户服务");
  await page.getByLabel("岗位来源").fill("管理员访谈记录");
  await page.getByRole("button", { name: "创建并生成草稿" }).click();
  // 用唯一岗位名定位本次创建的新草稿，避免与先前运行的草稿重复导致误选
  const draft = page.getByTestId("draft-card").filter({ hasText: roleName }).first();
  await expect(draft.getByText(/结构校验：通过/)).toBeVisible({ timeout: 10000 });
  await draft.getByRole("button", { name: "通过" }).click();
  await expect(draft.getByText("已通过")).toBeVisible({ timeout: 10000 });
});
