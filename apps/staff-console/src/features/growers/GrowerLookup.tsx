import { grower } from '@gc/api-client';
import { usePolicy } from '@gc/policy';
import { Button, ErrorView } from '@gc/ui-kit';
import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';

/** SPEC-FE-03 R201 (J5): the grower on the phone: find them by number (in the request body, never the URL). */
export function GrowerLookup() {
  const id = useId();
  const { me } = usePolicy();
  const [phone, setPhone] = useState('');
  const search = useMutation({
    mutationFn: (number: string) => grower.search({ phone: number, countryCode: me?.homeCountry ?? 'IN' }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const number = phone.replace(/[\s-]/g, '');
    if (number) search.mutate(number);
  };
  const found = search.data?.data.items ?? [];
  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold"><FormattedMessage id="lookup.title" /></h1>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <div className="grow">
          <label htmlFor={id} className="block text-sm font-medium"><FormattedMessage id="lookup.phone" /></label>
          <input id={id} type="tel" autoComplete="off" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button type="submit" disabled={!phone.trim() || search.isPending}><FormattedMessage id="lookup.find" /></Button>
      </form>
      {search.isError ? <div className="mt-4"><ErrorView error={search.error} /></div> : null}
      {search.isSuccess && found.length === 0 ? <p className="mt-4 text-slate-600"><FormattedMessage id="lookup.none" /></p> : null}
      <ul className="mt-4 space-y-3">
        {found.map((g) => (
          <li key={g.growerId} className="rounded-md border border-slate-200 bg-white p-4">
            <p className="font-medium">{g.displayName}</p>
            <p className="text-sm text-slate-600">…{g.phoneLast4} · <FormattedMessage id={`growerStatus.${g.status}`} defaultMessage={g.status} /></p>
            <Link className="mt-2 inline-block text-emerald-800 underline" to={`/?growerId=${g.growerId}`}>
              <FormattedMessage id="lookup.cases" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
