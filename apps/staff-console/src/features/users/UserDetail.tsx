import { iam } from '@gc/api-client';
import { Can, usePolicy } from '@gc/policy';
import { BUSINESS_UNITS, Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from 'react-router';

type Grant = iam.GrantView;
type User = iam.UserView;
const TERRITORY_SCOPES = new Set(['TERRITORY', 'ASSIGNED']);

/** SPEC-FE-03 R206 (J8): one user, their active grants; grant a role with a scope and an end date; revoke with a reason. */
export function UserDetail() {
  const intl = useIntl();
  const { userId = '' } = useParams();
  const user = iam.useUser(userId, { query: { retry: false } });
  if (user.isPending) return <Spinner label={intl.formatMessage({ id: 'shell.loading' })} />;
  if (user.isError) return <ErrorView error={user.error} onRetry={() => void user.refetch()} />;
  const u = user.data.data;
  return (
    <div className="space-y-4">
      <header className="rounded-md border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold">{u.displayName}</h1>
        <p className="text-sm text-slate-600">
          {intl.formatMessage({ id: `userType.${u.userType}`, defaultMessage: u.userType })} · {u.homeCountry}
          {u.phoneLast4 ? <> · …{u.phoneLast4}</> : null} · {intl.formatMessage({ id: `userStatus.${u.status}`, defaultMessage: u.status })}
        </p>
      </header>
      <Grants user={u} />
      <Can permission="grant:create"><NewGrant user={u} /></Can>
    </div>
  );
}

function scopeText(g: Grant, territoryNames: Map<string | undefined, string | undefined>): string {
  return [...(g.countryCodes ?? []), ...(g.regionCodes ?? []), ...(g.territoryIds ?? []).map((t) => territoryNames.get(t) ?? t), ...(g.buCodes ?? [])].join(', ');
}

function Grants({ user }: { user: User }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const territories = iam.useTerritories({ country: user.homeCountry }, { query: { enabled: Boolean(user.homeCountry) } });
  const names = new Map((territories.data?.data ?? []).map((t) => [t.territoryId, t.name]));
  const revoke = useMutation({
    mutationFn: (grantId: string) => iam.revoke(grantId, { reason: reason.trim() }),
    onSuccess: () => { setRevoking(null); setReason(''); return queryClient.invalidateQueries({ queryKey: iam.getUserQueryKey(user.userId ?? '') }); },
  });
  const grants = user.grants ?? [];
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="font-medium"><FormattedMessage id="grants.title" /></h2>
      {grants.length === 0 ? <p className="mt-2 text-sm text-slate-600"><FormattedMessage id="grants.none" /></p> : null}
      <ul className="mt-2 space-y-3">
        {grants.map((g) => (
          <li key={g.grantId} className="text-sm">
            <p>
              <strong>{intl.formatMessage({ id: `role.${g.roleCode}`, defaultMessage: g.roleCode })}</strong>
              {' · '}{scopeText(g, names)}
              {g.validTo ? <> · <FormattedMessage id="grants.until" values={{ date: intl.formatDate(g.validTo, { dateStyle: 'medium' }) }} /></> : null}
            </p>
            <Can permission="grant:revoke">
              {revoking === g.grantId ? (
                <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (reason.trim()) revoke.mutate(g.grantId ?? ''); }} noValidate>
                  <div className="grow">
                    <label htmlFor={reasonId} className="block"><FormattedMessage id="grants.revokeReason" /></label>
                    <input id={reasonId} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={!reason.trim() || revoke.isPending}><FormattedMessage id="grants.revokeConfirm" /></Button>
                  <Button variant="secondary" onClick={() => setRevoking(null)}><FormattedMessage id="action.cancel" /></Button>
                </form>
              ) : (
                <Button variant="secondary" className="mt-1" onClick={() => { setRevoking(g.grantId ?? null); setReason(''); }}
                  aria-label={intl.formatMessage({ id: 'grants.revokeNamed' }, { role: intl.formatMessage({ id: `role.${g.roleCode}`, defaultMessage: g.roleCode }) })}>
                  <FormattedMessage id="grants.revoke" />
                </Button>
              )}
            </Can>
          </li>
        ))}
      </ul>
      {revoke.isError ? <div className="mt-2"><ErrorView error={revoke.error} /></div> : null}
    </section>
  );
}

