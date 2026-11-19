import { expect, type Browser, type Page } from '@playwright/test';
import { expectAccessible, GROWER_APP, signIn, STAFF_APP, USERS, selectOptionContaining } from './stack';

/** grower.in1 raises an agronomy-advice case in grower-web; returns its number from the confirmation. */
export async function growerRaisesCase(page: Page, title: string): Promise<string> {
  await signIn(page, GROWER_APP, USERS.growerIn1, '/cases/new');
  await page.getByLabel('What do you need?').selectOption('AGRONOMY_ADVICE');
  await page.getByLabel('If there is no product: what is it about?').selectOption('CP');
  await page.getByLabel('Short title').fill(title);
  await page.getByLabel('What happened?').fill('Which spray interval for grapes after rain? (Playwright)');
  await page.getByRole('button', { name: 'Send' }).click();
  const status = page.getByRole('status');
  await expect(status).toContainText(/Case \S+ raised/);
  return (await status.textContent())!.match(/Case (\S+) raised/)![1];
}

/** care.in finds grower.in1 by phone and opens the case with this number (PRD J5). */
export async function careOpensCase(page: Page, caseNo: string): Promise<void> {
  await signIn(page, STAFF_APP, USERS.careIn, '/growers');
  await page.getByLabel('Mobile number').fill(USERS.growerIn1.phone);
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByText(USERS.growerIn1.name)).toBeVisible();
  await expectAccessible(page, 'J5 grower lookup');
  await page.getByRole('link', { name: 'Cases of this grower' }).first().click();
  await page.getByRole('link', { name: caseNo }).click();
  await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
}

/** On the staff case page: an internal note, a public reply, assignment to agro.in. */
export async function careWorksCase(page: Page, note: string, reply: string): Promise<void> {
  await page.getByLabel('Staff-only note', { exact: true }).check();
  await page.getByLabel('Staff-only note (the grower does not see it)').fill(note);
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByLabel('Reply to the grower', { exact: true }).check();
  await page.getByLabel('Reply (the grower sees it)').fill(reply);
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText(reply)).toBeVisible();
  await selectOptionContaining(page, 'Assign to', USERS.agroIn.name);
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(page.getByText(`Assignee: ${USERS.agroIn.name}`)).toBeVisible();
}

/** A separate browser context per persona: sessions never mix. */
export async function persona(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}
