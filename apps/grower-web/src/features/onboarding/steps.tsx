import { ApiError, grower, iam, useIdempotencyKey } from '@gc/api-client';
import { useAuth } from '@gc/auth';
import { LANGUAGES, LANGUAGE_NAMES, useLanguage, type Language } from '@gc/i18n';
import { Button, ErrorView } from '@gc/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

type Grower = grower.GrowerView;

const input = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base';

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children(id)}
      {hint ? <p className="mt-1 text-sm text-slate-600">{hint}</p> : null}
    </div>
  );
}

function Step({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">{title}</h1>
      {intro ? <p className="mt-2 text-slate-700">{intro}</p> : null}
      {children}
    </section>
  );
}

/** SPEC-FE-02 R100: the first sign-in creates the IAM account (country + name). */
export function AccountStep() {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const register = iam.useRegister({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: iam.getMeQueryKey() }) },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate({ data: { countryCode: 'IN', displayName: name.trim() } });
  };
  return (
    <Step title={<FormattedMessage id="onboarding.account.title" />} intro={<FormattedMessage id="onboarding.account.intro" />}>
      <form onSubmit={submit} noValidate>
        <Field label={<FormattedMessage id="onboarding.country" />}>
          {(id) => <select id={id} className={input} value="IN" disabled><option value="IN">{intl.formatMessage({ id: 'country.IN' })}</option></select>}
        </Field>
        <Field label={<FormattedMessage id="onboarding.name" />}>
          {(id) => <input id={id} className={input} required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {register.isError ? <div className="mt-4"><ErrorView error={register.error} /></div> : null}
        <Button type="submit" className="mt-6 w-full" disabled={name.trim().length === 0 || register.isPending}>
          <FormattedMessage id="action.continue" />
        </Button>
      </form>
    </Step>
  );
}

