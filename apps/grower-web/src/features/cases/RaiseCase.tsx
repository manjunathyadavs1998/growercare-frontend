import { ApiError, cases, catalog, grower, useIdempotencyKey } from '@gc/api-client';
import { BUSINESS_UNITS, Button, ErrorView } from '@gc/ui-kit';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { MAX_FILES, uploadAttachment } from './upload';


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

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** SPEC-FE-02 R106 (PRD J4): type, farm, product and batch, title, description, up to 5 photos or PDFs. */
export function RaiseCase() {
  const intl = useIntl();
  const navigate = useNavigate();
  const me = grower.useMe();
  const g = me.data?.data;
  const types = cases.useCaseTypes();
  const farms = grower.useList(g?.growerId ?? '', undefined, { query: { enabled: Boolean(g?.growerId) } });
  const [form, setForm] = useState({ caseType: '', farmId: '', buCode: '', title: '', description: '' });
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<catalog.ProductSummary | null>(null);
  const [batchNo, setBatchNo] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const idempotency = useIdempotencyKey();
  const term = useDebounced(query.trim());

  const products = useQuery({
    queryKey: ['catalog', 'search', g?.countryCode, term],
    queryFn: ({ signal }) => catalog.search({ country: g?.countryCode ?? 'IN', q: term }, { signal }),
    enabled: term.length >= 2 && product === null && Boolean(g?.countryCode),
  });
  const batchTerm = useDebounced(batchNo.trim().toUpperCase());
  const batch = useQuery({
    queryKey: ['catalog', 'batch', product?.productId, batchTerm],
    queryFn: ({ signal }) => catalog.batch1(product?.productId ?? '', batchTerm, { signal }),
    enabled: Boolean(product?.productId) && /^[A-Z0-9-]{4,32}$/.test(batchTerm),
    retry: false,
  });
  const batchUnknown = batch.error instanceof ApiError && batch.error.status === 404;

  const raise = useMutation({
    mutationFn: async () => {
      const created = await cases.create({
        growerId: g?.growerId ?? '',
        caseType: form.caseType,
        title: form.title.trim(),
        description: form.description.trim(),
        ...(form.farmId ? { farmId: form.farmId } : {}),
        ...(product?.productId ? { productId: product.productId } : { buCode: form.buCode }),
        ...(product && batchTerm ? { batchNo: batchTerm } : {}),
      }, { headers: { 'Idempotency-Key': idempotency.key() } });
      idempotency.done();
      const caseId = created.data.caseId ?? '';
      // the case exists now; a failed upload must not lose it (the photo can be added again from the case)
      const results = await Promise.allSettled(files.map((f) => uploadAttachment(caseId, f)));
      return { caseNo: created.data.caseNo ?? '', failedUploads: results.filter((r) => r.status === 'rejected').length };
    },
    onSuccess: ({ caseNo, failedUploads }) => navigate('/', { state: { raised: caseNo, failedUploads } }),
  });

  const activeFarms = (farms.data?.data.items ?? []).filter((f) => f.status !== 'ARCHIVED');
  const valid = form.caseType && form.title.trim() && form.description.trim() && (product || form.buCode) && !batchUnknown;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) raise.mutate();
  };

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold"><FormattedMessage id="raise.title" /></h1>
      <form onSubmit={submit} noValidate>
        <Field label={<FormattedMessage id="raise.type" />}>
          {(id) => (
            <select id={id} className={input} value={form.caseType} onChange={(e) => setForm({ ...form, caseType: e.target.value })}>
              <option value="">{intl.formatMessage({ id: 'raise.choose' })}</option>
              {(types.data?.data ?? []).map((t) => (
                <option key={t.caseType} value={t.caseType}>{intl.formatMessage({ id: `caseType.${t.caseType}`, defaultMessage: t.caseType })}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label={<FormattedMessage id="raise.farm" />}>
          {(id) => (
            <select id={id} className={input} value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value })}>
              <option value="">{intl.formatMessage({ id: 'raise.noFarm' })}</option>
              {activeFarms.map((f) => <option key={f.farmId} value={f.farmId}>{f.name}</option>)}
            </select>
          )}
        </Field>

        {product ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm"><FormattedMessage id="raise.product.chosen" values={{ name: product.name }} /></p>
            <Button variant="secondary" className="mt-2" onClick={() => { setProduct(null); setBatchNo(''); }}>
              <FormattedMessage id="raise.product.change" />
            </Button>
            <Field label={<FormattedMessage id="raise.batch" />} hint={<FormattedMessage id="raise.batch.hint" />}>
              {(id) => <input id={id} className={input} maxLength={32} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />}
            </Field>
            {batch.isSuccess ? <p className="mt-1 text-sm text-emerald-900"><FormattedMessage id="raise.batch.found" /></p> : null}
            {batchUnknown ? <p role="alert" className="mt-1 text-sm text-red-800"><FormattedMessage id="raise.batch.unknown" /></p> : null}
          </div>
        ) : (
          <>
            <Field label={<FormattedMessage id="raise.product" />} hint={<FormattedMessage id="raise.product.hint" />}>
              {(id) => <input id={id} className={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
            </Field>
            {products.isError ? <div className="mt-2"><ErrorView error={products.error} onRetry={() => void products.refetch()} /></div> : null}
            {(products.data?.data.items ?? []).length > 0 ? (
              <ul className="mt-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white" aria-label={intl.formatMessage({ id: 'raise.product.results' })}>
                {(products.data?.data.items ?? []).map((p) => (
                  <li key={p.productId}>
                    <button type="button" className="block w-full px-3 py-2 text-start hover:bg-slate-50" onClick={() => { setProduct(p); setQuery(''); }}>
                      {p.name} <span className="text-sm text-slate-500">({p.productCode})</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Field label={<FormattedMessage id="raise.about" />}>
              {(id) => (
                <select id={id} className={input} value={form.buCode} onChange={(e) => setForm({ ...form, buCode: e.target.value })}>
                  <option value="">{intl.formatMessage({ id: 'raise.choose' })}</option>
                  {BUSINESS_UNITS.map((bu) => <option key={bu} value={bu}>{intl.formatMessage({ id: `bu.${bu}` })}</option>)}
                </select>
              )}
            </Field>
          </>
        )}

        <Field label={<FormattedMessage id="raise.subject" />}>
          {(id) => <input id={id} className={input} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
        </Field>
        <Field label={<FormattedMessage id="raise.description" />}>
          {(id) => <textarea id={id} className={`${input} min-h-32`} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
        </Field>
        <Field label={<FormattedMessage id="raise.photos" values={{ max: MAX_FILES }} />} hint={<FormattedMessage id="raise.photos.hint" />}>
          {(id) => (
            <input id={id} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="mt-1 block w-full text-sm"
              onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, MAX_FILES))} />
          )}
        </Field>
        {files.length > 0 ? <p className="mt-1 text-sm text-slate-600"><FormattedMessage id="raise.photos.count" values={{ count: files.length }} /></p> : null}

        {raise.isError ? <div className="mt-4"><ErrorView error={raise.error} /></div> : null}
        <Button type="submit" className="mt-6 w-full" disabled={!valid || raise.isPending}>
          {raise.isPending ? <FormattedMessage id="raise.sending" /> : <FormattedMessage id="raise.submit" />}
        </Button>
      </form>
    </section>
  );
}
