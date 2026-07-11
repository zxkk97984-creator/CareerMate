import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("chat home renders after onboarding user logs in", async ({ page }) => {
  await login(page);
  // 页面应显示聊天首页，而非重定向到 /dashboard
  await expect(page).toHaveURL(/\/$/);
  // 欢迎界面
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();
  // 新对话按钮
  await expect(page.getByRole("button", { name: "新对话" })).toBeVisible();
  // 输入区域
  await expect(page.getByPlaceholder(/Enter 发送/)).toBeVisible();
  // 成长档案入口
  await expect(page.getByLabel("展开成长档案")).toBeVisible();
});

test("/chat redirects to home", async ({ page }) => {
  await login(page);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/$/);
});

test("create conversation, send messages, and reload preserves history", async ({ page }) => {
  await login(page);

  // 创建新会话——直接发消息会自动创建
  await page.getByPlaceholder(/Enter 发送/).fill("我想了解数据分析师需要哪些能力？");
  await page.getByLabel("发送消息").click();

  // 等待回复出现（SSE 流式接收）
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

  // 发送第二轮
  await page.getByPlaceholder(/Enter 发送/).fill("那数学基础要达到什么程度？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toHaveCount(2, { timeout: 15000 });

  // 刷新页面
  await page.reload();
  await expect(page).toHaveURL(/\/$/);

  // 之前发送的两条消息应该在会话历史中
  // 等待会话列表加载
  await expect(page.locator(".conversation-list")).toBeVisible();

  // 点击之前的会话
  const firstConv = page.locator(".conversation-title-btn").first();
  await expect(firstConv).toBeVisible();
  await firstConv.click();

  // 应该能看到之前的消息
  await expect(page.locator(".message-wrapper")).toHaveCount(4, { timeout: 10000 });
});

test("switching conversations shows different messages", async ({ page }) => {
  await login(page);

  // 先创建两个会话并各发一条消息
  await page.getByPlaceholder(/Enter 发送/).fill("会话一的测试消息");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

  // 新对话
  await page.getByRole("button", { name: "新对话" }).click();
  await expect(page.locator(".message-wrapper")).toHaveCount(0);

  await page.getByPlaceholder(/Enter 发送/).fill("会话二的测试消息");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

  // 切换到第一个会话
  const firstConv = page.locator(".conversation-title-btn").nth(1); // 第二个列表项（最新的在上面）
  if (await firstConv.isVisible()) {
    await firstConv.click();
    await expect(page.getByText("会话一的测试消息")).toBeVisible();
  }
});

test("can rename and delete conversations", async ({ page }) => {
  await login(page);

  // 发一条消息创建会话
  await page.getByPlaceholder(/Enter 发送/).fill("重命名测试消息");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

  // 点击重命名按钮
  const renameBtn = page.locator(".action-btn").first();
  await renameBtn.click();

  // 输入新名称
  const renameInput = page.locator(".rename-input");
  await renameInput.fill("我的数据分析学习计划");
  await page.locator(".rename-confirm").click();

  // 确认标题已更新
  await expect(page.getByText("我的数据分析学习计划")).toBeVisible();

  // 删除会话
  const deleteBtn = page.locator(".action-delete").first();
  await deleteBtn.click();

  // 应该回到欢迎页面
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();
});