/** SPEC-FE-02 R101: the grower record: territory, language; the phone is the number the grower signed up with. */
export function RegisterStep() {
  const intl = useIntl();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const uiLanguage = useLanguage((s) => s.language);
  const [name, setName] = useState('');
  const [territoryId, setTerritoryId] = useState('');
  const [language, setLanguage] = useState<Language>(uiLanguage);
  const idempotency = useIdempotencyKey();
  const territories = iam.useTerritories();
  const register = grower.useRegister({
    mutation: {
      onSuccess: () => {
        idempotency.done();
        return queryClient.invalidateQueries({ queryKey: grower.getMeQueryKey() });
      },
    },
    // the same key on every retry of this registration, a new one only after success (FE-01 R6)
    request: { headers: { 'Idempotency-Key': idempotency.key() } },
  });
  const phone = auth.loginName() ?? '';
  const all = territories.data?.data ?? [];
  const districts = all.filter((t) => t.level !== 'STATE');
  const states = all.filter((t) => t.level === 'STATE');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate({ data: { displayName: name.trim(), phone, preferredLanguage: language, territoryId } });
  };

  return (
    <Step title={<FormattedMessage id="onboarding.register.title" />} intro={<FormattedMessage id="onboarding.register.intro" />}>
      <form onSubmit={submit} noValidate>
        <Field label={<FormattedMessage id="onboarding.name" />}>
          {(id) => <input id={id} className={input} required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={<FormattedMessage id="onboarding.phone" />} hint={<FormattedMessage id="onboarding.phone.hint" />}>
          {(id) => <input id={id} className={`${input} bg-slate-100`} value={phone} readOnly />}
        </Field>
        <Field label={<FormattedMessage id="onboarding.territory" />}>
          {(id) => (
            <select id={id} className={input} required value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
              <option value="">{intl.formatMessage({ id: 'onboarding.territory.choose' })}</option>
              {states.map((s) => (
                <optgroup key={s.territoryId} label={s.name}>
                  {districts.filter((d) => d.parentTerritoryId === s.territoryId).map((d) => <option key={d.territoryId} value={d.territoryId}>{d.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <Field label={<FormattedMessage id="onboarding.language" />}>
          {(id) => (
            <select id={id} className={input} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((l) => <option key={l} value={l} lang={l}>{LANGUAGE_NAMES[l]}</option>)}
            </select>
          )}
        </Field>
        {territories.isError ? <div className="mt-4"><ErrorView error={territories.error} onRetry={() => void territories.refetch()} /></div> : null}
        {register.isError ? <div className="mt-4"><ErrorView error={register.error} /></div> : null}
        <Button type="submit" className="mt-6 w-full" disabled={!name.trim() || !territoryId || !phone || register.isPending}>
          <FormattedMessage id="action.continue" />
        </Button>
      </form>
    </Step>
  );
}

const CODE_RESTART = new Set(['grower.otp-locked', 'grower.otp-expired', 'grower.otp-used']);

/** SPEC-FE-02 R102/R103: read and choose the consents, then confirm the phone with the code sent to it. */
export function ConsentStep({ grower: g }: { grower: Grower }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const language = useLanguage((s) => s.language);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [verification, setVerification] = useState<grower.VerificationView | null>(null);
  const [code, setCode] = useState('');
  const notices = grower.useNotices({ country: g.countryCode ?? 'IN', language });
  const items = notices.data?.data.items ?? [];
  const service = items.find((n) => n.purpose === 'SERVICE');

  const start = grower.useStart({ mutation: { onSuccess: (r) => { setVerification(r.data); setCode(''); } } });
  const confirm = grower.useConfirm({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: grower.getMeQueryKey() }) },
  });
  const growerId = g.growerId ?? '';

  const sendCode = () => start.mutate({ growerId, data: { purpose: 'ACTIVATION' } });
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!verification?.verificationId || !service) return;
    confirm.mutate({
      growerId,
      verificationId: verification.verificationId,
      data: {
        code,
        language,
        noticeVersion: service.version,
        consents: items.map((n) => ({ purpose: n.purpose, granted: n.purpose === 'SERVICE' ? true : Boolean(choices[n.purpose ?? '']) })),
      },
    });
  };

  const confirmError = confirm.error instanceof ApiError ? confirm.error : null;
  const restart = confirmError?.rule !== undefined && CODE_RESTART.has(confirmError.rule);

  if (notices.isError) return <ErrorView error={notices.error} onRetry={() => void notices.refetch()} />;
  if (!verification) {
    return (
      <Step title={<FormattedMessage id="onboarding.consent.title" />} intro={<FormattedMessage id="onboarding.consent.intro" />}>
        {items.map((n) => (
          <article key={n.purpose} className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <h2 className="font-medium">{n.title}</h2>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-700">{n.body}</p>
            {n.purpose === 'SERVICE' ? (
              <p className="mt-3 text-sm font-medium"><FormattedMessage id="onboarding.consent.required" /></p>
            ) : (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={Boolean(choices[n.purpose ?? ''])}
                  onChange={(e) => setChoices({ ...choices, [n.purpose ?? '']: e.target.checked })} />
                <FormattedMessage id="onboarding.consent.agree" values={{ title: n.title }} />
              </label>
            )}
          </article>
        ))}
        {start.isError ? <div className="mt-4"><ErrorView error={start.error} /></div> : null}
        <Button className="mt-6 w-full" disabled={!service || start.isPending} onClick={sendCode}>
          <FormattedMessage id="onboarding.consent.sendCode" values={{ last4: g.phoneLast4 ?? '' }} />
        </Button>
      </Step>
    );
  }
  return (
    <Step title={<FormattedMessage id="onboarding.code.title" />}
      intro={<FormattedMessage id="onboarding.code.intro" values={{ last4: verification.phoneLast4 ?? g.phoneLast4 ?? '' }} />}>
      <form onSubmit={submitCode} noValidate>
        <Field label={<FormattedMessage id="onboarding.code" />}>
          {(id) => (
            <input id={id} className={`${input} tracking-widest`} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          )}
        </Field>
        {confirmError?.rule === 'grower.otp-invalid' ? (
          <p role="alert" className="mt-3 text-red-800">
            <FormattedMessage id="onboarding.code.wrong" values={{ left: confirmError.attemptsLeft ?? 0 }} />
          </p>
        ) : null}
        {restart ? <p role="alert" className="mt-3 text-red-800"><FormattedMessage id={`onboarding.code.${confirmError?.rule?.split('-').pop()}`} /></p> : null}
        {confirm.isError && confirmError?.rule !== 'grower.otp-invalid' && !restart ? <div className="mt-3"><ErrorView error={confirm.error} /></div> : null}
        <Button type="submit" className="mt-6 w-full" disabled={code.length !== 6 || confirm.isPending || restart}>
          <FormattedMessage id="onboarding.code.confirm" />
        </Button>
        <Button variant="secondary" className="mt-3 w-full" disabled={start.isPending} onClick={sendCode}>
          <FormattedMessage id="onboarding.code.resend" />
        </Button>
        {start.isError ? <div className="mt-3"><ErrorView error={start.error} /></div> : null}
        <p className="sr-only" aria-live="polite">{intl.formatMessage({ id: 'onboarding.code.sent' })}</p>
      </form>
    </Step>
  );
}
