import { usePolicy } from '@gc/policy';
import { FormattedMessage } from 'react-intl';
import { useOutletContext } from 'react-router';

/** FE-01 home: confirms the sign-in end to end. The journeys (SPEC-FE-02) replace it. */
export function Home() {
  const { hasAccount } = useOutletContext<{ hasAccount: boolean }>();
  const { me } = usePolicy();
  if (!hasAccount) {
    return (
      <section>
        <h1 className="text-xl font-semibold"><FormattedMessage id="home.welcome" /></h1>
        <p className="mt-2"><FormattedMessage id="home.noAccount" /></p>
      </section>
    );
  }
  return (
    <section>
      <h1 className="text-xl font-semibold"><FormattedMessage id="home.welcome" /></h1>
      <p className="mt-2"><FormattedMessage id="home.signedIn" values={{ country: me?.homeCountry ?? '' }} /></p>
    </section>
  );
}
