import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const caseA = { caseId: '116446854583812124', caseNo: '71-2611-000001-4', title: 'Leaves yellowing after spray', status: 'TRIAGED', caseType: 'PRODUCT_COMPLAINT', createdAt: '2026-11-17T08:00:00Z' };
const caseB = { caseId: '116446854583812001', caseNo: '71-2611-000000-9', title: 'Seeds did not germinate', status: 'SUBMITTED', caseType: 'SEED_PERFORMANCE_CLAIM', createdAt: '2026-11-16T08:00:00Z' };

function active(pages: Record<string, { items: object[]; nextCursor?: string }>) {
  const cursors: (string | null)[] = [];
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })),
    http.get(`${API}/grower/growers/me`, () => HttpResponse.json({ growerId: '1', status: 'ACTIVE' })),
    http.get(`${API}/cases/cases`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      cursors.push(cursor);
      return HttpResponse.json(pages[cursor ?? 'first'] ?? { items: [] });
    }),
  );
  return cursors;
}

describe('SPEC-FE-02 R104 My cases', () => {
  it('FE-E104 the grower sees their cases with status and type in their language', async () => {
    active({ first: { items: [caseA, caseB] } });
    const { container } = renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText('Leaves yellowing after spray')).toBeInTheDocument();
    expect(screen.getByText('Being reviewed')).toBeInTheDocument();
    expect(screen.getByText(/Seed performance claim/)).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('FE-E104 in Hindi', async () => {
    active({ first: { items: [caseA] } });
    renderRoutes(routes, { catalogs: [messages], language: 'hi' });
    expect(await screen.findByText('समीक्षा में')).toBeInTheDocument();
  });

  it('FE-E104 no cases yet', async () => {
    active({ first: { items: [] } });
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByText('You have no cases yet.')).toBeInTheDocument();
  });

  it('FE-E104 more cases follow the cursor', async () => {
    const cursors = active({ first: { items: [caseA], nextCursor: 'c1' }, c1: { items: [caseB] } });
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Seeds did not germinate')).toBeInTheDocument();
    expect(cursors).toEqual([null, 'c1']);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('FE-E5 the list failing keeps the page and offers a retry', async () => {
    server.use(
      http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })),
      http.get(`${API}/grower/growers/me`, () => HttpResponse.json({ growerId: '1', status: 'ACTIVE' })),
      http.get(`${API}/cases/cases`, () => HttpResponse.json({}, { status: 503 })),
    );
    renderRoutes(routes, { catalogs: [messages] });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My cases' })).toBeInTheDocument();
  });
});
