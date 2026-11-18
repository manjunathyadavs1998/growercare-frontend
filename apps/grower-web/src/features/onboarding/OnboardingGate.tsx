import { ApiError, grower, iam } from '@gc/api-client';
import { PolicyProvider } from '@gc/policy';
import { ErrorView, Spinner } from '@gc/ui-kit';
import { lazy, Suspense, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

// The steps are a separate chunk: an active grower never downloads them (FE-01 budget).
const AccountStep = lazy(() => import('./steps').then((m) => ({ default: m.AccountStep })));
const RegisterStep = lazy(() => import('./steps').then((m) => ({ default: m.RegisterStep })));
const ConsentStep = lazy(() => import('./steps').then((m) => ({ default: m.ConsentStep })));

const is = (error: unknown, status: number) => error instanceof ApiError && error.status === status;

/**
 * SPEC-FE-02 D2 / R100–R104: onboarding follows the server's state, not the URL, so a grower who stopped half-way
 * continues at the first missing step on any device: IAM account → grower record → consent and phone code → the app.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const intl = useIntl();
  const account = iam.useMe({ query: { retry: false } });
  const isGrower = account.data?.data.userType === 'GROWER';
  const record = grower.useMe({ query: { retry: false, enabled: isGrower } });
  const loading = <Spinner label={intl.formatMessage({ id: 'shell.loading' })} />;

  let content: ReactNode;
  if (account.isPending) content = loading;
  else if (is(account.error, 401)) content = <AccountStep />;
  else if (account.isError) content = <ErrorView error={account.error} onRetry={() => void account.refetch()} />;
  else if (!isGrower) content = <p role="alert"><FormattedMessage id="onboarding.notGrower" /></p>;
  else if (record.isPending) content = loading;
  else if (is(record.error, 404)) content = <RegisterStep />;
  else if (record.isError) content = <ErrorView error={record.error} onRetry={() => void record.refetch()} />;
  else if (record.data.data.status === 'PENDING_CONSENT') content = <ConsentStep grower={record.data.data} />;
  else if (record.data.data.status !== 'ACTIVE') content = <p role="alert"><FormattedMessage id="onboarding.inactive" /></p>;
  else return <PolicyProvider me={account.data.data}>{children}</PolicyProvider>;

  return <Suspense fallback={loading}>{content}</Suspense>;
}
