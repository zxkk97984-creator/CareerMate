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

test("smart chat keeps a page-scoped conversation", async ({ page }) => {
  const requests: Array<{ question: string; conversationId?: string }> = [];
  await page.route("**/api/tbox/chat/stream", async (route) => {
    const request = route.request().postDataJSON() as {
      question: string;
      conversationId?: string;
    };
    requests.push(request);
    const answer = requests.length === 1 ? "第一轮完整回答" : "第二轮延续回答";
    const meta = {
      requestedMode: "api",
      actualMode: "api",
      degraded: false,
      fallbackReason: null,
      source: "tbox-api",
    };
    const context = {
      intent: "roleCompetency",
      usedProfile: true,
      usedPlan: true,
      usedMemoryCount: 1,
      knowledgeSources: ["role-ai-product-manager"],
      retrievalMeta: meta,
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        `event: context\ndata: ${JSON.stringify(context)}\n\n` +
        `event: message\ndata: ${JSON.stringify({ type: "delta", content: answer.slice(0, 4), meta })}\n\n` +
        `event: message\ndata: ${JSON.stringify({ type: "delta", content: answer.slice(4), meta })}\n\n` +
        `event: done\ndata: ${JSON.stringify({ conversationId: "remote-1", meta })}\n\n`,
    });
  });

  await login(page);
  await page.getByRole("link", { name: "AI 聊天" }).click();
  await page.getByLabel("聊天问题").fill("我想做 AI 产品经理");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("第一轮完整回答", { exact: true })).toBeVisible();
  await expect(page.getByText("role-ai-product-manager", { exact: true })).toBeVisible();

  await page.getByLabel("聊天问题").fill("那我本月先做什么？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("第二轮延续回答", { exact: true })).toBeVisible();
  expect(requests).toEqual([
    { question: "我想做 AI 产品经理" },
    { question: "那我本月先做什么？", conversationId: "remote-1" },
  ]);

  await page.getByRole("button", { name: "开始新对话" }).click();
  await expect(page.getByText("第一轮完整回答", { exact: true })).toHaveCount(0);
  await expect(page.getByText("第二轮延续回答", { exact: true })).toHaveCount(0);
});

test("user completes a three-round simulation and receives one candidate", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "模拟训练" }).click();
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
});

test("new account completes multi-message onboarding", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "注册" }).click();
  await page.getByLabel("账号").fill(`e2e_${Date.now()}`);
  await page.getByLabel("昵称").fill("端到端用户");
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByPlaceholder(/一次可以告诉我多项信息/).fill("我是大三统计学专业，目标是数据分析师，每周可以投入 8 小时，喜欢项目实践和文字学习。");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByPlaceholder(/一次可以告诉我多项信息/).fill("做过校园活动数据看板和 Excel 分析，限制是工作日课程多，只能晚上学习，希望一年内找到实习。");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("button", { name: "确认并生成成长工作台" })).toBeEnabled();
  await page.getByRole("button", { name: "确认并生成成长工作台" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("admin generates and approves a validated role draft", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByLabel("岗位名称").fill("AI 客户成功");
  await page.getByLabel("岗位分类").fill("客户服务");
  await page.getByLabel("岗位来源").fill("管理员访谈记录");
  await page.getByRole("button", { name: "生成草稿" }).click();
  const draft = page.locator("div.rounded-md.border", { hasText: "AI 客户成功" }).first();
  await expect(draft.getByText(/结构校验：通过/)).toBeVisible();
  await draft.getByRole("button", { name: "通过" }).click();
  await expect(draft.getByText(/approved/)).toBeVisible();
});
