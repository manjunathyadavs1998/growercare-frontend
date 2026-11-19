import { expect, test } from '@playwright/test';
import { careOpensCase, careWorksCase, growerRaisesCase, persona } from '../support/cases';
import { expectAccessible, GROWER_APP, RUN, signIn, STAFF_APP, USERS } from '../support/stack';

/** SPEC-FE-04 FE-E405 (PRD J5): care triages, notes, replies and assigns; the grower sees the reply, not the note. */
test('FE-E405 J5 care.in triages, adds a note and a reply, assigns agro.in', async ({ browser }) => {
  const title = `Spray interval ${RUN}`;
  const note = `Internal: check rainfall data ${RUN}`;
  const reply = `Wait 7 days after rain before spraying ${RUN}`;

  const grower = await persona(browser);
  const caseNo = await growerRaisesCase(grower, title);

  const care = await persona(browser);
  await careOpensCase(care, caseNo);
  await expectAccessible(care, 'J5 staff case');
  // triage with a note for the trail
  await care.getByRole('group', { name: 'Move the case to' }).getByRole('button', { name: 'In progress' }).click();
  await care.getByLabel('Note for the trail (optional)').fill(`Triage ${RUN}`);
  await care.getByRole('button', { name: 'Move to In progress' }).click();
  await expect(care.getByRole('group', { name: 'Move the case to' }).getByRole('button', { name: 'Advice given' })).toBeVisible();
  await careWorksCase(care, note, reply);

  // the grower sees the reply and never the note
  await grower.goto(GROWER_APP);
  await grower.getByRole('link', { name: title }).click();
  await expect(grower.getByText(reply)).toBeVisible();
  await expect(grower.getByText(note)).toHaveCount(0);
  await expectAccessible(grower, 'J5 grower case');

  // agro.in has it in "Assigned to me"
  const agro = await persona(browser);
  await signIn(agro, STAFF_APP, USERS.agroIn);
  await agro.getByLabel('Assigned to me').check();
  await expect(agro.getByRole('link', { name: caseNo })).toBeVisible();
  await expectAccessible(agro, 'J5 queue assigned to me');
});
