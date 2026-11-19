import { expect, test } from '@playwright/test';
import { expectAccessible, GROWER_APP, RUN, signIn, USERS } from '../support/stack';

/** SPEC-FE-04 FE-E403 (PRD J3, as SPEC-FE-02 E105 against the real API): add, edit and archive a farm. */
test('FE-E403 J3 grower.in1 adds a farm, edits it and archives it', async ({ page }) => {
  const farm = `Plot ${RUN}`;

  await signIn(page, GROWER_APP, USERS.growerIn1, '/farms');
  await expect(page.getByRole('heading', { name: 'My farms' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a farm' }).click();
  await page.getByLabel('Farm name').fill(farm);
  await page.getByLabel('Area (hectares)').fill('1.5');
  await page.getByLabel('Cotton').check();
  await expectAccessible(page, 'J3 add farm');
  await page.getByRole('button', { name: 'Save farm' }).click();
  const item = page.getByRole('listitem').filter({ hasText: farm });
  await expect(item).toContainText('1.5 ha');

  // edit: merge patch with If-Match
  await page.getByRole('button', { name: `Edit ${farm}` }).click();
  await page.getByLabel('Area (hectares)').fill('2.25');
  await page.getByRole('button', { name: 'Save farm' }).click();
  await expect(item).toContainText('2.25 ha');
  await expectAccessible(page, 'J3 farms');

  // archive after the inline confirmation: gone from the list and from the case form
  await page.getByRole('button', { name: `Archive ${farm}` }).click();
  await page.getByRole('button', { name: 'Yes, archive' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: farm })).toHaveCount(0);
  await page.goto(`${GROWER_APP}/cases/new`);
  await expect(page.getByLabel('Farm')).toBeVisible();
  await expect(page.getByLabel('Farm').locator('option', { hasText: farm })).toHaveCount(0);
});
