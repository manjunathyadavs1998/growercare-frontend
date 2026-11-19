import { expect, test } from '@playwright/test';
import { expectAccessible, freshPhone, GROWER_APP, otpFor, RUN } from '../support/stack';

/** SPEC-FE-04 FE-E401 (PRD J1): a new grower signs up with their phone number and becomes ACTIVE. */
test('FE-E401 J1 a new grower signs up, consents and confirms the code', async ({ page }) => {
  const phone = freshPhone();
  const password = `Grow#${RUN}Pass1`;

  // Keycloak's own registration page (SPEC-IAM-03 D1): the username is the phone number
  await page.goto(GROWER_APP);
  await page.getByRole('link', { name: 'Register' }).click();
  await page.locator('#username').fill(phone);
  await page.locator('#password').fill(password);
  await page.locator('#password-confirm').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();

  // FE-R100: the account
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expectAccessible(page, 'J1 account');
  await page.getByLabel('Your name').fill(`Playwright Grower ${RUN}`);
  await page.getByRole('button', { name: 'Continue' }).click();

  // FE-R101: the grower registration
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toHaveValue(phone);
  await page.getByLabel('District').selectOption({ label: 'Pune' });
  await page.getByLabel('Language for messages').selectOption('mr');
  await expectAccessible(page, 'J1 details');
  await page.getByRole('button', { name: 'Continue' }).click();

  // FE-R102/R103: consent, then the code from the dev mailbox
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible();
  await expectAccessible(page, 'J1 consent');
  await page.getByRole('button', { name: `Agree and send a code to …${phone.slice(-4)}` }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  const code = await otpFor(phone);
  await page.getByLabel('Code', { exact: true }).fill(code);
  await expectAccessible(page, 'J1 code');
  await page.getByRole('button', { name: 'Confirm' }).click();

  // FE-R104: ACTIVE, an empty "My cases"
  await expect(page.getByRole('heading', { name: 'My cases' })).toBeVisible();
  await expect(page.getByText('You have no cases yet.')).toBeVisible();
  await expectAccessible(page, 'J1 my cases');
});
