/**
 * E2E：动效降级冒烟 —— prefers-reduced-motion: reduce 下，
 * GSAP 运动层门控(useMotionSafe/getMotionSafe)的端到端验证：
 * 关键元素直接可见、无内联透明残留、最终 opacity 为 1。
 *
 * 注意：此环境的 Chrome(channel)对 test.use({ reducedMotion }) 不生效，
 * 必须在每个用例内用 page.emulateMedia({ reducedMotion: "reduce" })。
 */

import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username = "student_lin") {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill("careermate123");
  await page.getByRole("button", { name: "进入 CareerMate" }).click();
  // 登录后重定向到 /dashboard(对话板块已迁移)
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("动效降级(reduced motion)", () => {
  test("未登录落地页关键元素可见且 opacity=1", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const title = page.locator(".landing-new-title");
    await expect(title).toBeVisible({ timeout: 15000 });
    // 门控生效时无动画、无内联透明;轮询兜底到稳定态,防"卡在透明"
    await expect
      .poll(() => title.evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");
    await expect
      .poll(() =>
        page.locator(".landing-new-badge").evaluate((el) => getComputedStyle(el).opacity),
      )
      .toBe("1");
    expect(await title.getAttribute("style")).toBeNull();
  });

  test("登录后工作台 Reveal 卡片可见且 opacity=1", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    const card = page.locator(".surface-card").first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });

  test("仪表盘指标数字为最终值(非透明残留)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    const metric = page.locator(".cm-metric-card").first();
    await expect(metric).toBeVisible({ timeout: 20000 });
    // reduced motion 下 CountUp 直接落最终文本:数字格式且非空
    await expect.poll(() => metric.locator(".cm-mono").textContent()).toMatch(/^\d[\d,]*$/);
    await expect.poll(() => metric.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });
});
