import type { ButtonHTMLAttributes } from 'react';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const look = variant === 'primary'
    ? 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-slate-400'
    : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50';
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${look} ${className}`}
    />
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 p-4 text-slate-600">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}
