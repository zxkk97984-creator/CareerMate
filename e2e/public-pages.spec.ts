import { expect, test } from "@playwright/test";
import { authenticatedGet } from "./helpers/authenticated-request";

test("介绍页默认完整动效，示例交互不写入个人数据", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() !== "GET") writes.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // A setting from the HTML preview must not turn off the requested default.
  await page.addInitScript(() => localStorage.setItem("careermate-ui-motion-v3", "off"));
  await page.goto("/");
  await expect(page.locator(".cl-page")).toHaveAttribute("data-motion-mode", "full");
  await expect(page.getByRole("button", { name: /动效设置/ })).toHaveCount(0);
  await expect(page.locator(".cl-meteor-trail")).toHaveCount(1);
  await expect(page.locator(".v2-landscape")).toBeVisible();
  expect(await page.locator(".v2-landscape").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "了解形成计划", exact: true }).click();
  await expect(page.locator("#tab-plan")).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("整理课程项目记录目标、分工与遇到的问题").check();
  await expect(page.getByRole("progressbar", { name: "示例任务进度" })).toHaveAttribute("aria-valuenow", "1");
  await page.locator("#tab-profile").click();
  await page.getByRole("button", { name: "确认这份示例画像" }).click();
  await expect(page.locator("[data-confirm-status]")).toContainText("没有创建或保存个人资料");
  await page.getByRole("button", { name: "播放对话示例" }).click();
  await expect(page.getByRole("button", { name: "正在播放示例" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "播放对话示例" })).toBeEnabled({ timeout: 10_000 });
  await page.locator("#tab-profile").press("End");
  await expect(page.locator("#tab-growth")).toBeFocused();
  await expect(page.locator("#panel-growth")).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("训练演示和 FAQ 可操作，系统减少动态效果优先", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/#practice");
  const play = page.getByRole("button", { name: "自动演示", exact: true });
  await play.click();
  await expect(page.locator("[data-training-play]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#train-panel-1")).toBeVisible({ timeout: 10_000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".cl-page")).toHaveAttribute("data-motion-mode", "off");
  await expect(page.locator("[data-training-play]")).toBeDisabled();
  await expect(page.locator(".cl-meteor-trail")).toBeHidden();
  await page.locator("#train-tab-3").click();
  await expect(page.locator("#train-panel-3")).toBeVisible();
  const faq = page.locator(".cl-faq-list details").first();
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await faq.locator("summary").click();
  await expect(faq).not.toHaveAttribute("open", "");
});

test("介绍与登录在窄屏和桌面正常展示，客户端往返不会重复挂载动效", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("#hero-title")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    if (width < 768) {
      await page.getByRole("button", { name: "展开导航" }).click();
      await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("navigation", { name: "移动导航" })).toBeHidden();
    }
    if (width === 1280) await page.screenshot({ path: "/tmp/careermate-ui-qa/landing-desktop.png" });
    if (width === 390) await page.screenshot({ path: "/tmp/careermate-ui-qa/landing-mobile.png" });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "欢迎回来。" })).toBeVisible();
    await expect(page.getByRole("button", { name: /动效设置/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    if (width === 1280) await page.screenshot({ path: "/tmp/careermate-ui-qa/login-desktop.png" });
    if (width === 390) await page.screenshot({ path: "/tmp/careermate-ui-qa/login-mobile.png" });
  }
  for (let index = 0; index < 2; index++) {
    await page.getByRole("link", { name: "返回首页", exact: true }).click();
    await expect(page.locator(".cl-page")).toBeVisible();
    await expect(page.locator(".cl-meteor-trail")).toHaveCount(1);
    await page.getByRole("link", { name: "登录", exact: true }).click();
    await expect(page.locator(".cm-auth")).toBeVisible();
    await expect(page.locator(".cl-meteor-trail")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("新登录界面使用真实接口并保留错误恢复、口令显示和演示账号", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "使用演示账号" }).click();
  await page.getByRole("button", { name: "学生小林", exact: true }).click();
  const password = page.getByLabel("密码", { exact: true });
  await expect(password).toHaveValue("careermate123");
  await page.getByRole("button", { name: "显示口令" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏口令" }).click();
  await password.fill("wrong-password");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page.locator(".cm-auth").getByRole("alert")).toBeVisible();
  await expect(password).toHaveValue("wrong-password");
  await password.fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.locator(".cl-meteor-trail")).toHaveCount(0);
  const me = await (await authenticatedGet(page, "/api/me")).json();
  expect(me.data.user.username).toBe("student_lin");
});

test("新注册界面校验字段并真实创建账号，进入画像引导", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "注册", exact: true }).click();
  await expect(page.locator(".cm-auth-content")).toHaveAttribute("data-mode", "register");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.locator(".cm-auth").getByRole("alert")).toContainText("请检查以下输入");
  const username = `public_ui_${Date.now()}`;
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("昵称", { exact: true }).fill("界面验收用户");
  await page.getByLabel("密码", { exact: true }).fill("careermate-test-123");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?intent=profile/);
  const me = await (await authenticatedGet(page, "/api/me")).json();
  expect(me.data.user.username).toBe(username);
  expect(me.data.profile?.onboardingCompleted ?? false).toBe(false);
});
