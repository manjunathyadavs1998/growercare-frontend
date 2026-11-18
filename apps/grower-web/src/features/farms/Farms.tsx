import { grower, useIdempotencyKey } from '@gc/api-client';
import { Button, ErrorView, Spinner } from '@gc/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

/** SPEC-FE-02 D5: the crop codes of SPEC-GRW-02 D4 (the server validates them). */
export const CROPS = ['GRAPE', 'ONION', 'SOYBEAN', 'RAGI', 'PADDY', 'COTTON', 'MAIZE', 'WHEAT', 'TOMATO', 'CHILLI', 'SUGARCANE'] as const;
const MAX_CROPS = 5;

type Farm = grower.FarmView;
interface FarmInput { name: string; areaHa: string; crops: string[] }

const input = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base';

function valid(f: FarmInput): boolean {
  const area = Number(f.areaHa);
  return f.name.trim().length > 0 && f.name.trim().length <= 120 && Number.isFinite(area) && area > 0 && area <= 100_000
    && f.crops.length >= 1 && f.crops.length <= MAX_CROPS;
}

function FarmForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: FarmInput; submitLabel: string; busy: boolean; onSubmit: (f: FarmInput) => void; onCancel?: () => void;
}) {
  const intl = useIntl();
  const id = useId();
  const [form, setForm] = useState(initial);
  const toggle = (crop: string) => setForm({
    ...form, crops: form.crops.includes(crop) ? form.crops.filter((c) => c !== crop) : [...form.crops, crop],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid(form)) onSubmit(form);
  };
  return (
    <form onSubmit={submit} noValidate className="rounded-md border border-slate-200 bg-white p-4">
      <label htmlFor={`${id}-name`} className="block text-sm font-medium"><FormattedMessage id="farms.name" /></label>
      <input id={`${id}-name`} className={input} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label htmlFor={`${id}-area`} className="mt-4 block text-sm font-medium"><FormattedMessage id="farms.area" /></label>
      <input id={`${id}-area`} className={input} inputMode="decimal" value={form.areaHa}
        onChange={(e) => setForm({ ...form, areaHa: e.target.value.replace(',', '.') })} />
      <fieldset className="mt-4">
        <legend className="text-sm font-medium"><FormattedMessage id="farms.crops" values={{ max: MAX_CROPS }} /></legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CROPS.map((crop) => (
            <label key={crop} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={form.crops.includes(crop)}
                disabled={!form.crops.includes(crop) && form.crops.length >= MAX_CROPS} onChange={() => toggle(crop)} />
              {intl.formatMessage({ id: `crop.${crop}` })}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex gap-3">
        <Button type="submit" disabled={!valid(form) || busy}>{submitLabel}</Button>
        {onCancel ? <Button variant="secondary" onClick={onCancel}><FormattedMessage id="action.cancel" /></Button> : null}
      </div>
    </form>
  );
}

const etag = (version: number | undefined) => `"${version ?? 0}"`;
// grower-service's contract documents farm bodies as Jackson's JsonNode bean instead of their JSON shape (a contract bug to
// fix there); the body below is SPEC-GRW-02 R200/R208's {name, areaHa, crops}.
const toBody = (f: FarmInput) => ({ name: f.name.trim(), areaHa: Number(f.areaHa), crops: f.crops }) as unknown as grower.JsonNode;

/** SPEC-FE-02 R105 (PRD J3): the grower's farms: add, edit, archive. */
export function Farms() {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const me = grower.useMe();
  const growerId = me.data?.data.growerId ?? '';
  const farms = grower.useList(growerId, undefined, { query: { enabled: growerId !== '' } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: grower.getListQueryKey(growerId) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const idempotency = useIdempotencyKey();

  const create = useMutation({
    mutationFn: (f: FarmInput) => grower.create(growerId, toBody(f), { headers: { 'Idempotency-Key': idempotency.key() } }),
    onSuccess: () => { idempotency.done(); setAdding(false); return refresh(); },
  });
  const update = useMutation({
    mutationFn: ({ farm, f }: { farm: Farm; f: FarmInput }) =>
      grower.update1(growerId, farm.farmId ?? '', toBody(f), { headers: { 'If-Match': etag(farm.version), 'Content-Type': 'application/merge-patch+json' } }),
    onSuccess: () => { setEditing(null); return refresh(); },
  });
  const archive = useMutation({
    mutationFn: (farm: Farm) => grower.archive(growerId, farm.farmId ?? '', { headers: { 'If-Match': etag(farm.version) } }),
    onSuccess: () => { setArchiving(null); return refresh(); },
  });
  const items = (farms.data?.data.items ?? []).filter((f) => f.status !== 'ARCHIVED');
  const failure = create.error ?? update.error ?? archive.error;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold"><FormattedMessage id="farms.title" /></h1>
        {!adding ? <Button onClick={() => setAdding(true)}><FormattedMessage id="farms.add" /></Button> : null}
      </div>
      {farms.isPending || me.isPending ? <Spinner label={intl.formatMessage({ id: 'shell.loading' })} /> : null}
      {farms.isError ? <div className="mt-4"><ErrorView error={farms.error} onRetry={() => void farms.refetch()} /></div> : null}
      {failure ? <div className="mt-4"><ErrorView error={failure} onReload={() => { update.reset(); archive.reset(); void refresh(); }} /></div> : null}
      {adding ? (
        <div className="mt-4">
          <FarmForm initial={{ name: '', areaHa: '', crops: [] }} submitLabel={intl.formatMessage({ id: 'farms.save' })}
            busy={create.isPending} onSubmit={(f) => create.mutate(f)} onCancel={() => { setAdding(false); create.reset(); }} />
        </div>
      ) : null}
      {farms.isSuccess && items.length === 0 && !adding ? <p className="mt-4 text-slate-600"><FormattedMessage id="farms.empty" /></p> : null}
      <ul className="mt-4 space-y-3">
        {items.map((farm) => (
          <li key={farm.farmId}>
            {editing === farm.farmId ? (
              <FarmForm initial={{ name: farm.name ?? '', areaHa: String(farm.areaHa ?? ''), crops: farm.crops ?? [] }}
                submitLabel={intl.formatMessage({ id: 'farms.save' })} busy={update.isPending}
                onSubmit={(f) => update.mutate({ farm, f })} onCancel={() => { setEditing(null); update.reset(); }} />
            ) : (
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <p className="font-medium">{farm.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  <FormattedMessage id="farms.summary" values={{ area: farm.areaHa ?? 0 }} />
                  {' · '}{(farm.crops ?? []).map((c) => intl.formatMessage({ id: `crop.${c}`, defaultMessage: c })).join(', ')}
                </p>
                {archiving === farm.farmId ? (
                  <div role="group" aria-label={intl.formatMessage({ id: 'farms.archive.confirm' }, { name: farm.name })} className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm"><FormattedMessage id="farms.archive.confirm" values={{ name: farm.name }} /></span>
                    <Button disabled={archive.isPending} onClick={() => archive.mutate(farm)}><FormattedMessage id="farms.archive.yes" /></Button>
                    <Button variant="secondary" onClick={() => setArchiving(null)}><FormattedMessage id="action.cancel" /></Button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-3">
                    <Button variant="secondary" aria-label={intl.formatMessage({ id: 'farms.edit' }, { name: farm.name })}
                      onClick={() => setEditing(farm.farmId ?? null)}>
                      <FormattedMessage id="action.edit" />
                    </Button>
                    <Button variant="secondary" aria-label={intl.formatMessage({ id: 'farms.archive' }, { name: farm.name })}
                      onClick={() => setArchiving(farm.farmId ?? null)}>
                      <FormattedMessage id="action.archive" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
