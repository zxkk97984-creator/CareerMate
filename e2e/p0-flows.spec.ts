import { expect, test } from "@playwright/test";

/**
 * P0 流程：登录进入主聊天；工作台助手复用聊天记录，模拟训练创建独立主聊天会话。
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
  return page.getByPlaceholder(/输入你的问题/);
}

async function openSimulationPage(page: import("@playwright/test").Page) {
  const scenariosLoaded = page.waitForResponse(
    (response) => response.url().includes("/api/simulations/scenarios") && response.request().method() === "GET",
  );
  await page.goto("/simulation");
  await scenariosLoaded;
  await page.waitForTimeout(250);
}

async function openSimulationPreview(page: import("@playwright/test").Page) {
  await openSimulationPage(page);
  await page.locator(".training-card").first().click();
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
  const assistantCountBefore = await page.locator(".assistant-panel .message-assistant").count();

  // 在助手面板发送消息
  await textarea.fill("我想做 AI 产品经理");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".assistant-panel .message-assistant").last()).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".assistant-panel .streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 客户端导航到职业路径页（点侧栏链接，保持 SPA 状态）
  await page.getByRole("link", { name: "职业路径" }).click();
  await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible();

  // 点侧栏回概览，助手面板跨路由保持打开，消息仍在（T06a 控制器跨路由保持）
  await page.getByRole("link", { name: "成长概览" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator(".assistant-panel")).toBeVisible();
  await expect(page.locator(".assistant-panel .message-assistant")).toHaveCount(assistantCountBefore + 1, { timeout: 10000 });

  // 在已有会话中继续对话
  await page.getByPlaceholder(/输入你的问题/).fill("那我本月先做什么？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".assistant-panel .message-assistant")).toHaveCount(assistantCountBefore + 2, { timeout: 15000 });
});

test("user completes a three-round simulation and receives a score", async ({ page }) => {
  await login(page);
  await openSimulationPreview(page);
  await page.getByRole("button", { name: "开始训练" }).click();
  await expect(page.locator(".training-chat-bar")).toContainText("0/6");
  const answers = ["目标是帮助用户快速发现简历问题并获得改进建议。", "优先完成文件解析和核心评分，验收标准是结果稳定可解释。", "失败时保留输入并提示重试，同时记录错误用于复盘。"];
  for (const [index, answer] of answers.entries()) {
    await page.locator(".chat-composer textarea").fill(answer);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.locator(".training-chat-bar").filter({ hasText: `${index + 1}/6` })).toBeVisible();
  }
  await page.getByRole("button", { name: "结束并生成报告" }).click();
  // T17b：null score 不渲染 0 环；评分报告用“综合得分 N 分”可访问名
  await expect(page.locator("[aria-label^='综合得分']")).toBeVisible();
  await expect(page.getByText("本次未生成能力更新候选。")).toBeVisible();
});

test("custom simulation previews, starts, and completes with a fixed snapshot", async ({ page }) => {
  await login(page);
  await openSimulationPage(page);
  await page.getByRole("button", { name: "自定义场景", exact: true }).click();
  await page.getByLabel("事件经过").fill("项目延期，需要在没有实时会议的情况下向跨部门同事同步风险和下一步。");
  await page.getByLabel("你的角色").fill("项目协调人");
  await page.getByLabel("对方角色").fill("跨部门负责人");
  await page.getByLabel("训练目标").fill("练习澄清目标、同步风险并给出可执行下一步");
  await page.getByLabel("难度").selectOption("L2");
  await page.getByRole("button", { name: "生成场景预览" }).click();

  const preview = page.locator(".sim-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("来源：自定义场景");
  await expect(preview).toContainText("最多 6 轮 · 至少 3 轮有效回答后可评分");
  await preview.getByRole("button", { name: "开始训练" }).click();
  await expect(page.locator(".training-chat-bar").filter({ hasText: "0/6" })).toBeVisible();

  const answers = [
    "先说明延期事实、影响范围和需要对方确认的决定。",
    "把风险按影响程度排序，并给出两个可执行方案。",
    "明确负责人、截止时间和下一次同步节点。",
  ];
  for (const [index, answer] of answers.entries()) {
    await page.locator(".chat-composer textarea").fill(answer);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.locator(".training-chat-bar").filter({ hasText: `${index + 1}/6` })).toBeVisible();
  }
  await page.getByRole("button", { name: "结束并生成报告" }).click();
  await expect(page.locator("[aria-label^='综合得分']")).toBeVisible();
});

test("active simulation resumes after reload without duplicating turns", async ({ page }) => {
  await login(page);
  await openSimulationPreview(page);
  await page.getByRole("button", { name: "开始训练" }).click();
  await expect(page.locator(".training-chat-bar")).toContainText("0/6");
  await expect(page.locator(".training-chat-bar").filter({ hasText: "0/6" })).toBeVisible();

  await page.locator(".chat-composer textarea").fill("我先澄清目标和范围，再给出可执行的下一步。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".training-chat-bar").filter({ hasText: "1/6" })).toBeVisible();
  const assistantTurnsBeforeReload = await page.locator(".chat-scroll-area .message-assistant").count();
  const userTurnsBeforeReload = await page.locator(".chat-scroll-area .message-user").count();

  await page.reload();
  await expect(page.locator(".training-chat-bar").filter({ hasText: "1/6" })).toBeVisible();
  await expect(page.locator(".training-chat-bar").filter({ hasText: "1/6" })).toBeVisible();
  await expect(page.locator(".chat-scroll-area .message-assistant")).toHaveCount(assistantTurnsBeforeReload);
  await expect(page.locator(".chat-scroll-area .message-user")).toHaveCount(userTurnsBeforeReload);

  await page.locator(".chat-composer textarea").fill("我会先确认验收标准，再同步风险与下一步。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".training-chat-bar").filter({ hasText: "2/6" })).toBeVisible();
  await page.locator(".chat-composer textarea").fill("如果信息不足，我会明确列出缺口并约定补充时间。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".training-chat-bar").filter({ hasText: "3/6" })).toBeVisible();
  await page.getByRole("button", { name: "结束并生成报告" }).click();
  await expect(page.locator("[aria-label^='综合得分']")).toBeVisible();
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
