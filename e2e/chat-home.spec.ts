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
  // 新对话按钮（在侧栏中，使用类名避免与标题为"新对话"的会话条目冲突）
  await expect(page.locator(".new-chat-btn")).toBeVisible();
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

test("create conversation, send message, and reload preserves history", async ({ page }) => {
  await login(page);

  // 创建新会话——直接发消息会自动创建
  await page.getByPlaceholder(/Enter 发送/).fill("我想了解数据分析师需要哪些能力？");
  await page.getByLabel("发送消息").click();

  // 等待回复出现且完成（SSE 流式接收）
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  // 等待流式完成——消息状态变为 completed
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 刷新页面
  await page.reload();
  await expect(page).toHaveURL(/\/$/);

  // 消息应该在会话历史中保留
  await expect(page.locator(".conversation-list")).toBeVisible();

  // 点击会话查看消息
  const firstConv = page.locator(".conversation-title-btn").first();
  await expect(firstConv).toBeVisible();
  await firstConv.click();

  // 应该能看到之前的消息（1 user + 1 assistant = 2）
  await expect(page.locator(".message-wrapper")).toHaveCount(2, { timeout: 10000 });
});

test("create new conversation clears message area", async ({ page }) => {
  await login(page);

  // 发一条消息并等待完成
  await page.getByPlaceholder(/Enter 发送/).fill("会话一的测试消息");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 新对话——按钮在侧栏中
  await page.locator(".new-chat-btn").click();
  // 等待新会话创建完成并清空消息
  await page.waitForTimeout(500);
  await expect(page.locator(".message-wrapper")).toHaveCount(0);
  // 验证新对话已创建
  await expect(page.locator(".conversation-title-btn")).toHaveCount(2);
});

test("can rename and delete conversations", async ({ page }) => {
  await login(page);

  // 发一条消息创建会话
  await page.getByPlaceholder(/Enter 发送/).fill("重命名测试消息");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 悬停在第一个会话项上以显示操作按钮
  const conversationItem = page.locator(".conversation-item").first();
  await conversationItem.hover();

  // 点击重命名按钮（hover 后才可见）
  const renameBtn = page.locator(".action-btn").first();
  await expect(renameBtn).toBeVisible();
  await renameBtn.click();

  // 输入新名称
  const renameInput = page.locator(".rename-input");
  await renameInput.fill("我的数据分析学习计划");
  await page.locator(".rename-confirm").click();

  // 确认标题已更新
  await expect(page.getByText("我的数据分析学习计划")).toBeVisible();

  // 再次悬停以显示删除按钮
  await conversationItem.hover();
  const deleteBtn = page.locator(".action-delete").first();
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // 应该回到欢迎页面
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();
});

// ── 375px 移动端视口 ────────────────────────────────────

test.describe("mobile viewport (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("sidebar is hidden by default, opens via menu button", async ({ page }) => {
    await login(page);

    // 侧栏默认隐藏
    const sidebar = page.locator(".chat-sidebar");
    await expect(sidebar).not.toHaveClass(/sidebar-open/);

    // 点击菜单按钮打开
    await page.getByLabel("打开会话列表").click();
    await expect(sidebar).toHaveClass(/sidebar-open/);
  });

  test("chat input is visible and not obscured by keyboard", async ({ page }) => {
    await login(page);

    const textarea = page.getByPlaceholder(/Enter 发送/);
    await expect(textarea).toBeVisible();

    // 输入框应在可视区域内
    const box = await textarea.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(812);
    }
  });
});

// ── 768px 平板视口 ──────────────────────────────────────

test.describe("tablet viewport (768px)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("cards do not overflow", async ({ page }) => {
    await login(page);

    // 发送消息触发卡片渲染
    await page.getByPlaceholder(/Enter 发送/).fill("分析AI产品经理的能力要求");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

    // 检查消息区域不超出视口
    const main = page.locator(".chat-main");
    const box = await main.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(768);
    }
  });
});

// ── 异常状态 ────────────────────────────────────────────

test("empty state shows welcome and suggestions", async ({ page }) => {
  await login(page);

  // 欢迎界面
  await expect(page.getByText("你好，我是 CareerMate")).toBeVisible();
  // 建议问题按钮
  const suggestionBtns = page.locator("button").filter({ hasText: /了解|日常|评估|计划/ });
  const count = await suggestionBtns.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

test("long conversation title is truncated in sidebar", async ({ page }) => {
  await login(page);

  // 发送一条超长消息以创建长标题
  const longMsg = "我想深入了解一下数据分析师" + "的".repeat(20) + "职业发展路径";
  await page.getByPlaceholder(/Enter 发送/).fill(longMsg);
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

  // 标题应被截断（不超过约30字符显示宽度）
  const titleBtn = page.locator(".conversation-title-btn").first();
  const titleText = await titleBtn.textContent();
  expect(titleText).not.toBeNull();
  if (titleText) {
    expect(titleText.length).toBeLessThan(40);
  }
});
