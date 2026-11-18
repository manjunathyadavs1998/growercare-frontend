import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const G = '110165911145454593';
const types = [
  { caseType: 'AGRONOMY_ADVICE', defaultSlaHours: 72, statuses: [{ status: 'SUBMITTED', initial: true, closed: false, order: 1 }] },
  { caseType: 'PRODUCT_COMPLAINT', defaultSlaHours: 48, statuses: [{ status: 'SUBMITTED', initial: true, closed: false, order: 1 }] },
];

/** Everything raising a case touches, recorded. */
function raiseServer(options: { putStatus?: number; createFailures?: number } = {}) {
  const seen = { created: [] as { body: Record<string, unknown>; key: string | null }[], uploads: 0, completed: 0 };
  let failures = options.createFailures ?? 0;
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })),
    http.get(`${API}/grower/growers/me`, () => HttpResponse.json({ growerId: G, status: 'ACTIVE', countryCode: 'IN' })),
    http.get(`${API}/cases/case-types`, () => HttpResponse.json(types)),
    http.get(`${API}/grower/growers/:id/farms`, () => HttpResponse.json({ items: [
      { farmId: '80011', name: 'Patil grape block A', status: 'ACTIVE' }, { farmId: '80015', name: 'Old plot', status: 'ARCHIVED' }] })),
    http.get(`${API}/catalog/products`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({ items: 'amplify'.startsWith(q.toLowerCase()) ? [{ productId: '9001', productCode: 'AMX-250SC', name: 'Amplify 250 SC' }] : [] });
    }),
    http.get(`${API}/catalog/products/:id/batches/:batch`, ({ params }) => (params.batch === 'AZX2604-117'
      ? HttpResponse.json({ batchNo: 'AZX2604-117', productId: '9001' }) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }))),
    http.post(`${API}/cases/cases`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      seen.created.push({ body, key: request.headers.get('Idempotency-Key') });
      if (failures > 0) { failures -= 1; return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 }); }
      return HttpResponse.json({ caseId: '116446854583812124', caseNo: '71-2611-000042-7', status: 'SUBMITTED' }, { status: 201 });
    }),
    http.post(`${API}/cases/cases/:id/attachments`, () => HttpResponse.json({ attachmentId: '501',
      upload: { method: 'PUT', url: 'http://storage.local/case-staging/501', headers: {} } }, { status: 201 })),
    http.put('http://storage.local/case-staging/501', () => { seen.uploads += 1; return new HttpResponse(null, { status: options.putStatus ?? 200 }); }),
    http.post(`${API}/cases/cases/:id/attachments/:att/complete`, () => { seen.completed += 1; return HttpResponse.json({ status: 'PENDING' }); }),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [] })),
  );
  return seen;
}

async function fillCommon(type: string) {
  await userEvent.selectOptions(await screen.findByLabelText('What do you need?'), await screen.findByRole('option', { name: type }));
  await userEvent.type(screen.getByLabelText('Short title'), 'Leaves yellowing after spray');
  await userEvent.type(screen.getByLabelText('What happened?'), 'Brown spots three days after spraying.');
}

async function chooseProductAndBatch(batch: string) {
  await userEvent.type(screen.getByLabelText('Product'), 'amp');
  await userEvent.click(await screen.findByRole('button', { name: /Amplify 250 SC/ }));
  await userEvent.type(screen.getByLabelText('Batch number (on the pack)'), batch);
}

describe('SPEC-FE-02 R106 raise a case (PRD J4)', () => {
  it('FE-E106 a complaint about 9001 / AZX2604-117 with a PDF: case created, file uploaded, back on My cases', async () => {
    const seen = raiseServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/cases/new' });
    await fillCommon('Product complaint');
    await userEvent.selectOptions(screen.getByLabelText('Farm'), 'Patil grape block A');
    expect(screen.queryByRole('option', { name: 'Old plot' })).not.toBeInTheDocument();     // archived farms are not offered
    await chooseProductAndBatch('azx2604-117');
    expect(await screen.findByText('Batch found.')).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Photos or PDFs (up to 5)'), new File(['%PDF-1.7'], 'invoice.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('1 file chosen')).toBeInTheDocument();
    await expectAccessible(container);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Case 71-2611-000042-7 raised. We will keep you informed.')).toBeInTheDocument();
    expect(seen.created[0]?.body).toEqual({
      growerId: G, caseType: 'PRODUCT_COMPLAINT', title: 'Leaves yellowing after spray', description: 'Brown spots three days after spraying.',
      farmId: '80011', productId: '9001', batchNo: 'AZX2604-117',
    });
    expect(seen.uploads).toBe(1);
    expect(seen.completed).toBe(1);
  });

  it('FE-E106 without a product the grower says what it is about (D6)', async () => {
    const seen = raiseServer();
    renderRoutes(routes, { catalogs: [messages], route: '/cases/new' });
    await fillCommon('Crop advice');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('If there is no product: what is it about?'), 'Seeds');
    await userEvent.click(send);
    await screen.findByText(/raised/);
    expect(seen.created[0]?.body).toMatchObject({ caseType: 'AGRONOMY_ADVICE', buCode: 'SEEDS' });
    expect(seen.created[0]?.body).not.toHaveProperty('productId');
  });

  it('FE-E106 an unknown batch is said so and cannot be sent', async () => {
    raiseServer();
    renderRoutes(routes, { catalogs: [messages], route: '/cases/new' });
    await fillCommon('Product complaint');
    await chooseProductAndBatch('ZZZ9999-000');
    expect(await screen.findByText(/We do not know this batch/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('FE-E106 a failed upload keeps the case and says so', async () => {
    raiseServer({ putStatus: 500 });
    renderRoutes(routes, { catalogs: [messages], route: '/cases/new' });
    await fillCommon('Crop advice');
    await userEvent.selectOptions(screen.getByLabelText('If there is no product: what is it about?'), 'Crop protection');
    await userEvent.upload(screen.getByLabelText('Photos or PDFs (up to 5)'), new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('1 file could not be uploaded. You can add them from the case.')).toBeInTheDocument();
  });

  it('FE-E6 a retried send reuses the Idempotency-Key, so the case is created once', async () => {
    const seen = raiseServer({ createFailures: 1 });
    renderRoutes(routes, { catalogs: [messages], route: '/cases/new' });
    await fillCommon('Crop advice');
    await userEvent.selectOptions(screen.getByLabelText('If there is no product: what is it about?'), 'Crop protection');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/can't reach the service/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/raised/);
    await waitFor(() => expect(seen.created).toHaveLength(2));
    expect(seen.created[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen.created[1]?.key).toBe(seen.created[0]?.key);
  });

  it('My cases offers "Raise a case"', async () => {
    raiseServer();
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('link', { name: 'Raise a case' }));
    expect(await screen.findByRole('heading', { name: 'Raise a case' })).toBeInTheDocument();
  });
});
