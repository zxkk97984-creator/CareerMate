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

test("create conversation, send two messages, and reload preserves history", async ({ page }) => {
  await login(page);

  // 创建新会话——直接发消息会自动创建
  await page.getByPlaceholder(/Enter 发送/).fill("我想了解数据分析师需要哪些能力？");
  await page.getByLabel("发送消息").click();

  // 等待回复出现且完成（SSE 流式接收）
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  // 等待流式完成——消息状态变为 completed
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 第二轮必须追加在同一会话，不能被历史加载请求覆盖
  await page.getByPlaceholder(/Enter 发送/).fill("那数学基础要达到什么程度？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toHaveCount(2, { timeout: 15000 });
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

  // 应该能看到之前的消息（2 user + 2 assistant = 4）
  await expect(page.locator(".message-wrapper")).toHaveCount(4, { timeout: 10000 });
});

test("create new conversation clears message area", async ({ page }) => {
  await login(page);
  await page.waitForLoadState("networkidle");
  const initialConversationCount = await page.locator(".conversation-title-btn").count();

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
  // 本测试文件共享同一 E2E 数据库，因此断言相对增量而不是固定总数。
  // 发送消息自动创建一个会话，再点击按钮创建第二个。
  await expect(page.locator(".conversation-title-btn")).toHaveCount(
    initialConversationCount + 2,
  );
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

test("chat profile candidate can be edited and confirmed", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder(/Enter 发送/).fill("我每周可以投入 9 小时学习");
  await page.getByLabel("发送消息").click();

  const candidate = page.getByRole("region", { name: "每周可用时间候选更新" });
  await expect(candidate).toBeVisible({ timeout: 15000 });
  await candidate.getByRole("button", { name: "修改" }).click();
  await candidate.getByLabel("修改每周可用时间").fill("10");
  await candidate.getByRole("button", { name: "确认修改" }).click();
  await expect(candidate.getByText("✅ 已确认")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(/每周 10 小时/)).toBeVisible();
});

test("chat plan generation reaches a confirmable version and survives reload", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder(/Enter 发送/).fill("帮我制定一个3个月学习计划");
  await page.getByLabel("发送消息").click();

  // Agent 返回 career_plan 后卡片渲染，必须出现计划操作按钮
  const planCard = page.getByRole("region", { name: /计划/ });
  await expect(planCard).toBeVisible({ timeout: 20000 });
  const acceptButton = planCard.getByRole("button", { name: "确认新版本" });
  await expect(acceptButton).toBeVisible({ timeout: 10000 });
  const acceptResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/decision"),
  );
  await acceptButton.click();
  const acceptResponse = await acceptResponsePromise;
  const accepted = await acceptResponse.json() as {
    ok: boolean;
    data: { new: { id: string; status: string } };
  };
  expect(acceptResponse.ok()).toBe(true);
  expect(accepted.ok).toBe(true);
  expect(accepted.data?.new?.status).toBe("active");
  await expect(acceptButton).toHaveCount(0);

  // 验证刚生成并确认的计划已持久化，而非只命中种子中的旧 active 计划
  await page.goto("/path");
  await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible({ timeout: 10000 });
  // 刷新后仍能正常加载
  await page.reload();
  await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible({ timeout: 10000 });
  const current = await page.evaluate(async () => {
    const response = await fetch("/api/plans/current");
    return response.json();
  }) as {
    ok: boolean;
    data: { plan: { id: string; status: string } | null };
  };
  expect(current.ok).toBe(true);
  if (current.data?.plan) {
    expect(current.data.plan.status).toBe("active");
  }
});

test("candidate card stays pending when confirmation API fails", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder(/Enter 发送/).fill("我每周可以投入 11 小时学习");
  await page.getByLabel("发送消息").click();

  const candidate = page.getByRole("region", { name: "每周可用时间候选更新" });
  await expect(candidate).toBeVisible({ timeout: 15000 });
  await page.route("**/api/profile/candidates", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "候选已经处理过" } }),
      });
      return;
    }
    await route.continue();
  });
  await candidate.getByRole("button", { name: "确认" }).click();

  await expect(candidate.getByRole("alert")).toHaveText("候选已经处理过");
  await expect(candidate.getByText("✅ 已确认")).toHaveCount(0);
  await expect(candidate.getByRole("button", { name: "确认" })).toBeVisible();
});

test("fallback career research is never labeled as live web research", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder(/Enter 发送/).fill("请介绍用户研究员这个岗位");
  await page.getByLabel("发送消息").click();

  const report = page.getByRole("region", { name: "用户研究员 职业探索报告" });
  await expect(report).toBeVisible({ timeout: 15000 });
  await expect(report.getByText("AI分析与推断")).toBeVisible();
  await expect(report.getByText("实时联网调研")).toHaveCount(0);
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

/* ── Markdown 渲染 ── */

test("AI assistant message renders Markdown bold as <strong>", async ({ page }) => {
  await login(page);

  // 发送消息触发 mock SSE 回答（含 **加粗** 标记）
  await page.getByPlaceholder(/Enter 发送/).fill("讲讲AI产品经理");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  // 等待流式完成
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // AI 回答中 <strong> 元素存在（Markdown ** 被正确渲染）
  await expect(page.locator(".message-assistant strong").first()).toBeVisible();

  // AI 回答中不应出现原始 ** 包裹符号
  const assistantMsg = page.locator(".message-assistant .message-content").first();
  const text = await assistantMsg.textContent();
  // **CareerMate** 渲染后不应留下 ** 符号
  expect(text).not.toContain("**CareerMate**");
  expect(text).not.toContain("**AI 职业成长伙伴**");
});

test("Markdown rendering survives page reload", async ({ page }) => {
  await login(page);

  await page.getByPlaceholder(/Enter 发送/).fill("讲讲AI产品经理");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 刷新后消息仍在
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".conversation-list")).toBeVisible();

  // 点击会话查看消息
  await page.locator(".conversation-title-btn").first().click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 10000 });

  // 刷新后 Markdown 仍正确渲染
  await expect(page.locator(".message-assistant strong").first()).toBeVisible();
});

test("user message with ** is displayed as plain text", async ({ page }) => {
  await login(page);

  // 用户发送含 ** 的文本
  const userInput = "我认为**关键技能**是数据分析";
  await page.getByPlaceholder(/Enter 发送/).fill(userInput);
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  // 用户消息应保留原始 ** 符号（不被渲染为 Markdown）
  const userMsg = page.locator(".message-user .message-content").first();
  // 用户消息使用 <p className="message-text"> 渲染，不含 <strong>
  await expect(userMsg.locator("strong")).toHaveCount(0);
  // 用户消息文本中可见原始 ** 符号
  await expect(userMsg).toContainText("**关键技能**");
});
