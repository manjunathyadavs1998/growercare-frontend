import { grower } from '@gc/api-client';
import { LANGUAGES, LANGUAGE_NAMES, useLanguage, type Language } from '@gc/i18n';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

/** SPEC-FE-02 R109: the grower's message language (with If-Match), which also becomes the app's language. */
export function Profile() {
  const intl = useIntl();
  const id = useId();
  const queryClient = useQueryClient();
  const me = grower.useMe();
  const setUiLanguage = useLanguage((s) => s.setLanguage);
  const g = me.data?.data;
  const [choice, setChoice] = useState<Language | null>(null);
  const language = choice ?? ((g?.preferredLanguage ?? 'en') as Language);
  const save = useMutation({
    // grower-service documents this body as Jackson's JsonNode bean; it is SPEC-GRW-01's merge patch
    mutationFn: () => grower.update(g?.growerId ?? '', { preferredLanguage: language } as unknown as grower.JsonNode,
      { headers: { 'If-Match': `"${g?.version ?? 0}"`, 'Content-Type': 'application/merge-patch+json' } }),
    onSuccess: () => {
      setUiLanguage(language);
      setChoice(null);
      return queryClient.invalidateQueries({ queryKey: grower.getMeQueryKey() });
    },
  });

  if (me.isPending) return <Spinner label={intl.formatMessage({ id: 'shell.loading' })} />;
  if (me.isError) return <ErrorView error={me.error} onRetry={() => void me.refetch()} />;
  return (
    <section className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold"><FormattedMessage id="profile.title" /></h1>
      <dl className="mt-4 space-y-2">
        <div><dt className="text-sm text-slate-600"><FormattedMessage id="onboarding.name" /></dt><dd>{g?.displayName}</dd></div>
        <div><dt className="text-sm text-slate-600"><FormattedMessage id="onboarding.phone" /></dt><dd>…{g?.phoneLast4}</dd></div>
      </dl>
      <label htmlFor={id} className="mt-6 block text-sm font-medium"><FormattedMessage id="onboarding.language" /></label>
      <select id={id} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={language}
        onChange={(e) => setChoice(e.target.value as Language)}>
        {LANGUAGES.map((l) => <option key={l} value={l} lang={l}>{LANGUAGE_NAMES[l]}</option>)}
      </select>
      {save.isError ? <div className="mt-3"><ErrorView error={save.error} onReload={() => { save.reset(); void me.refetch(); }} /></div> : null}
      {save.isSuccess ? <p role="status" className="mt-3 text-emerald-900"><FormattedMessage id="profile.saved" /></p> : null}
      <Button className="mt-4" disabled={choice === null || choice === g?.preferredLanguage || save.isPending} onClick={() => save.mutate()}>
        <FormattedMessage id="profile.save" />
      </Button>
    </section>
  );
}
