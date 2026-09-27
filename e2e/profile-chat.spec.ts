import { authenticatedGet } from "./helpers/authenticated-request";
import { expect, test } from "@playwright/test";

const meta = { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "ui-test" };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "GET" || new URL(route.request().url()).pathname === "/api/auth/login") await route.continue();
    else await route.fulfill({ status: 400, json: { ok: false, error: { message: "UI 测试禁止业务写入" } } });
  });
  await page.route("**/api/chat/conversations?*", (route) => route.fulfill({ json: { ok: true, data: { items: [] } } }));
  await page.goto("/login");
  await page.getByLabel("账号").fill("student_lin");
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("旧入口进入主聊天，保留导航与正式画像，选示例不会自动发送", async ({ page }) => {
  const profile = (await (await authenticatedGet(page, "/api/me")).json()).data.profile;
  let writes = 0;
  page.on("request", (request) => { if (request.url().includes("/api/") && request.method() !== "GET") writes += 1; });
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/chat\?intent=profile/);
  await expect(page.getByRole("heading", { name: "聊聊你，让建议更适合你。" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI 对话", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".profile-saved-context")).toContainText(profile.targetRoleLabel);
  await expect(page.locator(".profile-saved-context")).toContainText(`${profile.weeklyAvailableHours} 小时`);
  await expect(page.getByText("画像完整度", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "修改可用时间" }).click();
  await expect(page.getByLabel("输入消息", { exact: true })).toHaveValue(/每周可投入/);
  await expect(page.getByLabel("输入消息", { exact: true })).toBeFocused();
  for (const viewport of [{ width: 1600, height: 1080 }, { width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByLabel("输入消息", { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  }
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await expect(page.getByTestId("primary-sidebar")).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("primary-sidebar")).not.toBeInViewport();
  await page.getByRole("button", { name: "发送消息", exact: true }).click({ trial: true });
  await page.getByRole("link", { name: "返回自由对话" }).click();
  await expect(page.getByLabel("输入消息", { exact: true })).toHaveValue(/每周可投入/);
  expect(writes).toBe(0);
});

test("正常聊天发出画像建议，确认后更新档案并保留可恢复的对话", async ({ page }) => {
  const me = await (await authenticatedGet(page, "/api/me")).json();
  const conversation = { id: "ui-profile-chat", title: "补充每周时间", status: "active", lastMessageAt: "2026-09-19", createdAt: "2026-09-19" };
  let created = false;
  let accepted = false;
  let messages: unknown[] = [];
  const candidate = { id: "ui-profile-candidate", field: "weeklyAvailableHours", oldValue: me.data.profile.weeklyAvailableHours, newValue: 8, confidence: 1, reason: "用户明确补充了可用时间。", status: "pending", evidenceExcerpt: "每周可投入 8 小时", impactSummary: "后续计划会参考新的时间预算。" };
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, data: { ...me.data, profile: { ...me.data.profile, weeklyAvailableHours: accepted ? 8 : me.data.profile.weeklyAvailableHours } } } }));
  await page.route("**/api/chat/conversations?*", (route) => route.fulfill({ json: { ok: true, data: { items: created ? [conversation] : [] } } }));
  await page.route("**/api/chat/conversations", (route) => { created = true; return route.fulfill({ json: { ok: true, data: conversation } }); });
  await page.route("**/api/chat/conversations/ui-profile-chat", (route) => route.fulfill({ json: { ok: true, data: { ...conversation, simulation: null } } }));
  await page.route("**/api/chat/conversations/ui-profile-chat/messages?*", (route) => route.fulfill({ json: { ok: true, data: messages } }));
  await page.route("**/api/profile/candidates", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toMatchObject({ candidateId: candidate.id, action: "accept" });
      accepted = true;
      candidate.status = "accepted";
      await route.fulfill({ json: { ok: true, data: {} } });
    } else await route.fulfill({ json: { ok: true, data: { items: [candidate] } } });
  });
  await page.route("**/api/chat/conversations/ui-profile-chat/stream", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ message: "我每周可投入 8 小时，请更新画像。", interaction: { surface: "onboarding", action: "message_submit" } });
    const part = { type: "profile_candidate_ref", candidateId: candidate.id };
    const content = "已整理每周时间的修改建议，请确认后生效。";
    const common = { conversationId: conversation.id, status: "completed", contextMeta: {}, executionMeta: meta, createdAt: "2026-09-19T00:00:00.000Z" };
    messages = [{ ...common, id: "ui-user", role: "user", content: "我每周可投入 8 小时，请更新画像。", parts: [] }, { ...common, id: "ui-assistant", role: "assistant", content, parts: [part] }];
    await route.fulfill({ contentType: "text/event-stream", body: `event: delta\ndata: ${JSON.stringify({ text: content })}\n\nevent: artifact\ndata: ${JSON.stringify({ part })}\n\nevent: done\ndata: ${JSON.stringify({ meta })}\n\n` });
  });
  await page.goto("/chat?intent=profile");
  await page.getByLabel("输入消息", { exact: true }).fill("我每周可投入 8 小时，请更新画像。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const card = page.getByRole("region", { name: "每周可用时间候选更新" });
  await expect(card).toBeVisible();
  if (process.env.PROFILE_QA_DIR) {
    await page.screenshot({ path: `${process.env.PROFILE_QA_DIR}/profile-candidate.png`, animations: "disabled" });
  }
  expect(accepted).toBe(false);
  await card.getByRole("button", { name: "确认", exact: true }).click();
  await expect(card).toContainText("已确认");
  await page.getByRole("button", { name: "成长档案", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "成长档案" }).getByRole("heading", { name: "8 小时" })).toBeVisible();
  await page.getByRole("button", { name: "收起成长档案" }).click();
  await page.reload();
  await expect(page.locator(".message-user")).toHaveCount(1);
  await expect(card).toContainText("已确认");
});

