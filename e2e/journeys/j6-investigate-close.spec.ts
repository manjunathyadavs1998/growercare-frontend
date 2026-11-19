import { expect, test, type Locator, type Page } from '@playwright/test';
import { persona } from '../support/cases';
import { api, expectAccessible, GROWER_APP, raiseCaseByApi, RUN, signIn, STAFF_APP, USERS } from '../support/stack';

/** Applies one offered workflow step on the staff case page and waits until the page shows the new state. */
async function move(page: Page, step: string, next: string | null): Promise<void> {
  const moves = page.getByRole('group', { name: 'Move the case to' });
  await moves.getByRole('button', { name: step, exact: true }).click();
  await page.getByLabel('Note for the trail (optional)').fill(`J6 ${step} ${RUN}`);
  await page.getByRole('button', { name: `Move to ${step}` }).click();
  if (next) await expect(moves.getByRole('button', { name: next, exact: true })).toBeVisible();
}

/**
 * SPEC-FE-04 FE-E406 (PRD J6): the assignee works the case to a closing status; a stale tab is refused.
 * The stale tab tries a step that is still valid (Advice given → Closed) with an old version, so the refusal is the
 * version check (412), not the workflow (a step that is no longer offered is a 422 rule violation instead).
 */
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
  await expect(agro.getByRole('group', { name: 'Move the case to' })).toBeVisible();
  await expectAccessible(agro, 'J6 staff case');

  // Submitted → In progress → Advice given; a second tab opened now holds "Advice given" at this version
  await move(agro, 'In progress', 'Advice given');
  await move(agro, 'Advice given', 'Closed');
  const stale = await agro.context().newPage();
  await stale.goto(`${STAFF_APP}/cases/${caseId}`);
  const staleMoves: Locator = stale.getByRole('group', { name: 'Move the case to' });
  await expect(staleMoves.getByRole('button', { name: 'Closed', exact: true })).toBeVisible();

  // meanwhile the first tab goes back and forth: same status, newer version
  await move(agro, 'In progress', 'Advice given');
  await move(agro, 'Advice given', 'Closed');

  // the stale tab's "Closed" carries the old version → 412, "someone else changed this"
  await staleMoves.getByRole('button', { name: 'Closed', exact: true }).click();
  await stale.getByRole('button', { name: 'Move to Closed' }).click();
  await expect(stale.getByText('Someone else changed this in the meantime. Reload to see the latest version.')).toBeVisible();

  // the first tab closes the case
  await move(agro, 'Closed', null);
  await expect(agro.getByText('No workflow step is open to you here.')).toBeVisible();

  // the grower sees "Closed"
  const grower = await persona(browser);
  await signIn(grower, GROWER_APP, USERS.growerIn1, `/cases/${caseId}`);
  await expect(grower.getByText('Closed', { exact: true }).first()).toBeVisible();
});
