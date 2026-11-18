import { ApiError, grower, iam, useIdempotencyKey } from '@gc/api-client';
import { LANGUAGES, LANGUAGE_NAMES, type Language } from '@gc/i18n';
import { usePolicy } from '@gc/policy';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate, useParams } from 'react-router';

const input = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2';

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

/** SPEC-FE-03 R207 step 1: the shop registers a grower who is standing at the counter (assisted, SPEC-GRW-01 R11). */
export function Onboard() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { me } = usePolicy();
  const [form, setForm] = useState({ name: '', phone: '', territoryId: '', language: 'mr' as Language, preferMyShop: true });
  const territories = iam.useTerritories();
  const idempotency = useIdempotencyKey();
  const register = useMutation({
    mutationFn: () => grower.register({
      displayName: form.name.trim(), phone: form.phone.replace(/[\s-]/g, ''), preferredLanguage: form.language, territoryId: form.territoryId,
      ...(form.preferMyShop && me?.partnerOrgId ? { preferredPartnerOrgId: me.partnerOrgId } : {}),
    }, { headers: { 'Idempotency-Key': idempotency.key() } }),
    onSuccess: (r) => { idempotency.done(); navigate(`/partner/growers/${r.data.growerId}/consent`); },
  });
  const all = territories.data?.data ?? [];
  const valid = form.name.trim() && /^\+[1-9][0-9]{7,14}$/.test(form.phone.replace(/[\s-]/g, '')) && form.territoryId;
  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold"><FormattedMessage id="partner.onboard" /></h1>
      <p className="mt-2 text-slate-700"><FormattedMessage id="partner.onboard.intro" /></p>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) register.mutate(); }} noValidate>
        <Field label={<FormattedMessage id="partner.growerName" />}>
          {(id) => <input id={id} className={input} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label={<FormattedMessage id="lookup.phone" />} hint={<FormattedMessage id="partner.phone.hint" />}>
          {(id) => <input id={id} type="tel" className={input} placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        </Field>
        <Field label={<FormattedMessage id="partner.district" />}>
          {(id) => (
            <select id={id} className={input} value={form.territoryId} onChange={(e) => setForm({ ...form, territoryId: e.target.value })}>
              <option value="">{intl.formatMessage({ id: 'partner.chooseDistrict' })}</option>
              {all.filter((t) => t.level === 'STATE').map((s) => (
                <optgroup key={s.territoryId} label={s.name}>
                  {all.filter((d) => d.parentTerritoryId === s.territoryId).map((d) => <option key={d.territoryId} value={d.territoryId}>{d.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <Field label={<FormattedMessage id="partner.growerLanguage" />}>
          {(id) => (
            <select id={id} className={input} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as Language })}>
              {LANGUAGES.map((l) => <option key={l} value={l} lang={l}>{LANGUAGE_NAMES[l]}</option>)}
            </select>
          )}
        </Field>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={form.preferMyShop} onChange={(e) => setForm({ ...form, preferMyShop: e.target.checked })} />
          <FormattedMessage id="partner.preferMyShop" />
        </label>
        {register.isError ? <div className="mt-4"><ErrorView error={register.error} /></div> : null}
        <Button type="submit" className="mt-6" disabled={!valid || register.isPending}><FormattedMessage id="partner.register" /></Button>
      </form>
    </section>
  );
}

const RESTART = new Set(['grower.otp-locked', 'grower.otp-expired', 'grower.otp-used']);

/**
 * SPEC-FE-03 R207 step 2 (PRD D3): with the grower present. The grower reads the notices in their language and chooses
 * the optional consents; the code goes to the grower's phone and the grower reads it out. Recorded as ASSISTED.
 */
export function AssistedConsent() {
  const intl = useIntl();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { growerId = '' } = useParams();
  const g = grower.useGet(growerId, { query: { retry: false } });
  const language = (g.data?.data.preferredLanguage ?? 'en') as Language;
  const notices = grower.useNotices({ country: g.data?.data.countryCode ?? 'IN', language }, { query: { enabled: g.isSuccess } });
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [verification, setVerification] = useState<grower.VerificationView | null>(null);
  const [code, setCode] = useState('');
  const codeId = useId();
  const items = notices.data?.data.items ?? [];
  const service = items.find((n) => n.purpose === 'SERVICE');
  const start = useMutation({
    mutationFn: () => grower.start(growerId, { purpose: 'ACTIVATION' }),
    onSuccess: (r) => { setVerification(r.data); setCode(''); },
  });
  const confirm = useMutation({
    mutationFn: () => grower.confirm(growerId, verification?.verificationId ?? '', {
      code, language, noticeVersion: service?.version,
      consents: items.map((n) => ({ purpose: n.purpose, granted: n.purpose === 'SERVICE' ? true : Boolean(choices[n.purpose ?? '']) })),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['grower', 'partner', 'mine'] });
      navigate('/partner/growers', { state: { onboarded: g.data?.data.displayName } });
    },
  });
  const error = confirm.error instanceof ApiError ? confirm.error : null;
  const restart = error?.rule !== undefined && RESTART.has(error.rule);

  if (g.isPending) return <Spinner label={intl.formatMessage({ id: 'shell.loading' })} />;
  if (g.isError) return <ErrorView error={g.error} onRetry={() => void g.refetch()} />;
  if (g.data.data.status !== 'PENDING_CONSENT') return <p role="status"><FormattedMessage id="partner.alreadyActive" /></p>;
  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold"><FormattedMessage id="partner.consent.title" values={{ name: g.data.data.displayName }} /></h1>
      <p className="mt-2 text-slate-700"><FormattedMessage id="partner.consent.intro" /></p>
      {notices.isError ? <div className="mt-4"><ErrorView error={notices.error} onRetry={() => void notices.refetch()} /></div> : null}
      <div lang={language}>
        {items.map((n) => (
          <article key={n.purpose} className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <h2 className="font-medium">{n.title}</h2>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-sm">{n.body}</p>
            {n.purpose !== 'SERVICE' ? (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={Boolean(choices[n.purpose ?? ''])} disabled={verification !== null}
                  onChange={(e) => setChoices({ ...choices, [n.purpose ?? '']: e.target.checked })} />
                {n.title}
              </label>
            ) : null}
          </article>
        ))}
      </div>
      {!verification ? (
        <>
          {start.isError ? <div className="mt-4"><ErrorView error={start.error} /></div> : null}
          <Button className="mt-6" disabled={!service || start.isPending} onClick={() => start.mutate()}>
            <FormattedMessage id="partner.sendCode" values={{ last4: g.data.data.phoneLast4 }} />
          </Button>
        </>
      ) : (
        <form className="mt-6" onSubmit={(e: FormEvent) => { e.preventDefault(); if (code.length === 6) confirm.mutate(); }} noValidate>
          <label htmlFor={codeId} className="block text-sm font-medium"><FormattedMessage id="partner.code" values={{ last4: verification.phoneLast4 ?? g.data.data.phoneLast4 }} /></label>
          <input id={codeId} className={`${input} tracking-widest`} inputMode="numeric" maxLength={6} autoComplete="off"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          {error?.rule === 'grower.otp-invalid' ? (
            <p role="alert" className="mt-2 text-red-800"><FormattedMessage id="partner.code.wrong" values={{ left: error.attemptsLeft ?? 0 }} /></p>
          ) : null}
          {restart ? <p role="alert" className="mt-2 text-red-800"><FormattedMessage id="partner.code.again" /></p> : null}
          {confirm.isError && error?.rule !== 'grower.otp-invalid' && !restart ? <div className="mt-2"><ErrorView error={confirm.error} /></div> : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="submit" disabled={code.length !== 6 || confirm.isPending || restart}><FormattedMessage id="partner.confirm" /></Button>
            <Button variant="secondary" disabled={start.isPending} onClick={() => start.mutate()}><FormattedMessage id="partner.resend" /></Button>
          </div>
        </form>
      )}
    </section>
  );
}
