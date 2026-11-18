import { server } from '@gc/test-utils';
import { testSession } from '@gc/test-utils/setup';
import { useLanguage } from '@gc/i18n';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ApiError, iamFetch } from './fetcher';
import { me } from './generated/iam';
import { get as getCase } from './generated/case';

const problem = (status: number, body: object, headers: Record<string, string> = {}) =>
  HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json', ...headers } });

describe('SPEC-FE-01 the API client', () => {
  it('FE-E6 every request goes through the gateway prefix with token, a UUID request id and the language', async () => {
    useLanguage.setState({ language: 'mr' });
    let seen: Request | undefined;
    server.use(http.get('http://localhost/api/iam/me', ({ request }) => {
      seen = request;
      return HttpResponse.json({ userId: '101', userType: 'STAFF' });
    }));
    const response = await me();
    expect(response.status).toBe(200);
    expect(response.data.userId).toBe('101');
    expect(seen?.headers.get('Authorization')).toBe('Bearer test-token');
    expect(seen?.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen?.headers.get('Accept-Language')).toBe('mr');
  });

  it('FE-E6 no token, no Authorization header', async () => {
    testSession.token = null;
    let auth: string | null = 'x';
    server.use(http.get('http://localhost/api/iam/me', ({ request }) => { auth = request.headers.get('Authorization'); return HttpResponse.json({}); }));
    await me();
    expect(auth).toBeNull();
  });

  it.each([
    ['FE-E5 401 asks for a new sign-in', 401, { code: 'UNAUTHENTICATED' }, {}, 1],
    ['FE-E5 403', 403, { code: 'PERMISSION_DENIED', detail: 'no' }, {}, 0],
    ['FE-E5 404', 404, { code: 'NOT_FOUND' }, {}, 0],
    ['FE-E5 412', 412, { code: 'STALE_VERSION' }, {}, 0],
    ['FE-E5 422 with the rule detail', 422, { code: 'BUSINESS_RULE_VIOLATION', detail: 'A closed case cannot change' }, {}, 0],
    ['FE-E5 429 with Retry-After', 429, { code: 'RATE_LIMITED' }, { 'Retry-After': '30' }, 0],
    ['FE-E5 503', 503, { code: 'DEPENDENCY_UNAVAILABLE' }, {}, 0],
  ])('%s', async (_name, status, body, headers, unauthorized) => {
    server.use(http.get('http://localhost/api/iam/me', () => problem(status, body, headers)));
    const error = await me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect(api.status).toBe(status);
    expect(api.code).toBe(body.code);
    expect(api.detail).toBe((body as { detail?: string }).detail);
    expect(api.retryAfterSeconds).toBe(headers['Retry-After' as keyof typeof headers] ? 30 : undefined);
    expect(api.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(testSession.unauthorized).toBe(unauthorized);
  });

  it('FE-E5 a field error list and a non-JSON error page', async () => {
    server.use(http.get('http://localhost/api/iam/me', () => problem(400, { code: 'VALIDATION_FAILED', errors: [{ field: 'phone', message: 'invalid' }] })));
    expect(((await me().catch((e: unknown) => e)) as ApiError).errors).toEqual([{ field: 'phone', message: 'invalid' }]);
    server.use(http.get('http://localhost/api/iam/me', () => new HttpResponse('<html>bad gateway</html>', { status: 502 })));
    const error = (await me().catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
  });

  it('FE-E5 no answer at all is status 0 (network)', async () => {
    server.use(http.get('http://localhost/api/iam/me', () => HttpResponse.error()));
    const error = (await me().catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK');
  });

  it('FE-E10 a 19-digit id travels as the exact string, in the path and in the body', async () => {
    const id = '116446854583812124';
    let path = '';
    server.use(http.get('http://localhost/api/cases/cases/:caseId', ({ params }) => {
      path = String(params.caseId);
      return new HttpResponse(`{"caseId":"${id}","version":3}`, { headers: { 'Content-Type': 'application/json', ETag: '"3"' } });
    }));
    const response = await getCase(id);
    expect(path).toBe(id);
    expect(response.data.caseId).toBe(id);
    expect(response.headers.get('ETag')).toBe('"3"');
  });

  it('an empty 204 answer has no data', async () => {
    server.use(http.get('http://localhost/api/iam/x', () => new HttpResponse(null, { status: 204 })));
    const response = await iamFetch<{ data: unknown; status: number }>('/x');
    expect(response.status).toBe(204);
    expect(response.data).toBeUndefined();
  });
});
