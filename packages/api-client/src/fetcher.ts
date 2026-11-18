/**
 * SPEC-FE-01 D5 / R5 / R6: the one place the apps talk HTTP. Every request goes to the gateway prefix of its service,
 * carries the access token, a fresh X-Request-Id and the UI language; a non-2xx answer becomes an {@link ApiError}
 * built from the Problem Details body. Generated hooks call the per-service fetchers below.
 */

/** One field error of a 400 Problem Details body. */
export interface FieldError {
  field: string;
  message: string;
}

/** A non-2xx answer (or no answer at all: status 0) as the UI handles it (SPEC-FE-01 R5). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly detail: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly errors: FieldError[];
  readonly requestId: string;

  constructor(init: { status: number; code?: string; detail?: string; retryAfterSeconds?: number; errors?: FieldError[]; requestId: string }) {
    super(init.detail ?? `HTTP ${init.status}`);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId;
  }
}

export interface ApiSettings {
  /** Gateway base, e.g. "/api" (dev proxy) or "https://api.example/api". */
  apiBase: string;
  /** The current access token, or null when signed out. */
  getAccessToken: () => string | null | Promise<string | null>;
  /** The UI language (Accept-Language). */
  getLanguage: () => string;
  /** Called on a 401: the session is gone, sign in again (SPEC-FE-01 R5). */
  onUnauthorized: () => void;
}

let settings: ApiSettings | null = null;

export function configureApi(next: ApiSettings): void {
  settings = next;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

function retryAfter(headers: Headers): number | undefined {
  const value = headers.get('Retry-After');
  if (value === null) return undefined;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function problem(response: Response, requestId: string): Promise<ApiError> {
  let body: { code?: string; detail?: string; errors?: FieldError[] } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // not JSON (a proxy page, an empty body): the status alone decides
  }
  return new ApiError({
    status: response.status,
    code: body.code,
    detail: body.detail,
    errors: body.errors,
    retryAfterSeconds: retryAfter(response.headers),
    requestId,
  });
}

/** A fetcher bound to one service's gateway prefix (generated code passes the path and the request options). */
export function createFetcher(prefix: string) {
  return async <T>(url: string, options: RequestInit = {}): Promise<T> => {
    if (settings === null) throw new Error('configureApi() was not called');
    const requestId = newRequestId();
    const headers = new Headers(options.headers);
    headers.set('X-Request-Id', requestId);
    headers.set('Accept-Language', settings.getLanguage());
    const token = await settings.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(`${settings.apiBase}${prefix}${url}`, { ...options, headers });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError({ status: 0, code: 'NETWORK', requestId });
    }
    if (!response.ok) {
      if (response.status === 401) settings.onUnauthorized();
      throw await problem(response, requestId);
    }
    const text = response.status === 204 ? '' : await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    return { data, status: response.status, headers: response.headers } as T;
  };
}

// orval recognises a mutator only when it is declared as a function, hence the explicit wrappers.
const iam = createFetcher('/iam');
const caseService = createFetcher('/cases');
const growerService = createFetcher('/grower');
const catalogService = createFetcher('/catalog');

export const iamFetch = <T>(url: string, options?: RequestInit): Promise<T> => iam<T>(url, options);
export const caseFetch = <T>(url: string, options?: RequestInit): Promise<T> => caseService<T>(url, options);
export const growerFetch = <T>(url: string, options?: RequestInit): Promise<T> => growerService<T>(url, options);
export const catalogFetch = <T>(url: string, options?: RequestInit): Promise<T> => catalogService<T>(url, options);
