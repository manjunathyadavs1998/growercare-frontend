import { expect, test } from '@playwright/test';
import { expectAccessible, GROWER_APP, RUN, signIn, USERS } from '../support/stack';

/** A real JPEG (the app compresses photos in the browser, so the file must decode): drawn on a canvas. */
async function photo(page: import('@playwright/test').Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#5a8f29';
    g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#d8c23a';
    for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 600, (i * 37) % 440, 30, 30);
    return canvas.toDataURL('image/jpeg', 0.9);
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** SPEC-FE-04 FE-E404 (PRD J4): a product complaint with a photo; the photo is scanned CLEAN and downloads. */
test('FE-E404 J4 grower.in1 raises a complaint about 9001 / AZX2604-117 with a photo', async ({ page, context }) => {
  const title = `Leaves yellowing ${RUN}`;

  await signIn(page, GROWER_APP, USERS.growerIn1, '/cases/new');
  await expect(page.getByRole('heading', { name: 'Raise a case' })).toBeVisible();
  await page.getByLabel('What do you need?').selectOption('PRODUCT_COMPLAINT');
  await page.getByLabel('Product', { exact: true }).fill('Azoxa');
  await page.getByRole('list', { name: 'Matching products' }).getByRole('button', { name: /Azoxa Duo 325 SC/ }).click();
  await expect(page.getByText('Product: Azoxa Duo 325 SC')).toBeVisible();
  await page.getByLabel('Batch number (on the pack)').fill('AZX2604-117');
  await expect(page.getByText('Batch found.')).toBeVisible();
  await page.getByLabel('Short title').fill(title);
  await page.getByLabel('What happened?').fill('Yellow spots on the leaves a week after spraying (Playwright).');
  await page.getByLabel(/Photos or PDFs/).setInputFiles({ name: 'leaves.jpg', mimeType: 'image/jpeg', buffer: await photo(page) });
  await expect(page.getByText('1 file chosen')).toBeVisible();
  await expectAccessible(page, 'J4 raise a case');
  await page.getByRole('button', { name: 'Send' }).click();

  // listed, with the case number in the confirmation
  const raised = page.getByRole('status').filter({ hasText: 'raised' });
  await expect(raised).toContainText(/Case \d{2}-\d{4}-\d{2}-\d{6}-\d raised/);
  await expect(raised).not.toContainText('could not be uploaded');           // FE-R112: the photo reached the object store
  await expectAccessible(page, 'J4 my cases');
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // the photo is scanned (PENDING → CLEAN) within 60 s, then downloads from the object store
  const download = page.getByRole('button', { name: 'Download Photo' });
  await expect(download).toBeVisible({ timeout: 60_000 });
  await expectAccessible(page, 'J4 case detail');
  // the app asks case-service for a short-lived download URL and opens it (the object store serves it as an attachment)
  const [answer] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/attachments/`) && r.url().endsWith('/download')),
    download.click(),
  ]);
  expect(answer.status()).toBe(200);
  const { url } = (await answer.json()) as { url: string };
  expect(url).toMatch(/^http:\/\/localhost:8333\/gc-media-clean\//);
  const fetched = await context.request.get(url);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()['content-type']).toContain('image/jpeg');
});
