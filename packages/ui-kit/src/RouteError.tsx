import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ErrorView, NotFoundPage } from './ErrorView';

/** Route-level error boundary (SPEC-FE-01 D6): an unknown route or a failing screen never blanks the app. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return <ErrorView error={error} onRetry={() => window.location.reload()} />;
}
