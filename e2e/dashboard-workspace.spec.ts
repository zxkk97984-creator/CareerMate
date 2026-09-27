import { authenticatedGet } from "./helpers/authenticated-request";
import { expect, test } from "@playwright/test";
import type { DashboardDto } from "../src/lib/dashboard/model";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("账号").fill("student_lin");
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Only UI-specific handlers below may simulate writes; nothing reaches the database.
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "GET") await route.continue();
    else await route.fulfill({ status: 400, json: { ok: false, error: { message: "UI 测试禁止业务写入" } } });
  });
});

test("三种屏幕完整展示产出、能力与成果，详情入口连接职业路径", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await authenticatedGet(page, "/api/dashboard");
  const { data }: { data: DashboardDto } = await response.json();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "成长概览", exact: true })).toBeVisible();
  for (const viewport of [{ width: 1600, height: 1080 }, { width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".growth-task-output")).toBeVisible();
    for (const output of data.action.task!.outputs) await expect(page.locator(".growth-task-output")).toContainText(output);
    await expect(page.locator(".growth-ability-list > li")).toHaveCount(data.abilities.length);
    await expect(page.locator(".growth-evidence-list > li")).toHaveCount(data.evidence.length);
    expect(await page.locator(".workspace-content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByText("查看执行说明与验收标准", { exact: true }).click();
  await expect(page.getByText("怎样验收", { exact: true })).toBeVisible();
  for (const criterion of data.action.task!.acceptanceCriteria) await expect(page.locator(".growth-task-details dd").last()).toContainText(criterion);
  await page.getByRole("link", { name: "进入任务详情", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "任务详情", exact: true })).toBeVisible();
  await expect(page.getByTestId("unified-task-detail").getByRole("heading")).toHaveText(data.action.title);
  await expect(page.locator(".workspace-dashboard")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("任务开始与完成保留忙碌保护、冲突反馈和刷新同步", async ({ page }) => {
  const response = await authenticatedGet(page, "/api/dashboard");
  const payload: { ok: true; data: DashboardDto } = await response.json();
  const data = payload.data;
  const task = data.action.task!;
  task.status = "not_started";
  const nextTask = data.recentTasks.find((item) => item.id !== task.id)!;
  let updates = 0;
  let reads = 0;
  let releaseUpdate: () => void = () => {};
  const heldUpdate = new Promise<void>((resolve) => { releaseUpdate = resolve; });
  await page.route("**/api/dashboard", async (route) => {
    reads += 1;
    await route.fulfill({ json: payload });
  });
  await page.route("**/api/plans/*/tasks/*", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(decodeURIComponent(new URL(route.request().url()).pathname)).toBe(`/api/plans/${data.planId}/tasks/${task.id}`);
    updates += 1;
    if (updates === 1) {
      await route.fulfill({ status: 409, json: { ok: false, error: { message: "计划已变化，请确认最新状态后重试。" } } });
      return;
    }
    if (updates === 2) await heldUpdate;
    task.status = route.request().postDataJSON().status;
    if (task.status === "done") {
      data.progress.done += 1;
      data.progress.completionRate = Math.round(data.progress.done / data.progress.total * 100);
      data.action = { ...data.action, title: nextTask.title, task: nextTask, href: `/path?taskId=${nextTask.id}` };
      data.evidence.unshift({ id: "ui-completion", title: task.title, summary: "已完成任务", createdAt: "2026-09-19T00:00:00.000Z" });
    }
    await route.fulfill({ json: { ok: true, data: { changed: true } } });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "开始任务", exact: true }).click();
  await expect(page.getByTestId("page-content").getByRole("alert")).toContainText("计划已变化");
  expect(reads).toBeGreaterThan(1);
  await page.getByRole("button", { name: "开始任务", exact: true }).click();
  await expect(page.getByRole("button", { name: "开始任务", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "标记完成", exact: true })).toBeDisabled();
  releaseUpdate();
  await expect(page.locator(".growth-action .growth-status")).toHaveText("进行中");
  await expect(page.getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "标记完成", exact: true }).click();
  await expect(page.locator("#growth-action-title")).toHaveText(nextTask.title);
  await expect(page.locator("#growth-action-title")).toBeFocused();
  await expect(page.locator(".growth-evidence-list li").first()).toContainText(task.title);
  await expect(page.locator(".growth-feedback")).toContainText(`已完成「${task.title}」`);
  expect(updates).toBe(3);
});

test("手机端长标题、待确认计划与缺失评估保留真实含义", async ({ page }) => {
  const response = await authenticatedGet(page, "/api/dashboard");
  const payload: { ok: true; data: DashboardDto } = await response.json();
  const data = payload.data;
  data.targetRole = "人工智能产品与跨领域业务研究方向的职业成长规划".repeat(3);
  data.planId = null;
  data.progress = { ...data.progress, total: 0, done: 0, inProgress: 0, completionRate: null, weeklyBudgetHours: null, currentPhaseTitle: null };
  data.action = { kind: "link", title: "新计划已准备好", reason: "审阅并确认后，新计划才会生效。", label: "审阅计划", href: "/path", task: null };
  data.attention = [{ id: "plan", title: data.action.title, description: data.action.reason, label: "审阅计划", href: "/path", tone: "info" }];
  data.abilities = data.abilities.map((item) => ({ ...item, score: null }));
  data.match = null;
  data.evidence = [];
  data.recentTasks = [];
  await page.route("**/api/dashboard", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: data.targetRole, exact: true })).toBeVisible();
  await expect(page.locator(".growth-progress-caption strong")).toHaveText("待建立");
  await expect(page.locator(".growth-score strong")).toHaveText("待评估");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator(".growth-radar-polygon")).toHaveCount(0);
  await expect(page.locator(".growth-action").getByRole("link", { name: "审阅计划" })).toHaveAttribute("href", "/path");
  await expect(page.getByRole("button", { name: "标记完成" })).toHaveCount(0);
  expect(await page.locator(".workspace-content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
});
