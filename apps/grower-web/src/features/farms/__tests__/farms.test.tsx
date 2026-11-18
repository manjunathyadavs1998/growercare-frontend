import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const G = '110165911145454593';
const grapes = { farmId: '80011', growerId: G, name: 'Patil grape block A', areaHa: 2.5, crops: ['GRAPE'], status: 'ACTIVE', version: 3 };

/** The grower's farms on the server: the handlers share and change this list. */
function farmServer(initial = [grapes]) {
  const farms = initial.map((f) => ({ ...f }));
  const seen = { created: [] as { body: unknown; key: string | null }[], patched: [] as { body: unknown; ifMatch: string | null }[], archived: [] as string[] };
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })),
    http.get(`${API}/grower/growers/me`, () => HttpResponse.json({ growerId: G, status: 'ACTIVE' })),
    http.get(`${API}/grower/growers/:id/farms`, () => HttpResponse.json({ items: farms })),
    http.post(`${API}/grower/growers/:id/farms`, async ({ request }) => {
      const body = (await request.json()) as { name: string; areaHa: number; crops: string[] };
      seen.created.push({ body, key: request.headers.get('Idempotency-Key') });
      farms.push({ ...body, farmId: '80099', growerId: G, status: 'ACTIVE', version: 0 });
      return HttpResponse.json(farms.at(-1), { status: 201 });
    }),
    http.patch(`${API}/grower/growers/:id/farms/:farmId`, async ({ request, params }) => {
      const ifMatch = request.headers.get('If-Match');
      const body = (await request.json()) as Partial<typeof grapes>;
      seen.patched.push({ body, ifMatch });
      const farm = farms.find((f) => f.farmId === params.farmId)!;
      if (ifMatch !== `"${farm.version}"`) return HttpResponse.json({ code: 'STALE_VERSION' }, { status: 412 });
      Object.assign(farm, body, { version: farm.version + 1 });
      return HttpResponse.json(farm);
    }),
    http.post(`${API}/grower/growers/:id/farms/:farmId/archive`, ({ params }) => {
      seen.archived.push(String(params.farmId));
      const farm = farms.find((f) => f.farmId === params.farmId)!;
      farm.status = 'ARCHIVED';
      return HttpResponse.json(farm);
    }),
  );
  return { farms, seen };
}

describe('SPEC-FE-02 R105 farms (PRD J3)', () => {
  it('FE-E105 the grower adds "Plot 2", 1.5 ha of cotton', async () => {
    const { seen } = farmServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/farms' });
    expect(await screen.findByText('Patil grape block A')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a farm' }));
    await userEvent.type(screen.getByLabelText('Farm name'), 'Plot 2');
    await userEvent.type(screen.getByLabelText('Area (hectares)'), '1,5');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cotton' }));
    await expectAccessible(container);
    await userEvent.click(screen.getByRole('button', { name: 'Save farm' }));
    expect(await screen.findByText('Plot 2')).toBeInTheDocument();
    expect(seen.created[0]?.body).toEqual({ name: 'Plot 2', areaHa: 1.5, crops: ['COTTON'] });
    expect(seen.created[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('FE-E105 a farm needs a name, an area above 0 and 1 to 5 crops', async () => {
    farmServer([]);
    renderRoutes(routes, { catalogs: [messages], route: '/farms' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add a farm' }));
    const save = screen.getByRole('button', { name: 'Save farm' });
    await userEvent.type(screen.getByLabelText('Farm name'), 'Plot 3');
    await userEvent.type(screen.getByLabelText('Area (hectares)'), '0');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Wheat' }));
    expect(save).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Area (hectares)'));
    await userEvent.type(screen.getByLabelText('Area (hectares)'), '2');
    expect(save).toBeEnabled();
    for (const crop of ['Grape', 'Onion', 'Soybean', 'Maize']) await userEvent.click(screen.getByRole('checkbox', { name: crop }));
    expect(screen.getByRole('checkbox', { name: 'Tomato' })).toBeDisabled();          // five chosen
  });

  it('FE-E105 editing sends a merge patch with the farm\'s version', async () => {
    const { seen } = farmServer();
    renderRoutes(routes, { catalogs: [messages], route: '/farms' });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Patil grape block A' }));
    const name = screen.getByLabelText('Farm name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Grape block A');
    await userEvent.click(screen.getByRole('button', { name: 'Save farm' }));
    expect(await screen.findByText('Grape block A')).toBeInTheDocument();
    expect(seen.patched[0]).toEqual({ body: { name: 'Grape block A', areaHa: 2.5, crops: ['GRAPE'] }, ifMatch: '"3"' });
  });

  it('FE-E105 an edit on a farm changed elsewhere is refused (412) and offers a reload', async () => {
    const { farms } = farmServer();
    renderRoutes(routes, { catalogs: [messages], route: '/farms' });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Patil grape block A' }));
    farms[0]!.version = 4;                                                               // changed on another device
    await userEvent.click(screen.getByRole('button', { name: 'Save farm' }));
    expect(await screen.findByText(/Someone else changed this/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
  });

  it('FE-E105 archiving asks first, then the farm is gone', async () => {
    const { seen } = farmServer();
    renderRoutes(routes, { catalogs: [messages], route: '/farms' });
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Patil grape block A' }));
    const confirm = screen.getByRole('group');
    expect(within(confirm).getByText(/no longer be offered/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Yes, archive' }));
    expect(await screen.findByText('No farms yet. Add the plots you farm.')).toBeInTheDocument();
    expect(seen.archived).toEqual(['80011']);
  });

  it('FE-E105 in Marathi, crops included', async () => {
    farmServer();
    renderRoutes(routes, { catalogs: [messages], route: '/farms', language: 'mr' });
    expect(await screen.findByRole('heading', { name: 'माझी शेते' })).toBeInTheDocument();
    expect(await screen.findByText(/द्राक्ष/)).toBeInTheDocument();
  });
});
