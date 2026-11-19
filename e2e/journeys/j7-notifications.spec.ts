import { expect, test } from '@playwright/test';
import { careOpensCase, careWorksCase, growerRaisesCase, persona } from '../support/cases';
import { mailbox, RUN, USERS } from '../support/stack';

/**
 * SPEC-FE-04 FE-E407 (PRD J7, SPEC-NOT-02 E48): after the J5 steps, the grower's mailbox holds the case-created and
 * reply messages in Marathi and nothing for the internal note; agro.in has the assignment email. The local stack runs
 * notification-service with a 20 s window and no quiet hours (SPEC-NOT-02 D9).
 */
test('FE-E407 J7 everyone is kept informed', async ({ browser }) => {
  const grower = await persona(browser);
  const caseNo = await growerRaisesCase(grower, `Notify me ${RUN}`);
  const care = await persona(browser);
  await careOpensCase(care, caseNo);
  const caseId = care.url().split('/cases/')[1];
  await careWorksCase(care, `Internal: not for the grower ${RUN}`, `Here is our advice ${RUN}`);

  const forCase = (items: { template: string; language: string; body: string }[]) =>
    items.filter((m) => m.body.includes(`/cases/${caseId}`)).map((m) => `${m.template}/${m.language}`).reverse();

  await expect.poll(async () => forCase(await mailbox(USERS.growerIn1.phone)), { timeout: 90_000, intervals: [2_000] })
    .toEqual(['case.created/mr', 'case.reply/mr']);
  await expect.poll(async () => forCase(await mailbox(USERS.agroIn.email)), { timeout: 30_000, intervals: [2_000] })
    .toEqual(['staff.assigned/en']);
  const growerMessages = (await mailbox(USERS.growerIn1.phone)).filter((m) => m.body.includes(`/cases/${caseId}`));
  for (const m of growerMessages) expect(m.body).not.toContain('Internal');
});
