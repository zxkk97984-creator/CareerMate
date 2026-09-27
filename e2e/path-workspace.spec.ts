import { authenticatedGet } from "./helpers/authenticated-request";
import { expect, test } from "@playwright/test";
import type { CareerPlanDto } from "../src/lib/types";

// UI regressions use real read responses; every business write is intercepted.
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("账号").fill("student_lin");
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "GET") await route.continue();
    else await route.fulfill({ status: 400, json: { ok: false, error: { message: "UI 测试禁止业务写入" } } });
  });
});

test("阶段完整可达，三个屏幕尺寸无横向溢出", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/path");
  await expect(page.getByRole("heading", { name: "职业路径", exact: true })).toBeVisible();
  const stages = page.getByRole("navigation", { name: "计划阶段" }).getByRole("button");
  await expect(stages.first()).toBeVisible();
  const lastTitle = await stages.last().locator("strong").innerText();
  await stages.last().click();
  await expect(page.locator(".path-stage-main h3")).toHaveText(lastTitle);
  await expect(stages.last()).toHaveAttribute("aria-current", "step");
  await stages.first().click();

  for (const viewport of [{ width: 1600, height: 1080 }, { width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".path-task-card").first()).toBeVisible();
    expect(await page.locator(".workspace-content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("任务详情按需打开，支持键盘、遮罩关闭和资源入口", async ({ page }) => {
  await page.goto("/path");
  const trigger = page.locator(".path-task-open").first();
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "任务详情", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("怎样验收", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "查找相关学习资源" })).toHaveAttribute("href", /\/resources\?taskId=.+&planId=.+/);
  await expect(drawer.getByRole("button", { name: "关闭任务详情" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.mouse.click(10, 100);
  await expect(drawer).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBeCloseTo(390, 0);
  await drawer.getByRole("button", { name: "关闭任务详情" }).click();
  await expect(drawer).toHaveCount(0);
});

test("深链接任务状态刷新后保持同步，关闭详情后不被再次打开", async ({ page }) => {
  const response = await authenticatedGet(page, "/api/plans/current");
  const payload = await response.json();
  const plan: CareerPlanDto = payload.data.plan;
  const task = plan.tasks!.at(-1)!;
  const updatedStatus = task.status === "in_progress" ? "done" : "in_progress";
  let updates = 0;
  await page.route("**/api/plans/current", (route) => route.fulfill({ json: payload }));
  await page.route("**/api/plans/*/tasks/*", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(decodeURIComponent(new URL(route.request().url()).pathname)).toBe(`/api/plans/${plan.id}/tasks/${task.id}`);
    task.status = route.request().postDataJSON().status;
    updates += 1;
    await route.fulfill({ json: { ok: true, data: { plan, changed: true } } });
  });
  await page.goto(`/path?taskId=${encodeURIComponent(task.id)}`);
  const drawer = page.getByRole("dialog", { name: "任务详情", exact: true });
  await expect(drawer.getByRole("heading", { name: task.title, exact: true })).toBeVisible();
  await drawer.getByLabel("任务状态", { exact: true }).selectOption(updatedStatus);
  await expect(drawer.getByLabel("任务状态", { exact: true })).toHaveValue(updatedStatus);
  await expect(drawer.getByLabel("任务状态", { exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  const card = page.locator(".path-task-card").filter({ has: page.getByRole("heading", { name: task.title, exact: true }) });
  await expect(card.getByRole("combobox")).toHaveValue(updatedStatus);
  await card.getByRole("combobox").selectOption("not_started");
  await expect(card.getByRole("combobox")).toHaveValue("not_started");
  await expect(card.getByRole("combobox")).toBeEnabled();
  await expect(drawer).toHaveCount(0);
  expect(updates).toBe(2);
});

test("无计划和待确认计划均有明确入口，预览保留完整任务", async ({ page }) => {
  const response = await authenticatedGet(page, "/api/plans/current");
  const payload = await response.json();
  const pending: CareerPlanDto = { ...payload.data.plan, id: "path-preview-test", status: "pending" };
  await page.route("**/api/plans/current", (route) => route.fulfill({
    json: { ok: true, data: { plan: null, pendingPlan: pending, executionMeta: null } },
  }));
  await page.goto("/path");
  await expect(page.getByRole("button", { name: "生成路径", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "接受新版本", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "拒绝", exact: true })).toBeVisible();
  await page.getByText(`查看完整计划（${pending.tasks!.length} 项任务）`, { exact: true }).click();
  await expect(page.locator(".path-pending-task-list > div")).toHaveCount(pending.tasks!.length);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});
