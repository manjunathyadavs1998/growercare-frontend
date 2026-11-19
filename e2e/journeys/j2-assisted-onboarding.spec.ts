import { expect, test } from '@playwright/test';
import { expectAccessible, freshPhone, mailbox, otpFor, RUN, signIn, STAFF_APP, USERS } from '../support/stack';

/** SPEC-FE-04 FE-E402 (PRD J2): a retailer onboards a grower who is in the shop; the grower reads out the code. */
test('FE-E402 J2 retailer.in onboards a grower with the code from their phone', async ({ page }) => {
  const phone = freshPhone();
  const name = `Assisted Grower ${RUN}`;

  await signIn(page, STAFF_APP, USERS.retailerIn, '/partner/growers');
  await expect(page.getByRole('heading', { name: 'My growers' })).toBeVisible();
  await expectAccessible(page, 'J2 my growers');
  await page.getByRole('link', { name: 'Onboard a grower' }).click();

  await page.getByLabel("Grower's name").fill(name);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('District').selectOption({ label: 'Pune' });
  await page.getByLabel("Grower's language").selectOption('mr');
  await expect(page.getByLabel('My shop is their preferred retailer')).toBeChecked();
  await expectAccessible(page, 'J2 onboard');
  await page.getByRole('button', { name: 'Register and continue' }).click();

  // the notices in the grower's language, then the code to the grower's phone
  await expect(page.getByRole('heading', { name: `Consent for ${name}` })).toBeVisible();
  await expectAccessible(page, 'J2 consent');
  await page.getByRole('button', { name: `Send the code to …${phone.slice(-4)}` }).click();
  const code = await otpFor(phone);
  expect((await mailbox(phone))[0].language).toBe('mr');
  await page.getByLabel(`Code the grower received on …${phone.slice(-4)}`).fill(code);
  await page.getByRole('button', { name: 'Confirm' }).click();

  // ACTIVE in "My growers"
  await expect(page.getByRole('status')).toContainText(`${name} is now active.`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});
