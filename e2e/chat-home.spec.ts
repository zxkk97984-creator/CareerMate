import { expect, test } from "@playwright/test";

/**
 * 主链路（更新后）：登录 → 成长概览(/dashboard) → 打开 AI 助手面板 → 对话/计划/候选。
 * 独立聊天首页已移除（/chat → redirect /dashboard，助手在页头面板），
 * 因此本文件断言基于当前产品：/dashboard + 助手面板（assistant-panel）交互。
 */
async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** 打开助手面板（页头入口） */
async function openAssistant(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /AI 助手/ }).first().click();
  await expect(page.locator(".assistant-panel")).toBeVisible();
}

test("登录后落在成长概览，页头有 AI 助手入口", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid="page-content"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /AI 助手/ })).toBeVisible();
});

test("/chat 跳转到 /dashboard", async ({ page }) => {
  await login(page);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("打开助手面板后发送消息并收到 AI 回复", async ({ page }) => {
  await login(page);
  await openAssistant(page);

  const textarea = page.getByPlaceholder(/输入你的问题/);
  await expect(textarea).toBeVisible();
  await textarea.fill("我想了解数据分析师需要哪些能力？");
  await page.getByLabel("发送消息").click();

  await expect(page.locator(".assistant-panel .message-assistant")).toBeVisible({ timeout: 15000 });
  // 等待流式结束（光标消失）
  await expect(page.locator(".assistant-panel .streaming-cursor")).toHaveCount(0, { timeout: 15000 });
});

test("第一轮与第二轮消息追加在同一会话（不被历史加载覆盖）", async ({ page }) => {
  await login(page);
  await openAssistant(page);

  const textarea = page.getByPlaceholder(/输入你的问题/);
  await textarea.fill("我想了解数据分析师需要哪些能力？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".assistant-panel .message-assistant")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".assistant-panel .streaming-cursor")).toHaveCount(0, { timeout: 15000 });

  await textarea.fill("那数学基础要达到什么程度？");
  await page.getByLabel("发送消息").click();
  await expect(page.locator(".assistant-panel .message-assistant")).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator(".assistant-panel .streaming-cursor")).toHaveCount(0, { timeout: 15000 });
});

test("Escape 关闭助手面板并回焦", async ({ page }) => {
  await login(page);
  await openAssistant(page);
  await expect(page.locator(".assistant-panel")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".assistant-panel")).toHaveCount(0);
  // 焦点回到触发按钮
  await expect(page.getByRole("button", { name: /AI 助手/ })).toBeFocused();
});

test("生成计划达到可确认版本并可进入路径页", async ({ page }) => {
  await login(page);
  await openAssistant(page);
  const textarea = page.getByPlaceholder(/输入你的问题/);
  await textarea.fill("帮我制定一个3个月学习计划");
  await page.getByLabel("发送消息").click();

  const planCard = page.locator(".assistant-panel").getByRole("region", { name: /计划/ });
  await expect(planCard).toBeVisible({ timeout: 20000 });
  const acceptButton = planCard.getByRole("button", { name: "确认新版本" });
  await expect(acceptButton).toBeVisible({ timeout: 10000 });
  const acceptResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/decision"),
  );
  await acceptButton.click();
  const acceptResponse = await acceptResponsePromise;
  const accepted = await acceptResponse.json() as { ok: boolean; data: { new: { id: string; status: string } } };
  expect(acceptResponse.ok()).toBe(true);
  expect(accepted.ok).toBe(true);
  expect(accepted.data?.new?.status).toBe("active");
  await expect(acceptButton).toHaveCount(0);

  // 进入职业路径页并能在刷新后加载
  await page.goto("/path");
  await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "职业路径" })).toBeVisible({ timeout: 10000 });
});

test("候选卡在确认接口失败时保持待确认并可重试", async ({ page }) => {
  await login(page);
  await openAssistant(page);
  const textarea = page.getByPlaceholder(/输入你的问题/);
  await textarea.fill("我每周可以投入 11 小时学习");
  await page.getByLabel("发送消息").click();

  const candidate = page.locator(".assistant-panel").getByRole("region", { name: "每周可用时间候选更新" });
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
  await expect(candidate.getByRole("button", { name: "确认" })).toBeVisible();
});

test("低动效下仪表盘指标数字为最终值（非透明残留）", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  const metric = page.locator(".cm-metric-card").first();
  await expect(metric).toBeVisible({ timeout: 20000 });
  await expect.poll(() => metric.locator(".cm-mono").textContent()).toMatch(/^\d[\d,]*$/);
  await expect.poll(() => metric.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

// ── 375px 移动端视口：助手面板为全屏 sheet ──
test.describe("mobile viewport (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("开放助手为全屏 sheet 且输入可见不被遮挡", async ({ page }) => {
    await login(page);
    await openAssistant(page);
    const textarea = page.getByPlaceholder(/输入你的问题/);
    await expect(textarea).toBeVisible();
    const box = await textarea.boundingBox();
    expect(box).not.toBeNull();
    if (box) expect(box.y + box.height).toBeLessThanOrEqual(812);
  });
});
