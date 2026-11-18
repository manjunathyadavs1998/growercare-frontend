import { Can, usePolicy } from '@gc/policy';
import { FormattedMessage } from 'react-intl';

/** FE-01 home: who is signed in and with which roles. The queue and the other screens (SPEC-FE-03) replace it. */
export function Home() {
  const { me } = usePolicy();
  const roles = (me?.grants ?? []).map((g) => (g as { roleCode?: string }).roleCode).filter(Boolean).join(', ');
  return (
    <section>
      <h1 className="text-xl font-semibold"><FormattedMessage id="home.welcome" /></h1>
      <p className="mt-2"><FormattedMessage id="home.roles" values={{ roles }} /></p>
      <Can permission="case:assign">
        <p className="mt-2 text-slate-600"><FormattedMessage id="home.canAssign" /></p>
      </Can>
    </section>
  );
}
