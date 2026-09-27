import { expect, type Page } from "@playwright/test";

// Browsers permit secure cookies on loopback HTTP. APIRequestContext's cookie
// jar does not, so forward this isolated browser context's cookie explicitly.
export async function authenticatedGet(page: Page, path: string) {
  const url = new URL(path, page.url());
  if (url.origin !== new URL(page.url()).origin) throw new Error("Test requests must stay on the application origin");
  const cookies = (await page.context().cookies()).filter(({ domain }) => domain === url.hostname);
  expect(cookies.some(({ name }) => name === "careermate_session"), "Browser login must establish an app session").toBeTruthy();
  const response = await page.request.get(url.href, {
    headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") },
  });
  expect(response.ok(), `Authenticated GET ${path} returned ${response.status()}`).toBeTruthy();
  return response;
}
