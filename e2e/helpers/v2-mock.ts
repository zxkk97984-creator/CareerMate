import { expect, type Page } from '@playwright/test';

/** The V2 chat mock emits prose, not ArtifactV1; assert its explicit no-write contract. */
export async function verifyV2MockReadOnly(page: Page, message: string) {
 const panel = page.locator('.assistant-panel');
 await panel.getByRole('button', { name: '新对话', exact: true }).click();
 const snapshot = () => page.evaluate(async () => {
  const paths = ['/api/profile', '/api/plans/current', '/api/profile/candidates', '/api/agentic-v2/candidates'];
  return Promise.all(paths.map(async path => {
   const response = await fetch(path); const body = await response.json();
   if (!response.ok || !body.ok) throw new Error(`Cannot read ${path}`);
   return body.data;
  }));
 });
 const before = await snapshot();
 await panel.getByLabel('输入消息').fill(message);
 await panel.getByRole('button', { name: '发送消息', exact: true }).click();
 await expect(panel.getByText(/演示回复/)).toBeVisible({ timeout: 20000 });
 const text = await panel.locator('.message-assistant').last().innerText();
 expect(text.length).toBeGreaterThan(20);
 expect(text).not.toContain('CAREERMATE_ARTIFACT');
 expect(await snapshot()).toEqual(before);
}
