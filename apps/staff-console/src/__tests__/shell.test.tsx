import { renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../messages';
import { routes } from '../routes';

const API = 'http://localhost/api';
const careIn = { userId: '101', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'CARE_AGENT', permissions: ['case:read', 'case:assign', 'grower:read'] }] };
const agroIn = { userId: '102', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'FIELD_AGRONOMIST', permissions: ['case:read', 'case:transition'] }] };

function reference(me: object) {
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json(me)),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/cases/case-types`, () => HttpResponse.json([])),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json([])),
  );
}

describe('SPEC-FE-03 D1 the console shell', () => {
  it('FE-E7 navigation follows the grants: care.in sees the queue and grower lookup', async () => {
    reference(careIn);
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('link', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grower lookup' })).toBeInTheDocument();
  });

  it('FE-E7 agro.in (no grower:read) has no grower lookup', async () => {
    reference(agroIn);
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('link', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Grower lookup' })).not.toBeInTheDocument();
  });

  it('FE-E209 a grower is told the console is for staff and partners', async () => {
    reference({ userId: '1', userType: 'GROWER', grants: [] });
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('heading', { name: 'This console is for staff and partners' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Queue' })).not.toBeInTheDocument();
  });

  it('a sign-in without a GrowerCare account is told to ask an administrator', async () => {
    server.use(http.get(`${API}/iam/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ask your administrator');
  });

  it('FE-E5 IAM down: retry offered', async () => {
    server.use(http.get(`${API}/iam/me`, () => HttpResponse.json({}, { status: 504 })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('an unknown route is the not-found page', async () => {
    reference(careIn);
    renderRoutes(routes, { catalogs: [messages], route: '/nope' });
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });
});
