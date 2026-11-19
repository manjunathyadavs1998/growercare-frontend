import { expect, test } from '@playwright/test';
import { persona } from '../support/cases';
import { api, expectAccessible, GROWER_APP, raiseCaseByApi, RUN, signIn, STAFF_APP, USERS } from '../support/stack';

/** SPEC-FE-04 FE-E406 (PRD J6): the assignee works the case to a closing status; a stale tab is refused. */
test('FE-E406 J6 agro.in moves the case to Closed; a stale second tab gets a conflict', async ({ browser }) => {
  const { caseId } = await raiseCaseByApi(`Close me ${RUN}`);
  // set-up through the API: care.in assigns agro.in (102)
  const care = await api(USERS.careIn);
  const view = await care.get(`/api/cases/cases/${caseId}`);
  const assigned = await care.put(`/api/cases/cases/${caseId}/assignee`, { assigneeUserId: '102' }, { 'If-Match': view.headers()['etag'] });
  expect(assigned.status(), await assigned.text()).toBe(200);
  await care.dispose();

  const agro = await persona(browser);
  await signIn(agro, STAFF_APP, USERS.agroIn, `/cases/${caseId}`);
  const moves = agro.getByRole('group', { name: 'Move the case to' });
  await expect(moves).toBeVisible();
  await expectAccessible(agro, 'J6 staff case');

  // a second tab opened now holds the case's current version
  const stale = await agro.context().newPage();
  await stale.goto(`${STAFF_APP}/cases/${caseId}`);
  await expect(stale.getByRole('group', { name: 'Move the case to' })).toBeVisible();

  // the offered steps, to a closing one: In progress → Advice given → Closed
  for (const step of ['In progress', 'Advice given', 'Closed']) {
    await moves.getByRole('button', { name: step }).click();
    if (step === 'Closed') await expect(agro.getByText('This step closes the case.')).toBeVisible();
    await agro.getByLabel('Note for the trail (optional)').fill(`J6 ${step} ${RUN}`);
    await agro.getByRole('button', { name: `Move to ${step}` }).click();
    if (step !== 'Closed') await expect(moves.getByRole('button', { name: step })).toHaveCount(0);
  }
  await expect(agro.getByText('No workflow step is open to you here.')).toBeVisible();

  // the stale tab tries the first step with the old version → 412, "someone else changed this"
  await stale.getByRole('group', { name: 'Move the case to' }).getByRole('button', { name: 'In progress' }).click();
  await stale.getByRole('button', { name: 'Move to In progress' }).click();
  await expect(stale.getByText('Someone else changed this in the meantime. Reload to see the latest version.')).toBeVisible();

  // the grower sees "Closed"
  const grower = await persona(browser);
  await signIn(grower, GROWER_APP, USERS.growerIn1, `/cases/${caseId}`);
  await expect(grower.getByText('Closed', { exact: true }).first()).toBeVisible();
});
