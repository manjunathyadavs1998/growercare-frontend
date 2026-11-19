import AxeBuilder from '@axe-core/playwright';
import { expect, request, type Page } from '@playwright/test';

/**
 * SPEC-FE-04 D4: the local stack, its seeded users and the helpers every journey uses. Addresses can be overridden
 * through the environment; the defaults are growercare-local-platform's.
 */
export const GROWER_APP = process.env.GROWER_APP ?? 'http://localhost:5173';
export const STAFF_APP = process.env.STAFF_APP ?? 'http://localhost:5174';
export const GATEWAY = process.env.GATEWAY ?? 'http://localhost:8080';
export const KEYCLOAK = process.env.KEYCLOAK ?? 'http://localhost:8180/realms/growercare';
export const MAILBOX = process.env.MAILBOX ?? 'http://localhost:8085/dev/mailbox';

/** The dev realm's users (growercare-local-platform keycloak/growercare-realm.json). */
export const USERS = {
  growerIn1: { username: 'grower.in1', password: 'Grower#Pass1', phone: '+919876543210', name: 'Ramesh Patil' },
  careIn: { username: 'care.in', password: 'Staff#Pass12' },
  agroIn: { username: 'agro.in', password: 'Staff#Pass12', name: 'Vikram Agro', email: 'agro.in@growercare.test' },
  tmIn: { username: 'tm.in', password: 'Staff#Pass12' },
  adminIn: { username: 'admin.in', password: 'Staff#Pass12' },
  careBr: { username: 'care.br', password: 'Staff#Pass12' },
  retailerIn: { username: 'retailer.in', password: 'Partner#Pass1' },
} as const;

export type User = { username: string; password: string };

/** D4 / §4: identifiers unique to this run, so a long-lived local stack never mixes runs. */
export const RUN = Date.now().toString(36).slice(-6);

/** A fresh Indian mobile number (+9199… with a random tail). */
export function freshPhone(): string {
  return `+9199${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

/** Opens an app and signs in on Keycloak's own form; returns once the app shell shows "Sign out". */
export async function signIn(page: Page, app: string, user: User, path = '/'): Promise<void> {
  await page.goto(app + path);
  await page.locator('#username').waitFor();
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
  await page.waitForURL((url) => url.origin === new URL(app).origin && !url.pathname.startsWith('/auth/callback'));
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** D5: axe on every screen a journey visits; serious and critical violations fail the journey. */
export async function expectAccessible(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join('; ')})`);
  expect(serious, `axe on ${screen}`).toEqual([]);
}

type MailItem = { template: string; language: string; body: string; channel: string };

/** PRD D2: messages are stored in the dev mailbox (local only), newest first. */
export async function mailbox(recipient: string): Promise<MailItem[]> {
  const api = await request.newContext();
  try {
    const response = await api.get(`${MAILBOX}?recipient=${encodeURIComponent(recipient)}`);
    expect(response.ok()).toBeTruthy();
    return ((await response.json()) as { items: MailItem[] }).items;
  } finally {
    await api.dispose();
  }
}

/** The newest 6-digit code sent to a phone (SPEC-NOT-01), waiting up to 30 s for it. */
export async function otpFor(phone: string): Promise<string> {
  let code = '';
  await expect.poll(async () => {
    const latest = (await mailbox(phone)).find((m) => m.template.startsWith('otp.'));
    code = latest?.body.match(/\b\d{6}\b/)?.[0] ?? '';
    return code;
  }, { timeout: 30_000, message: `a code for ${phone}` }).toMatch(/^\d{6}$/);
  return code;
}

/**
 * Test data through the API (never what a journey asserts): a password-grant token of the dev CLI client, and calls
 * through the edge gateway.
 */
export async function api(user: User) {
  const ctx = await request.newContext();
  const token = await ctx.post(`${KEYCLOAK}/protocol/openid-connect/token`, {
    form: { grant_type: 'password', client_id: 'gc-dev-cli', username: user.username, password: user.password },
  });
  expect(token.ok(), `token for ${user.username}`).toBeTruthy();
  const accessToken = ((await token.json()) as { access_token: string }).access_token;
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    async get(path: string) {
      return ctx.get(GATEWAY + path, { headers });
    },
    async post(path: string, data: unknown, extra: Record<string, string> = {}) {
      return ctx.post(GATEWAY + path, { headers: { ...headers, ...extra }, data });
    },
    async put(path: string, data: unknown, extra: Record<string, string> = {}) {
      return ctx.put(GATEWAY + path, { headers: { ...headers, ...extra }, data });
    },
    dispose: () => ctx.dispose(),
  };
}

/** A case of grower.in1 raised through the API (for journeys that start later in the case's life). */
export async function raiseCaseByApi(title: string, caseType = 'AGRONOMY_ADVICE'): Promise<{ caseId: string; caseNo: string }> {
  const grower = await api(USERS.growerIn1);
  try {
    const me = await grower.get('/api/grower/growers/me');
    const growerId = ((await me.json()) as { growerId: string }).growerId;
    const created = await grower.post('/api/cases/cases',
      { growerId, caseType, title, description: `${title} (Playwright ${RUN})`, buCode: 'CP' },
      { 'Idempotency-Key': crypto.randomUUID() });
    expect(created.status(), await created.text()).toBe(201);
    return (await created.json()) as { caseId: string; caseNo: string };
  } finally {
    await grower.dispose();
  }
}

/** Selects the option whose text contains {@code text} (option labels carry extra details such as roles). */
export async function selectOptionContaining(page: Page, label: string, text: string): Promise<void> {
  const select = page.getByLabel(label, { exact: true });
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  expect(value, `an option "${text}" in "${label}"`).toBeTruthy();
  await select.selectOption(value!);
}
