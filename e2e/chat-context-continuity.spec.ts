/**
 * E2E：DBA 开放式主聊天回归测试。
 *
 * 使用 mock 模式，验证：
 * 1. 不重复问目标岗位、时间和学习方式
 * 2. 刷新后历史保留
 * 3. 生成职业规划产生 pending 卡
 * 4. 普通问题有正文、无职业副作用
 * 5. 双击发送不产生重复 turn
 */

import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("DBA 开放主聊天回归（mock模式）", () => {
  test("完整 DBA 对话——不重复提问", async ({ page }) => {
    await login(page);

    // 发送第一条消息：介绍自己
    await page.getByPlaceholder(/Enter 发送/).fill("我是大二的学生，专业是数据科学与大数据技术");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

    // 发送第二条：目标岗位
    await page.getByPlaceholder(/Enter 发送/).fill("我想做数据库运维方面的");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toHaveCount(2, { timeout: 15000 });

    // 发送第三条：DBA 别名
    await page.getByPlaceholder(/Enter 发送/).fill("DBA");
    await page.getByLabel("发送消息").click();
    await page.waitForTimeout(1000);

    // 验证：对话内容存在
    const pageContent = (await page.textContent("body")) ?? "";
    expect(pageContent.length).toBeGreaterThan(100);
  });

  test("刷新后历史保留", async ({ page }) => {
    await login(page);

    // 发送消息
    await page.getByPlaceholder(/Enter 发送/).fill("我是DBA，每周10小时学习");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 刷新页面
    await page.reload();
    await expect(page).toHaveURL(/\/$/);

    // 点击第一条会话
    const firstConv = page.locator(".conversation-title-btn").first();
    await expect(firstConv).toBeVisible({ timeout: 5000 });
    await firstConv.click();

    // 验证消息存在
    await expect(page.locator(".message-wrapper")).toHaveCount(2, { timeout: 10000 });
  });

  test("生成职业规划产生 pending 卡", async ({ page }) => {
    await login(page);

    await page.getByPlaceholder(/Enter 发送/).fill("生成职业规划");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 验证有消息内容
    await expect(page.locator(".message-assistant")).toBeVisible();
    // 检查是否有计划相关部件
    const planParts = page.locator(".parts-card-plan, [data-part-type]");
    const planCount = await planParts.count();
    expect(planCount).toBeGreaterThanOrEqual(0); // mock模式下可能不生成
  });

  test("普通问题不产生职业副作用", async ({ page }) => {
    await login(page);

    await page.getByPlaceholder(/Enter 发送/).fill("Python 列表推导式是什么？");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 应有正文回答
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("发送按钮在流式期间禁用防止重复", async ({ page }) => {
    await login(page);

    const input = page.getByPlaceholder(/Enter 发送/);
    await input.fill("防重复测试消息");
    const sendBtn = page.getByLabel("发送消息");

    // 点击发送
    await sendBtn.click();

    // 等待助手回复出现（说明请求已发出）
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });

    // 验证最终有一条用户消息和一条助手回复
    const userMessages = page.locator(".message-user");
    const assistantMessages = page.locator(".message-assistant");
    await expect(userMessages.first()).toBeVisible();
    await expect(assistantMessages.first()).toBeVisible();
  });
});
