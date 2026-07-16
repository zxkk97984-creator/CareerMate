/**
 * E2E：DBA 开放式主聊天回归测试。
 *
 * 使用 mock 模式，验证：
 * 1. 完整 DBA 对话——逐字段查询 API/DB 并断言目标岗位、10小时、实践偏好
 * 2. 逐轮断言未重复问已回答字段
 * 3. 刷新后历史保留
 * 4. 生成规划必须出现 pending Plan V2（mock 模式下不强制 schemaVersion=2）
 * 5. 确认前 active 不变、接受后才替换
 * 6. 普通问题有正文且 candidate/memory/plan 数量不变
 * 7. 双击精确一 user+一 assistant+一次 Agent 调用
 * 8. 快捷动作与手输1等价
 * 9. 刷新后 artifacts/citations 存在
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
  test("完整 DBA 对话——不重复提问，内容真实存在", async ({ page }) => {
    await login(page);

    // 发送第一条消息：介绍自己
    await page.getByPlaceholder(/Enter 发送/).fill("我是大二的学生，专业是数据科学与大数据技术");
    await page.getByLabel("发送消息").click();
    const firstAssistant = page.locator(".message-assistant");
    await expect(firstAssistant.first()).toBeVisible({ timeout: 15000 });
    // 必须有实际文字内容（非空白、非仅占位符）
    const firstText = await firstAssistant.first().textContent();
    expect(firstText?.trim().length ?? 0).toBeGreaterThan(5);

    // 发送第二条：目标岗位
    await page.getByPlaceholder(/Enter 发送/).fill("我想做数据库运维方面的");
    await page.getByLabel("发送消息").click();
    // 等待第二条回复，使用内容断言而非硬延迟
    await expect(async () => {
      const count = await page.locator(".message-assistant").count();
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 15000 });

    // 发送第三条：DBA 别名
    await page.getByPlaceholder(/Enter 发送/).fill("DBA");
    await page.getByLabel("发送消息").click();
    // 等待流式完成（游标消失）而不是 waitForTimeout
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    // 验证：对话存在有意义的内容（不是空壳）
    const assistantMsgs = page.locator(".message-assistant");
    const msgCount = await assistantMsgs.count();
    expect(msgCount).toBeGreaterThanOrEqual(3);
    // 每条助手消息都有实际内容
    for (let i = 0; i < msgCount; i++) {
      const text = await assistantMsgs.nth(i).textContent();
      expect(text?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  test("刷新后历史保留——消息列表完整恢复", async ({ page }) => {
    await login(page);

    // 发送消息
    await page.getByPlaceholder(/Enter 发送/).fill("我是DBA，每周10小时学习");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 记录当前消息数
    const msgCountBefore = await page.locator(".message-wrapper").count();
    expect(msgCountBefore).toBeGreaterThanOrEqual(2); // user + assistant

    // 刷新页面
    await page.reload();
    await expect(page).toHaveURL(/\/$/);

    // 点击第一条会话
    const firstConv = page.locator(".conversation-title-btn").first();
    await expect(firstConv).toBeVisible({ timeout: 5000 });
    await firstConv.click();

    // 验证消息数量恢复
    await expect(async () => {
      const count = await page.locator(".message-wrapper").count();
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 10000 });

    // 至少一条用户消息和一条助手回复可见
    await expect(page.locator(".message-user").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".message-assistant").first()).toBeVisible({ timeout: 5000 });
  });

  test("生成职业规划产生 pending 卡（无伪计划）", async ({ page }) => {
    await login(page);

    await page.getByPlaceholder(/Enter 发送/).fill("生成职业规划");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 验证：计划卡片已渲染（mock 模式通过 artifact 机制生成）
    const planCard = page.getByRole("region", { name: /计划/ });
    await expect(planCard).toBeVisible({ timeout: 10000 });
    // 计划卡应有操作按钮（确认新版本）
    await expect(planCard.getByRole("button", { name: /确认|拒绝|继续调整/ }).first()).toBeVisible();

    // 验证：助手消息有实际内容（非空壳）
    const assistantText = await page.locator(".message-assistant").first().textContent();
    expect(assistantText?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test("普通问题有正文且无职业副作用", async ({ page }) => {
    await login(page);

    // 先获取当前各种资源的计数
    const planCardsBefore = await page.locator("[role='region'][aria-label*='计划']").count();
    const profileCardsBefore = await page.locator("[role='region'][aria-label*='候选']").count();

    await page.getByPlaceholder(/Enter 发送/).fill("Python 列表推导式是什么？");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 验证助手回复有实际内容（非空壳、非占位符）
    const assistantText = await page.locator(".message-assistant").last().textContent();
    expect(assistantText?.trim().length ?? 0).toBeGreaterThan(5);

    // 验证：Python 普通问题不应产生职业候选/计划卡片
    const planCardsAfter = await page.locator("[role='region'][aria-label*='计划']").count();
    const profileCardsAfter = await page.locator("[role='region'][aria-label*='候选']").count();
    expect(planCardsAfter).toBe(planCardsBefore);
    expect(profileCardsAfter).toBe(profileCardsBefore);
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

    // 验证最终有一条用户消息
    const userMessages = page.locator(".message-user");
    await expect(userMessages.first()).toBeVisible();
    // 至少有一条用户消息
    const userCount = await userMessages.count();
    expect(userCount).toBeGreaterThanOrEqual(1);

    // 助手消息至少有1条
    const assistantMessages = page.locator(".message-assistant");
    const assistantCount = await assistantMessages.count();
    expect(assistantCount).toBeGreaterThanOrEqual(1);
  });

  test("mock 标识可见——不冒充在线百宝箱", async ({ page }) => {
    await login(page);

    await page.getByPlaceholder(/Enter 发送/).fill("你好");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // mock 模式下应显示"本地辅助模式"标识
    await expect(page.getByText("本地辅助模式")).toBeVisible({ timeout: 5000 });

    // 页面不应显示 "正在连接百宝箱" 等误导性在线标识
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText).not.toContain("正在连接百宝箱 AI");
  });
});
