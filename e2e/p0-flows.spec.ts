import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/$/);
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

  // 在聊天首页发送消息
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();
  await page.getByPlaceholder(/Enter 发送/).fill("我想做 AI 产品经理");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

  // 导航到职业路径页（heading "3 年职业路径" 是页面的唯一性标记）
  await page.goto("/path");
  await expect(page.getByRole("heading", { name: "3 年职业路径" })).toBeVisible();

  // 返回聊天首页，验证对话仍在
  await page.goto("/");
  await expect(page.locator(".conversation-title-btn").first()).toBeVisible({ timeout: 5000 });

  // 在已有会话中继续对话
  await page.locator(".conversation-title-btn").first().click();
  await page.getByPlaceholder(/Enter 发送/).fill("那我本月先做什么？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toHaveCount(2, { timeout: 15000 });

  // 新对话不串消息
  await page.locator(".new-chat-btn").click();
  await expect(page.locator(".message-wrapper")).toHaveCount(0);
});

test("user completes a three-round simulation and receives a score", async ({ page }) => {
  await login(page);
  // GrowthProfileDrawer 和 sidebar-footer 中都有"模拟训练"链接，取侧栏中的（footer-link 类）
  await page.locator(".footer-link").filter({ hasText: "模拟训练" }).click();
  await page.getByRole("button", { name: "开始新训练" }).click();
  const answers = ["目标是帮助用户快速发现简历问题并获得改进建议。", "优先完成文件解析和核心评分，验收标准是结果稳定可解释。", "失败时保留输入并提示重试，同时记录错误用于复盘。"];
  for (const [index, answer] of answers.entries()) {
    await page.getByLabel("训练回答").fill(answer);
    await page.getByRole("button", { name: /提交第/ }).click();
    await expect(page.getByText(`已完成 ${index + 1}/6 轮`)).toBeVisible();
  }
  await expect(page.getByText("已完成 3/6 轮")).toBeVisible();
  await page.getByRole("button", { name: "完成并评分" }).click();
  await expect(page.getByText(/训练得分：\d+ 分/)).toBeVisible();
  await expect(page.getByText("本次未生成画像更新候选。")).toBeVisible();
});

test("new account registers and enters open chat directly", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "注册" }).click();
  await page.getByLabel("账号").fill(`e2e_${Date.now()}`);
  await page.getByLabel("昵称").fill("端到端用户");
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "创建账号" }).click();
  // 开放入口：注册后直接进入主聊天，不强制跳转 onboarding
  await expect(page).toHaveURL(/\/$/);
  // 可以在主聊天中直接提问
  await expect(page.getByPlaceholder(/Enter 发送|输入消息/)).toBeVisible();
});

test("admin generates and approves a validated role draft", async ({ page }) => {
  await login(page, "admin");
  // Admin 入口在 workspace 导航中，需要先访问一个 workspace 页面
  await page.goto("/path");
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByLabel("岗位名称").fill("AI 客户成功");
  await page.getByLabel("岗位分类").fill("客户服务");
  await page.getByLabel("岗位来源").fill("管理员访谈记录");
  await page.getByRole("button", { name: "创建人工模板草稿" }).click();
  const draft = page.locator("div.rounded-md.border", { hasText: "AI 客户成功" }).first();
  await expect(draft.getByText(/结构校验：通过/)).toBeVisible();
  await draft.getByRole("button", { name: "通过" }).click();
  await expect(draft.getByText(/approved/)).toBeVisible();
});

// ── 聊天首页完整流程 ────────────────────────────────────

test("chat-first complete flow: persistent chat and conversation switching", async ({ page }) => {
  await login(page);

  // 1. 验证聊天首页
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();
  await expect(page.locator(".new-chat-btn")).toBeVisible();

  // 2. 连续多轮对话
  await page.getByPlaceholder(/Enter 发送/).fill("我想了解数据分析师需要哪些能力？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  await page.getByPlaceholder(/Enter 发送/).fill("那数学基础要达到什么程度？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 3. 刷新后历史保留
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  const firstConv = page.locator(".conversation-title-btn").first();
  await expect(firstConv).toBeVisible({ timeout: 5000 });
  await firstConv.click();
  await expect(page.locator(".message-wrapper")).toHaveCount(4, { timeout: 10000 });

  // 4. 访问计划页
  await page.goto("/path");
  await expect(page.getByRole("heading", { name: "3 年职业路径" })).toBeVisible();

  // 5. 返回聊天首页
  await page.goto("/");
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();

  // 6. 新对话不串消息——使用侧栏中的新对话按钮
  await page.locator(".new-chat-btn").click();
  await page.waitForTimeout(500);
  await expect(page.locator(".message-wrapper")).toHaveCount(0);
});
