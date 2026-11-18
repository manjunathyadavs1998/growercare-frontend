import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const careIn = { userId: '101', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'CARE_AGENT', permissions: ['case:read', 'grower:read'] }] };

function lookupServer(found: object[]) {
  const searches: unknown[] = [];
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(careIn)),
    http.post(`${API}/grower/growers/search`, async ({ request }) => {
      searches.push(await request.json());
      return HttpResponse.json({ items: found });
    }),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/cases/case-types`, () => HttpResponse.json([])),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json([])),
  );
  return searches;
}

describe('SPEC-FE-03 R201 grower lookup (J5)', () => {
  it('FE-E201 +91 98765 43210 finds Ramesh (masked) and opens his cases; the number goes in the body', async () => {
    const searches = lookupServer([{ growerId: '110165911145454593', displayName: 'R***** P****', phoneLast4: '3210', status: 'ACTIVE' }]);
    const { container, router } = renderRoutes(routes, { catalogs: [messages], route: '/growers' });
    await userEvent.type(await screen.findByLabelText('Mobile number'), '+91 98765 43210');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('R***** P****')).toBeInTheDocument();
    expect(screen.getByText(/…3210/)).toBeInTheDocument();
    expect(searches).toEqual([{ phone: '+919876543210', countryCode: 'IN' }]);
    await expectAccessible(container);
    await userEvent.click(screen.getByRole('link', { name: 'Cases of this grower' }));
    expect(router.state.location.search).toBe('?growerId=110165911145454593');
    expect(router.state.location.search).not.toContain('98765');
  });

  it('FE-E201 no grower with this number', async () => {
    lookupServer([]);
    renderRoutes(routes, { catalogs: [messages], route: '/growers' });
    await userEvent.type(await screen.findByLabelText('Mobile number'), '+919999999999');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText(/No grower with this number/)).toBeInTheDocument();
  });
});
