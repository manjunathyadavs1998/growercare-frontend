import { expect, test } from '@playwright/test';
import { persona } from '../support/cases';
import { expectAccessible, raiseCaseByApi, RUN, signIn, STAFF_APP, USERS } from '../support/stack';

/** SPEC-FE-04 FE-E408 (PRD J8): a time-boxed grant shows and goes; another country's case is "Not found". */
test('FE-E408 J8 admin.in grants agro.in TM for Karnataka until tomorrow, revokes it; care.br is isolated', async ({ browser }) => {
  const admin = await persona(browser);
  await signIn(admin, STAFF_APP, USERS.adminIn, '/users');
  await admin.getByLabel('Name or user id').fill(USERS.agroIn.name);
  await admin.getByRole('button', { name: 'Search' }).click();
  await expectAccessible(admin, 'J8 users');
  await admin.getByRole('link', { name: USERS.agroIn.name }).click();
  await expect(admin.getByRole('heading', { name: 'Active grants' })).toBeVisible();

  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
  await admin.getByLabel('Role', { exact: true }).selectOption('TERRITORY_MANAGER');
  await admin.getByLabel('Karnataka').check();
  await admin.getByLabel('Valid until (optional)').fill(tomorrow);
  await admin.getByLabel('Reason', { exact: true }).fill(`Cover for leave ${RUN}`);
  await expectAccessible(admin, 'J8 grant form');
  await admin.getByRole('button', { name: 'Grant', exact: true }).click();
  const revoke = admin.getByRole('button', { name: 'Revoke Territory manager' });
  await expect(revoke).toBeVisible();
  await expect(admin.getByText(/until /).first()).toBeVisible();

  await revoke.click();
  await admin.getByLabel('Reason for revoking').fill(`Leave over ${RUN}`);
  await admin.getByRole('button', { name: 'Revoke grant' }).click();
  await expect(revoke).toHaveCount(0);

  // isolation: care.br opens an Indian case by URL
  const { caseId } = await raiseCaseByApi(`Isolation ${RUN}`);
  const careBr = await persona(browser);
  await signIn(careBr, STAFF_APP, USERS.careBr, `/cases/${caseId}`);
  await expect(careBr.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expectAccessible(careBr, 'J8 not found');
});