test("引导草稿可恢复、发送失败保留输入，达到条件后明确确认保存", async ({ page }) => {
  const me = await (await authenticatedGet(page, "/api/me")).json();
  const active = { id: "ui-onboarding-draft", status: "active", draft: { major: "软件工程", targetRole: "ai_product_manager", targetRoleLabel: "AI 产品经理" }, completeness: 2 / 7, transcript: [{ role: "assistant", content: "继续聊聊你的阶段和可用时间。" }], executionMeta: meta };
  let sends = 0;
  let saves = 0;
  let saved = false;
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, data: { ...me.data, activeOnboardingConversation: saved ? null : active } } }));
  await page.route("**/api/onboarding/chat", async (route) => {
    expect(route.request().postDataJSON().conversationId).toBe(active.id);
    sends += 1;
    if (sends === 1) { await route.fulfill({ status: 503, json: { ok: false, error: { message: "暂时无法回复，请重试。" } } }); return; }
    Object.assign(active.draft, { educationStage: "junior", weeklyAvailableHours: 8, learningPreference: ["project"], experienceSummary: "做过课程项目", constraints: ["工作日晚上学习"] });
    active.completeness = 1;
    active.transcript.push({ role: "user", content: route.request().postDataJSON().message }, { role: "assistant", content: "信息已整理，请检查下面的草稿。" });
    await route.fulfill({ json: { ok: true, data: { conversationId: active.id, assistantMessage: "信息已整理，请检查下面的草稿。", draft: active.draft, profileCompleteness: 1 }, meta } });
  });
  await page.route("**/api/onboarding/complete", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ conversationId: active.id });
    saves += 1;
    if (saves === 1) { await route.fulfill({ status: 409, json: { ok: false, error: { message: "画像尚未保存，请重试。" } } }); return; }
    saved = true;
    await route.fulfill({ json: { ok: true, data: { alreadyCompleted: false, profile: { ...me.data.profile, onboardingCompleted: true } } } });
  });
  await page.goto("/chat?intent=onboarding");
  const card = page.getByRole("region", { name: "待确认的画像草稿" });
  await expect(card).toContainText("软件工程");
  await expect(card.getByRole("button", { name: "确认保存画像" })).toBeDisabled();
  const input = page.getByLabel("输入消息", { exact: true });
  await expect(input).toHaveAttribute("maxlength", "2000");
  await input.fill("我是大三，每周有 8 小时，喜欢项目实操，做过课程项目，只能工作日晚上学习。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByTestId("page-content").getByRole("alert")).toContainText("暂时无法回复");
  await expect(input).toHaveValue(/我是大三/);
  await expect(page.locator(".message-user")).toHaveCount(0);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(card).toContainText("大三");
  await expect(card.getByRole("button", { name: "确认保存画像" })).toBeEnabled();
  expect(saves).toBe(0);
  await page.reload();
  await expect(card).toContainText("100%");
  await expect(page.locator(".message-user")).toHaveCount(1);
  await card.getByRole("button", { name: "确认保存画像" }).click();
  await expect(page.getByTestId("page-content").getByRole("alert")).toContainText("画像尚未保存");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "确认保存画像" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByTestId("page-content").getByRole("status")).toContainText("画像已保存");
  await expect(input).toHaveAttribute("maxlength", "8000");
  expect(saved).toBe(true);
});

test("画像入口不会把修改消息误发到正在进行的模拟训练", async ({ page }) => {
  const conversation = { id: "ui-training", title: "进行中的模拟训练", status: "active", lastMessageAt: "2026-09-19", createdAt: "2026-09-19" };
  await page.route("**/api/chat/conversations?*", (route) => route.fulfill({ json: { ok: true, data: { items: [conversation] } } }));
  await page.route("**/api/chat/conversations/ui-training/messages?*", (route) => route.fulfill({ json: { ok: true, data: [{ id: "ui-training-question", conversationId: conversation.id, role: "assistant", content: "请描述你会怎样分析产品需求。", parts: [], status: "completed", executionMeta: meta, contextMeta: {}, createdAt: "2026-09-19T00:00:00.000Z" }] } }));
  await page.route("**/api/chat/conversations/ui-training", (route) => route.fulfill({ json: { ok: true, data: { ...conversation, simulation: { id: "ui-session", status: "active", turnCount: 1, roundLimit: 6, scenarioTitle: "产品需求训练", scenarioSnapshot: null } } } }));
  let sent = false;
  page.on("request", (request) => { if (request.url().endsWith("/stream")) sent = true; });
  await page.goto("/chat?conversationId=ui-training");
  await expect(page.locator(".training-chat-bar")).toContainText("训练进行中");
  await page.getByRole("link", { name: "在对话中完善画像" }).click();
  await expect(page.getByLabel("输入消息", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "另开对话完善画像", exact: true }).click();
  await expect(page.getByRole("heading", { name: "聊聊你，让建议更适合你。" })).toBeVisible();
  await expect(page.getByLabel("输入消息", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "进行中的模拟训练", exact: true })).toBeVisible();
  expect(sent).toBe(false);
});
