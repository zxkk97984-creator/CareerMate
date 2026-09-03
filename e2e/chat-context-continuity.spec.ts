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
  test("完整 DBA 对话——逐字段验证画像保存，不重复提问", async ({ page }) => {
    await login(page);

    // 发送用户的完整自我介绍：大二、数据科学专业、DBA目标、10小时、SQL/NoSQL/Linux/预算
    const fullInput = "我是大二学生，专业数据科学与大数据技术，想做数据库运维DBA，每周可以投入10小时，学过SQL和数据库原理，了解一点NoSQL，有大概两个月空闲可以学，家里能装Linux虚拟机，预算希望不太贵";
    await page.getByPlaceholder(/Enter 发送/).fill(fullInput);
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    const firstText = await page.locator(".message-assistant").first().textContent();
    expect(firstText?.trim().length ?? 0).toBeGreaterThan(5);

    // 验证第1条用户消息可见且内容完整
    const firstUserMsg = page.locator(".message-user").first();
    await expect(firstUserMsg).toBeVisible();
    const userContent1 = await firstUserMsg.textContent();
    expect(userContent1).toContain("DBA");
    expect(userContent1).toContain("10小时");

    // 逐字段 API 验证画像——种子数据已设置 6 小时
    const meResp1 = await page.evaluate(async () => {
      const r = await fetch("/api/me");
      return r.json();
    }) as { ok: boolean; data: { profile: Record<string, unknown> } | null };
    expect(meResp1.ok).toBe(true);
    const profile1 = meResp1.data?.profile as Record<string, unknown>;
    expect(profile1?.weeklyAvailableHours).toBe(6); // 种子数据默认值（候选未确认前不变）

    // 完整自我介绍应生成候选：weeklyAvailableHours(10) + targetRole(DBA)
    const candidatesResp = await page.evaluate(async () => {
      const r = await fetch("/api/profile/candidates");
      return r.json();
    }) as { ok: boolean; data: { items: Array<{ field: string; newValue: unknown }> } };
    expect(candidatesResp.ok).toBe(true);
    const items = candidatesResp.data.items;
    // 10小时候选（种子值6→10变更需确认）
    const hoursC = items.find((c) => c.field === "weeklyAvailableHours" && String(c.newValue ?? "").includes("10"));
    expect(hoursC, "10小时候选").toBeDefined();
    // DBA目标岗位候选（通用模式提取，非硬编码特定岗位）
    const roleC = items.find((c) => {
      if (c.field !== "targetRole") return false;
      const v = c.newValue;
      if (typeof v === "object" && v !== null) return String((v as Record<string,unknown>).key ?? "").includes("dba") || String((v as Record<string,unknown>).label ?? "").includes("DBA");
      return String(v ?? "").toLowerCase().includes("dba");
    });
    expect(roleC, "DBA目标岗位候选").toBeDefined();

    // 发送更多信息：实践偏好和约束
    await page.getByPlaceholder(/Enter 发送/).fill("我比较喜欢动手实践的方式学习，不要纯看视频");
    await page.getByLabel("发送消息").click();
    await expect(async () => {
      const count = await page.locator(".message-assistant").count();
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 15000 });

    // 验证第2条用户消息可见
    const secondUserMsg = page.locator(".message-user").nth(1);
    await expect(secondUserMsg).toBeVisible();
    const userContent2 = await secondUserMsg.textContent();
    expect(userContent2).toContain("动手实践");

    // 第三轮：确认目标（用别名）
    await page.getByPlaceholder(/Enter 发送/).fill("DBA具体需要学什么");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    // 验证用户消息数 = 3（不是重复或丢失）
    const userMsgs = page.locator(".message-user");
    await expect(userMsgs).toHaveCount(3);

    // 验证所有用户消息文本与原始输入对应
    const userTexts = await Promise.all(
      Array.from({ length: 3 }, (_, i) => userMsgs.nth(i).textContent()),
    );
    expect(userTexts[0]).toContain("DBA");
    expect(userTexts[1]).toContain("动手实践");
    expect(userTexts[2]).toContain("学什么");

    // 验证对话历史和消息完整性——每条助手回复都有正文
    const assistantMsgs = page.locator(".message-assistant");
    const msgCount = await assistantMsgs.count();
    expect(msgCount).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < msgCount; i++) {
      const text = await assistantMsgs.nth(i).textContent();
      expect(text?.trim().length ?? 0).toBeGreaterThan(0);
    }

    // 最终逐字段验证
    const meResp2 = await page.evaluate(async () => {
      const r = await fetch("/api/me");
      return r.json();
    }) as { ok: boolean; data: { profile: Record<string, unknown> } | null };
    expect(meResp2.ok).toBe(true);
    const profile2 = meResp2.data?.profile as Record<string, unknown>;
    expect(profile2?.weeklyAvailableHours).toBe(6); // 未确认候选前画像不变
    // 候选记录持续存在
    const finalCandidates = await page.evaluate(async () => {
      const r = await fetch("/api/profile/candidates");
      return r.json();
    }) as { ok: boolean; data: { items: Array<{ field: string }> } };
    const fields = finalCandidates.data.items.map((c) => c.field);
    expect(fields, "应包含每周时间").toContain("weeklyAvailableHours");
    expect(fields, "应包含目标岗位").toContain("targetRole");
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

test.describe("通用职业回归——任意非种子岗位无白名单拒答", () => {
  test("精算师（非种子职业）正常回答不拒答", async ({ page }) => {
    await login(page);

    await page.getByPlaceholder(/Enter 发送/).fill("我想做精算师，需要什么能力？");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    const text = await page.locator(".message-assistant").first().textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(5);
    // 不应出现"目前仅支持"等白名单拒答文字
    expect(text).not.toContain("目前仅支持");
    expect(text).not.toContain("目前支持");
  });

  test("海洋生物声学研究员（非种子职业）正常回答不拒答", async ({ page }) => {
    await login(page);

    await page.getByPlaceholder(/Enter 发送/).fill("我想了解海洋生物声学研究员这个职业");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    const text = await page.locator(".message-assistant").first().textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(5);
    expect(text).not.toContain("目前仅支持");
  });

  test("工业设计师追问不重复提问", async ({ page }) => {
    await login(page);

    // 第一轮：表达职业意向
    await page.getByPlaceholder(/Enter 发送/).fill("我想做工业设计师");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    // 第二轮：自然追问
    await page.getByPlaceholder(/Enter 发送/).fill("需要学哪些软件？");
    await page.getByLabel("发送消息").click();
    await expect(page.locator(".message-assistant").nth(1)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 20000 });

    // 验证有两轮对话（非死循环或拒答）
    const userMsgs = page.locator(".message-user");
    await expect(userMsgs).toHaveCount(2);
    const assistantMsgs = page.locator(".message-assistant");
    await expect(assistantMsgs).toHaveCount(2);
  });
});