/** The roles this admin may grant (SPEC-IAM-04), for this user's type; scope as the role needs it. */
function NewGrant({ user }: { user: User }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { me } = usePolicy();
  const ids = { role: useId(), country: useId(), until: useId(), reason: useId() };
  const roles = iam.useRoles();
  const territories = iam.useTerritories({ country: user.homeCountry }, { query: { enabled: Boolean(user.homeCountry) } });
  const [roleCode, setRoleCode] = useState('');
  const [country, setCountry] = useState(user.homeCountry ?? '');
  const [territoryIds, setTerritoryIds] = useState<string[]>([]);
  const [buCodes, setBuCodes] = useState<string[]>([]);
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const offered = (roles.data?.data ?? []).filter((r) => r.allowedUserType === user.userType);
  const role = offered.find((r) => r.roleCode === roleCode);
  const byTerritory = role ? TERRITORY_SCOPES.has(role.scopeKind ?? '') : false;
  // the countries the admin's own grants cover (IAM re-checks delegation on submit)
  const adminCountries = [...new Set((me?.grants ?? []).flatMap((g) => (g as { countryCodes?: string[] }).countryCodes ?? []))];
  const countries = user.userType === 'STAFF' ? adminCountries : [user.homeCountry ?? ''];
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const create = useMutation({
    mutationFn: () => iam.create({
      userId: user.userId ?? '', roleCode, reason: reason.trim(),
      ...(byTerritory ? { territoryIds } : { countryCodes: [country] }),
      ...(buCodes.length ? { buCodes } : {}),
      ...(until ? { validTo: new Date(`${until}T23:59:59`).toISOString() } : {}),
    }),
    onSuccess: () => {
      setRoleCode(''); setTerritoryIds([]); setBuCodes([]); setUntil(''); setReason('');
      return queryClient.invalidateQueries({ queryKey: iam.getUserQueryKey(user.userId ?? '') });
    },
  });
  const valid = role && reason.trim() && (byTerritory ? territoryIds.length > 0 : country);
  const select = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5';

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="font-medium"><FormattedMessage id="grants.new" /></h2>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) create.mutate(); }} noValidate>
        <div>
          <label htmlFor={ids.role} className="block text-sm"><FormattedMessage id="grants.role" /></label>
          <select id={ids.role} className={select} value={roleCode} onChange={(e) => { setRoleCode(e.target.value); setTerritoryIds([]); }}>
            <option value="">{intl.formatMessage({ id: 'grants.chooseRole' })}</option>
            {offered.map((r) => <option key={r.roleCode} value={r.roleCode}>{intl.formatMessage({ id: `role.${r.roleCode}`, defaultMessage: r.name })}</option>)}
          </select>
        </div>
        {role && !byTerritory ? (
          <div>
            <label htmlFor={ids.country} className="block text-sm"><FormattedMessage id="grants.country" /></label>
            <select id={ids.country} className={select} value={country} onChange={(e) => setCountry(e.target.value)} disabled={user.userType !== 'STAFF'}>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ) : null}
        {byTerritory ? (
          <fieldset className="sm:col-span-2">
            <legend className="text-sm"><FormattedMessage id="grants.territories" /></legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {(territories.data?.data ?? []).map((t) => (
                <label key={t.territoryId} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={territoryIds.includes(t.territoryId ?? '')} onChange={() => setTerritoryIds(toggle(territoryIds, t.territoryId ?? ''))} />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {role ? (
          <fieldset className="sm:col-span-2">
            <legend className="text-sm"><FormattedMessage id="grants.bus" /></legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {BUSINESS_UNITS.map((bu) => (
                <label key={bu} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={buCodes.includes(bu)} onChange={() => setBuCodes(toggle(buCodes, bu))} />
                  {intl.formatMessage({ id: `bu.${bu}` })}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div>
          <label htmlFor={ids.until} className="block text-sm"><FormattedMessage id="grants.untilOptional" /></label>
          <input id={ids.until} type="date" className={select} value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <div>
          <label htmlFor={ids.reason} className="block text-sm"><FormattedMessage id="grants.reason" /></label>
          <input id={ids.reason} className={select} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {create.isError ? <div className="sm:col-span-2"><ErrorView error={create.error} /></div> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={!valid || create.isPending}><FormattedMessage id="grants.grant" /></Button>
        </div>
      </form>
    </section>
  );
}
