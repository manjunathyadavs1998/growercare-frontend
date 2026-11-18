import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../messages';
import { routes } from '../routes';

const ME = 'http://localhost/api/iam/me';
const careIn = { userId: '101', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'CARE_AGENT', permissions: ['case:read', 'case:assign'] }] };
const agroIn = { userId: '102', userType: 'STAFF', homeCountry: 'IN', grants: [{ roleCode: 'FIELD_AGRONOMIST', permissions: ['case:read', 'case:transition'] }] };

describe('SPEC-FE-01 staff-console shell', () => {
  it('FE-E7 care.in: roles shown and the assign hint (case:assign)', async () => {
    server.use(http.get(ME, () => HttpResponse.json(careIn)));
    const { container } = renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText('Your roles: CARE_AGENT')).toBeInTheDocument();
    expect(screen.getByText('You can assign cases.')).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('FE-E7 agro.in has no case:assign: no assign hint', async () => {
    server.use(http.get(ME, () => HttpResponse.json(agroIn)));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText('Your roles: FIELD_AGRONOMIST')).toBeInTheDocument();
    expect(screen.queryByText('You can assign cases.')).not.toBeInTheDocument();
  });

  it('SPEC-FE-03 E209 a grower is told the console is for staff and partners', async () => {
    server.use(http.get(ME, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('heading', { name: 'This console is for staff and partners' })).toBeInTheDocument();
    expect(screen.queryByText(/Your roles/)).not.toBeInTheDocument();
  });

  it('a sign-in without a GrowerCare account is told to ask an administrator', async () => {
    server.use(http.get(ME, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ask your administrator');
  });

  it('FE-E5 IAM down: retry offered', async () => {
    server.use(http.get(ME, () => HttpResponse.json({}, { status: 504 })));
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
