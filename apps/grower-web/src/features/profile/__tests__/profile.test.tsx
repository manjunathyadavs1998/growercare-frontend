import { useLanguage } from '@gc/i18n';
import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';

function profileServer(serverVersion = 2) {
  const grower = { growerId: '7', status: 'ACTIVE', displayName: 'Ramesh Patil', phoneLast4: '3210', preferredLanguage: 'en', version: 2 };
  const patches: { body: unknown; ifMatch: string | null; type: string | null }[] = [];
  server.use(
    http.get(`${API}/iam/me`, () => HttpResponse.json({ userId: '1', userType: 'GROWER', grants: [] })),
    http.get(`${API}/grower/growers/me`, () => HttpResponse.json(grower)),
    http.patch(`${API}/grower/growers/:id`, async ({ request }) => {
      const ifMatch = request.headers.get('If-Match');
      patches.push({ body: await request.json(), ifMatch, type: request.headers.get('Content-Type') });
      if (ifMatch !== `"${serverVersion}"`) return HttpResponse.json({ code: 'STALE_VERSION' }, { status: 412 });
      Object.assign(grower, { preferredLanguage: 'hi', version: serverVersion + 1 });
      return HttpResponse.json(grower, { headers: { ETag: `"${serverVersion + 1}"` } });
    }),
  );
  return patches;
}

describe('SPEC-FE-02 R109 profile', () => {
  it('FE-E109 switching to Hindi saves the grower (If-Match) and the app follows', async () => {
    const patches = profileServer();
    const { container } = renderRoutes(routes, { catalogs: [messages], route: '/profile' });
    expect(await screen.findByText('Ramesh Patil')).toBeInTheDocument();
    expect(screen.getByText('…3210')).toBeInTheDocument();                                // never the full number
    await expectAccessible(container);
    await userEvent.selectOptions(screen.getByLabelText('Language for messages'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('सहेजा गया। संदेश इसी भाषा में आएँगे।')).toBeInTheDocument();
    expect(useLanguage.getState().language).toBe('hi');
    expect(patches).toEqual([{ body: { preferredLanguage: 'hi' }, ifMatch: '"2"', type: 'application/merge-patch+json' }]);
  });

  it('FE-E109 changed on another device (412): told so, offered a reload', async () => {
    profileServer(5);
    renderRoutes(routes, { catalogs: [messages], route: '/profile' });
    await userEvent.selectOptions(await screen.findByLabelText('Language for messages'), 'mr');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Someone else changed this/)).toBeInTheDocument();
    expect(useLanguage.getState().language).toBe('en');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
  });

  it('nothing to save until the language changes', async () => {
    profileServer();
    renderRoutes(routes, { catalogs: [messages], route: '/profile' });
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
