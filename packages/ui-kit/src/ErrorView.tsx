import { ApiError } from '@gc/api-client';
import { FormattedMessage } from 'react-intl';
import { Button } from './Button';

/** SPEC-FE-01 R5: which message an error shows (exported for the tests and for inline form errors). */
export function errorKind(error: unknown):
  | 'signIn' | 'forbidden' | 'notFound' | 'conflict' | 'rule' | 'invalid' | 'tooMany' | 'unavailable' | 'unexpected' {
  if (!(error instanceof ApiError)) return 'unexpected';
  switch (error.status) {
    case 401: return 'signIn';
    case 403: return 'forbidden';
    case 404: return 'notFound';
    case 409:
    case 412: return 'conflict';
    case 422: return 'rule';
    case 400: return 'invalid';
    case 429: return 'tooMany';
    case 0:
    case 502:
    case 503:
    case 504: return 'unavailable';
    default: return 'unexpected';
  }
}

/** One error, explained without blanking the page; 404 is the same page for "missing" and "not yours". */
export function ErrorView({ error, onRetry, onReload }: { error: unknown; onRetry?: () => void; onReload?: () => void }) {
  const kind = errorKind(error);
  if (kind === 'notFound') return <NotFoundPage />;
  const api = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <p className="font-medium">
        <FormattedMessage id={`error.${kind}`} values={{ seconds: api?.retryAfterSeconds ?? 30 }} />
      </p>
      {(kind === 'rule' || kind === 'invalid') && api?.detail ? <p className="mt-1 text-sm">{api.detail}</p> : null}
      {kind === 'invalid' && api?.errors.length ? (
        <ul className="mt-1 list-disc ps-5 text-sm">
          {api.errors.map((e) => <li key={e.field}>{e.field}: {e.message}</li>)}
        </ul>
      ) : null}
      {kind === 'conflict' && onReload ? <Button className="mt-3" onClick={onReload}><FormattedMessage id="action.reload" /></Button> : null}
      {(kind === 'unavailable' || kind === 'unexpected') && onRetry ? (
        <Button className="mt-3" onClick={onRetry}><FormattedMessage id="action.retry" /></Button>
      ) : null}
      {api ? <p className="mt-2 text-xs text-amber-700"><FormattedMessage id="error.reference" values={{ id: api.requestId }} /></p> : null}
    </div>
  );
}

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-xl font-semibold"><FormattedMessage id="notFound.title" /></h1>
      <p className="mt-2 text-slate-600"><FormattedMessage id="notFound.body" /></p>
      <a className="mt-4 inline-block text-emerald-700 underline" href="/"><FormattedMessage id="action.home" /></a>
    </section>
  );
}
