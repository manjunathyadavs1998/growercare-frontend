import { expectAccessible, renderRoutes, server } from '@gc/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { messages } from '../../../messages';
import { routes } from '../../../routes';

const API = 'http://localhost/api';
const account = { userId: '9', userType: 'GROWER', homeCountry: 'IN', grants: [] };
const pending = { growerId: '110165911145454593', status: 'PENDING_CONSENT', countryCode: 'IN', phoneLast4: '3210', version: 0 };
const territories = [
  { territoryId: '1001', level: 'STATE', name: 'Maharashtra' },
  { territoryId: '1002', level: 'DISTRICT', name: 'Pune', parentTerritoryId: '1001' },
  { territoryId: '1003', level: 'DISTRICT', name: 'Nashik', parentTerritoryId: '1001' },
];
const notices = (language: string) => [
  { purpose: 'SERVICE', version: 'in-2026-11', title: language === 'mr' ? 'सेवा' : 'Service', body: 'We use your details to handle your cases.' },
  { purpose: 'MARKETING', version: 'in-2026-11', title: language === 'mr' ? 'विपणन' : 'Marketing', body: 'Offers and news.' },
];

/** The server side of onboarding as a little state machine the handlers share. */
function onboardingServer(start: { account: boolean; grower: 'none' | 'pending' | 'active' }) {
  const state = { ...start, seen: { selfRegistration: [] as unknown[], register: [] as { body: unknown; key: string | null }[], noticeLanguage: '', confirm: [] as unknown[] } };
  server.use(
    http.get(`${API}/iam/me`, () => (state.account ? HttpResponse.json(account) : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }))),
    http.post(`${API}/iam/self-registration`, async ({ request }) => {
      state.seen.selfRegistration.push(await request.json());
      state.account = true;
      return HttpResponse.json(account, { status: 201 });
    }),
    http.get(`${API}/iam/reference/territories`, () => HttpResponse.json(territories)),
    http.get(`${API}/grower/growers/me`, () => {
      if (state.grower === 'none') return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
      return HttpResponse.json({ ...pending, status: state.grower === 'active' ? 'ACTIVE' : 'PENDING_CONSENT' });
    }),
    http.post(`${API}/grower/growers`, async ({ request }) => {
      state.seen.register.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
      state.grower = 'pending';
      return HttpResponse.json(pending, { status: 201 });
    }),
    http.get(`${API}/grower/consent-notices`, ({ request }) => {
      state.seen.noticeLanguage = new URL(request.url).searchParams.get('language') ?? '';
      return HttpResponse.json({ items: notices(state.seen.noticeLanguage) });
    }),
    http.post(`${API}/grower/growers/:id/verifications`, () =>
      HttpResponse.json({ verificationId: '77', expiresAt: '2026-11-18T10:05:00Z', phoneLast4: '3210', purpose: 'ACTIVATION' }, { status: 202 })),
    http.post(`${API}/grower/growers/:id/verifications/:vid/confirm`, async ({ request }) => {
      const body = (await request.json()) as { code: string };
      state.seen.confirm.push(body);
      if (body.code === '000000') return HttpResponse.json({ code: 'BUSINESS_RULE_VIOLATION', rule: 'grower.otp-invalid', attemptsLeft: 2 }, { status: 422 });
      if (body.code === '111111') return HttpResponse.json({ code: 'BUSINESS_RULE_VIOLATION', rule: 'grower.otp-locked' }, { status: 422 });
      state.grower = 'active';
      return HttpResponse.json({ ...pending, status: 'ACTIVE' });
    }),
    http.get(`${API}/cases/cases`, () => HttpResponse.json({ items: [] })),
  );
  return state;
}

describe('SPEC-FE-02 onboarding (PRD J1, J2)', () => {
  it('FE-E100 a new phone user creates the account, then sees the registration form', async () => {
    const state = onboardingServer({ account: false, grower: 'none' });
    const { container } = renderRoutes(routes, { catalogs: [messages] });
    await screen.findByRole('heading', { name: 'Create your account' });
    await expectAccessible(container);
    await userEvent.type(screen.getByLabelText('Your name'), '  Ramesh Patil ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Your details' })).toBeInTheDocument();
    expect(state.seen.selfRegistration).toEqual([{ countryCode: 'IN', displayName: 'Ramesh Patil' }]);
  });

  it('FE-E101 the grower registers with the phone they signed up with, a district and Marathi', async () => {
    const state = onboardingServer({ account: true, grower: 'none' });
    const { container } = renderRoutes(routes, { catalogs: [messages] });
    await screen.findByRole('heading', { name: 'Your details' });
    expect(screen.getByLabelText('Mobile number')).toHaveValue('+919876543210');
    await userEvent.type(screen.getByLabelText('Your name'), 'Ramesh Patil');
    await userEvent.selectOptions(await screen.findByLabelText('District'), 'Pune');
    await userEvent.selectOptions(screen.getByLabelText('Language for messages'), 'mr');
    await expectAccessible(container);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Before we start' })).toBeInTheDocument();
    expect(state.seen.register).toHaveLength(1);
    expect(state.seen.register[0]?.body).toEqual({ displayName: 'Ramesh Patil', phone: '+919876543210', preferredLanguage: 'mr', territoryId: '1002' });
    expect(state.seen.register[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('FE-E102 the consent screen shows the notice texts in the UI language; SERVICE is required, the rest optional', async () => {
    const state = onboardingServer({ account: true, grower: 'pending' });
    const { container } = renderRoutes(routes, { catalogs: [messages], language: 'mr' });
    expect(await screen.findByRole('heading', { name: 'सेवा' })).toBeInTheDocument();
    expect(state.seen.noticeLanguage).toBe('mr');
    expect(screen.getByText('ग्रोअरकेअर वापरण्यासाठी आवश्यक.')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);           // MARKETING only; SERVICE cannot be refused
    await expectAccessible(container);
  });

  it('FE-E103 wrong code shows the attempts left; the right code activates the grower and opens My cases', async () => {
    const state = onboardingServer({ account: true, grower: 'pending' });
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I agree: Marketing' }));
    await userEvent.click(screen.getByRole('button', { name: /Agree and send a code/ }));
    const code = await screen.findByLabelText('Code');
    await userEvent.type(code, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('That code is not right. 2 attempts left.')).toBeInTheDocument();
    await userEvent.clear(code);
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('heading', { name: 'My cases' })).toBeInTheDocument();
    expect(state.seen.confirm[1]).toEqual({
      code: '123456', language: 'en', noticeVersion: 'in-2026-11',
      consents: [{ purpose: 'SERVICE', granted: true }, { purpose: 'MARKETING', granted: true }],
    });
  });

  it('FE-E103 a locked code can no longer be confirmed; a new code can be sent', async () => {
    onboardingServer({ account: true, grower: 'pending' });
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('button', { name: /Agree and send a code/ }));
    await userEvent.type(await screen.findByLabelText('Code'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Too many wrong codes. Send a new code.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveValue(''));
  });

  it('FE-E103 the code field takes digits only', async () => {
    onboardingServer({ account: true, grower: 'pending' });
    renderRoutes(routes, { catalogs: [messages] });
    await userEvent.click(await screen.findByRole('button', { name: /Agree and send a code/ }));
    const code = await screen.findByLabelText('Code');
    await userEvent.type(code, '12a3-4');
    expect(code).toHaveValue('1234');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
