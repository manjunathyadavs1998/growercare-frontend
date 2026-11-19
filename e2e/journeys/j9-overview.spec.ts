import { expect, test } from '@playwright/test';
import { expectAccessible, signIn, STAFF_APP, USERS } from '../support/stack';

/** SPEC-FE-04 FE-E409 (PRD J9): the overview's "Submitted" number equals the queue behind its link. */
test('FE-E409 J9 tm.in follows "Submitted" from the overview to the same number of cases', async ({ page }) => {
  await signIn(page, STAFF_APP, USERS.tmIn, '/overview');
  await expect(page.getByRole('heading', { name: 'Territory overview' })).toBeVisible();
  await expectAccessible(page, 'J9 overview');

  const submitted = page.getByRole('link', { name: 'Submitted', exact: true });
  const tile = submitted.locator('xpath=ancestor::li[1]');
  const expected = Number((await tile.locator('span.tabular-nums').textContent())?.trim());
  expect(expected).toBeGreaterThan(0);

  await submitted.click();
  await expect(page).toHaveURL(/status=SUBMITTED/);
  const rows = page.getByRole('table').getByRole('row').filter({ has: page.getByRole('link') });
  await expect(rows.first()).toBeVisible();
  // every page of the queue
  const more = page.getByRole('button', { name: 'Show more' });
  while (await more.isVisible()) {
    const before = await rows.count();
    await more.click();
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
  }
  expect(await rows.count()).toBe(expected);
  await expectAccessible(page, 'J9 queue');
});
