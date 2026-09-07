import { expect, test, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("账号").fill("student_lin");
  await page.getByLabel("密码", { exact: true }).fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.getByRole("button", { name: "新对话", exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByLabel("输入消息", { exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("button", { name: "正在回复", exact: true })).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator(".message-assistant").last()).toBeVisible();
}
test("primary chat uses persistent API conversations and restores history after reload", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "把下一步，聊清楚。" })).toBeVisible();
  await send(page, "我想成为 AI 产品经理，这周应该先做什么？");
  await send(page, "我每周有六小时，帮我细化一下");
  await expect(page.locator(".message-user")).toHaveCount(2);
  await expect(page.locator(".message-assistant")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".message-user")).toHaveCount(2);
  await expect(page.locator(".message-assistant")).toHaveCount(2);
  await page.getByRole("button", { name: "成长档案", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "成长档案" }).getByRole("heading", { name: "AI 产品经理" })).toBeVisible();
});
test("full page and workspace assistant share messages and an unsent draft", async ({ page }) => {
  await login(page);
  await send(page, "我想了解数据分析师需要哪些能力？");
  await page.getByLabel("输入消息", { exact: true }).fill("切换页面后继续这条草稿");
  await page.getByRole("link", { name: "成长概览", exact: true }).click();
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "AI 助手", exact: true });
  await expect(panel.getByLabel("输入消息", { exact: true })).toHaveValue("切换页面后继续这条草稿");
  await expect(panel.locator(".message-user")).toHaveCount(1);
  await panel.getByRole("link", { name: "全屏对话" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByLabel("输入消息", { exact: true })).toHaveValue("切换页面后继续这条草稿");
});
test("a conversation can be renamed and selected after a new chat", async ({ page }) => {
  await login(page); await send(page, "今天先聊职业方向");
  const row = page.locator(".conversation-item.active");
  await row.getByRole("button", { name: /^重命名/ }).focus();
  await row.getByRole("button", { name: /^重命名/ }).click();
  await page.getByLabel("会话名称").fill("我的职业讨论");
  await page.getByRole("button", { name: "保存名称" }).click();
  await expect(page.locator(".topbar-title")).toHaveText("我的职业讨论");
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await expect(page.locator(".message-user")).toHaveCount(0);
  await page.getByRole("button", { name: "我的职业讨论", exact: true }).first().click();
  await expect(page.locator(".message-user")).toHaveCount(1);
});
test("mobile chat keeps the composer visible and sidebar dismissible", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("输入消息", { exact: true })).toBeInViewport();
  await expect(page.getByTestId("primary-sidebar")).not.toBeInViewport();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await expect(page.getByTestId("primary-sidebar")).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("primary-sidebar")).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
test("floating companion follows chat state, opens the assistant and is draggable", async ({ page }) => {
  await login(page);
  const dock = page.getByTestId("companion-dock");
  await expect(dock).toBeVisible();
  await expect(page.getByRole("img", { name: "霜铃 · 随时可以聊聊" })).toBeVisible();
  await page.getByLabel("输入消息", { exact: true }).fill("开始输入");
  await expect(page.getByRole("img", { name: "霜铃 · 正在听你说" })).toBeVisible();
  const toggle = page.getByRole("button", { name: /霜铃 · 正在听你说/ });
  await toggle.click();
  await expect(page.getByLabel("输入消息", { exact: true })).toBeFocused();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("careermate-companion-position") || "null"));
  const box = await dock.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 8 });
    await page.mouse.up();
  }
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("careermate-companion-position")))
    .not.toBe(JSON.stringify(before));
  await page.goto("/dashboard");
  await expect(dock).toBeVisible();
  await page.getByRole("button", { name: /霜铃 · 随时可以聊聊/ }).click();
  await expect(page.getByRole("dialog", { name: "AI 助手" })).toBeVisible();
});

test("assistant opens as a floating popup that follows the companion", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  const dock = page.getByTestId("companion-dock");
  await expect(dock).toBeVisible();

  await page.getByRole("button", { name: /霜铃 · 随时可以聊聊/ }).click();
  const panel = page.getByRole("dialog", { name: "AI 助手" });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-floating", "true");

  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  if (panelBox) {
    expect(panelBox.width).toBeLessThan(800);
    expect(panelBox.height).toBeLessThan(viewport.height - 20);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const dockBox = await dock.boundingBox();
  if (panelBox && dockBox) {
    const beside = Math.abs(panelBox.x + panelBox.width - dockBox.x) < 24
      || Math.abs(panelBox.x - (dockBox.x + dockBox.width)) < 24;
    expect(beside).toBe(true);
  }

  const before = await panel.boundingBox();
  if (before && dockBox) {
    const startX = dockBox.x + dockBox.width / 2;
    const startY = dockBox.y + dockBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 160, startY - 70, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())?.x).not.toBe(before.x);
  }

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});

test("workspace header AI entry opens the same floating popup", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /AI 助手/ }).first().click();
  const panel = page.getByRole("dialog", { name: "AI 助手" });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-floating", "true");
});

test("floating companion no longer offers an on-dock appearance switcher", async ({ page }) => {
  await login(page);
  await send(page, "帮我看看这个形象联动");
  await expect(page.getByTestId("companion-dock")).toBeVisible();
  await expect(page.getByRole("button", { name: "选择 AI 陪伴形象" })).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "AI 陪伴形象" })).toHaveCount(0);
});

test("companion appearance can switch from the settings page", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=appearance");
  const selector = page.getByTestId("companion-appearance-selector");
  await expect(selector).toBeVisible();

  await selector.getByRole("radio", { name: "阿尼亚" }).click();
  await expect(page.getByTestId("companion-dock")).toHaveAttribute("data-appearance", "anya");

  await selector.getByRole("radio", { name: "Kurisu" }).click();
  await expect(page.getByTestId("companion-dock")).toHaveAttribute("data-appearance", "kurisu");

  await selector.getByRole("radio", { name: "收起形象（隐藏浮动宠物）" }).click();
  await expect(page.getByTestId("companion-dock")).toHaveAttribute("data-appearance", "off");
});

test("all K12 pets are selectable in settings and stay synchronized with chat", async ({ page }) => {
  await login(page);
  const selector = page.getByTestId("companion-appearance-selector");
  await page.goto("/settings?tab=appearance");
  await selector.getByRole("radio", { name: "阿尼亚" }).click();
  await expect(page.getByTestId("companion-dock")).toHaveAttribute("data-appearance", "anya");

  await page.goto("/chat");
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await send(page, "帮我换一个陪伴形象");
  await expect(page.getByTestId("companion-dock").locator('[data-pet-id="anya"]')).toBeVisible();
  await expect(page.locator(".chat-thread .message-assistant img[src*='anya-avatar']")).toHaveCount(1);
  await expect(page.locator(".chat-thread .message-assistant .message-author")).toHaveText("阿尼亚");

  await page.goto("/settings?tab=appearance");
  await selector.getByRole("radio", { name: "收起形象（隐藏浮动宠物）" }).click();
  await expect(page.getByTestId("companion-dock")).toHaveAttribute("data-appearance", "off");
  // Hiding the pet must not replace the chat identity
  await page.goto("/chat");
  await expect(page.locator(".chat-thread .message-assistant img[src*='anya-avatar']")).toHaveCount(1);
  await expect(page.locator(".chat-thread .message-assistant .message-author")).toHaveText("阿尼亚");
});
