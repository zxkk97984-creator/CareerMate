import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/* ── 统一外壳：侧栏存在与 active 状态 ── */

test("workspace pages render ProductSidebar", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  await expect(page.locator("[data-testid='primary-sidebar']")).toBeVisible();
  // 侧栏包含导航链接
  await expect(page.getByRole("link", { name: "成长概览" })).toBeVisible();
  await expect(page.getByRole("link", { name: "职业路径" })).toBeVisible();
  await expect(page.getByRole("link", { name: "模拟训练" })).toBeVisible();
});

test("active nav link has aria-current", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  const dashboardLink = page.getByRole("link", { name: "成长概览" });
  await expect(dashboardLink).toHaveAttribute("aria-current", "page");

  // 切换到职业路径，active 应转移
  await page.getByRole("link", { name: "职业路径" }).click();
  await expect(page).toHaveURL("/path");
  const pathLink = page.getByRole("link", { name: "职业路径" });
  await expect(pathLink).toHaveAttribute("aria-current", "page");
  // 成长概览不再 active
  await expect(dashboardLink).not.toHaveAttribute("aria-current", "page");
});

/* ── 移动端抽屉 ── */

test("mobile sidebar hidden by default, opens via menu button", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.goto("/dashboard");

  // 侧栏默认隐藏（不在视口内或不可见）
  const sidebar = page.locator(".chat-sidebar");
  await expect(sidebar).not.toBeInViewport();

  // 点击菜单按钮
  await page.locator(".mobile-menu-btn").click();
  await expect(sidebar).toBeInViewport();

  // 遮罩层可见
  await expect(page.locator(".sidebar-overlay")).toBeVisible();

  // 点击遮罩关闭
  await page.locator(".sidebar-overlay").click();
  await expect(sidebar).not.toBeInViewport();
});

/* ── 退出登录 ── */

test("logout redirects to login page", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");

  // 点击退出按钮
  await page.locator(".logout-link").click();
  await expect(page).toHaveURL("/login");
  // 确认已退出：再次访问需要登录的页面应重定向
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

/* ── Admin 权限守卫 ── */

test("normal user cannot access admin page", async ({ page }) => {
  await login(page, "student_lin");
  // 普通用户访问 /admin 应被重定向
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  // 普通用户侧栏不应有 Admin 入口
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Admin" })).not.toBeVisible();
});

test("admin user can access admin page", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin");
  await expect(page).toHaveURL("/admin");
  // 管理员侧栏有 Admin 入口
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
});

/* ── 无横向溢出 ── */

test("workspace pages have no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);

  const pagesToCheck = ["/dashboard", "/path", "/simulation", "/resources", "/memory"];
  for (const path of pagesToCheck) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth, `${path} 页面横向溢出：scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`).toBeLessThanOrEqual(innerWidth);
  }
});

test("mobile menu button does not overlap page title", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  // 菜单按钮可见
  const menuBtn = page.locator(".mobile-menu-btn");
  await expect(menuBtn).toBeVisible();

  // 获取菜单按钮和标题的边界矩形
  const menuRect = await menuBtn.boundingBox();
  const heading = page.getByRole("heading", { name: /成长工作台/ }).first();
  const headingRect = await heading.boundingBox();

  if (menuRect && headingRect) {
    // 标题底部应在菜单顶部以下（标题不被菜单遮挡）
    const headingOverlapped = headingRect.x < menuRect.x + menuRect.width
      && headingRect.x + headingRect.width > menuRect.x
      && headingRect.y < menuRect.y + menuRect.height
      && headingRect.y + headingRect.height > menuRect.y;
    expect(headingOverlapped, "移动端标题与菜单按钮不应重叠").toBe(false);
  }
});

test("workspace scroll container has no internal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  // 检查 chat-main 容器内部无横向溢出
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("[data-testid='page-content']");
    if (!main) return { scrollW: 0, clientW: 0 };
    return { scrollW: main.scrollWidth, clientW: main.clientWidth };
  });
  expect(overflow.scrollW, `主区内部溢出：scrollWidth=${overflow.scrollW} > clientWidth=${overflow.clientW}`).toBeLessThanOrEqual(overflow.clientW + 1);
});

test("login page has no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("chat home has no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.waitForLoadState("networkidle");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
