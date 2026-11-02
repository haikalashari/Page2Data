import { useEffect } from 'react';
import { useApp } from '@/state/app-context';
import { cn } from '@/utils/helpers';
import { Icon } from './Icon';

const TONES = {
  success: 'border-emerald-200 bg-emerald-50/95 text-emerald-900',
  error: 'border-rose-200 bg-rose-50/95 text-rose-900',
  info: 'border-slate-200 bg-white/95 text-slate-700',
} as const;

export function ToastViewport() {
  const { toast, dismissToast } = useApp();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 4_200);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  const icon = toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div
        role="status"
        className={cn(
          'pointer-events-auto flex w-full max-w-[360px] animate-slide-up items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur',
          TONES[toast.kind],
        )}
      >
        <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-[12px] leading-snug">{toast.text}</p>
        <button
          type="button"
          onClick={dismissToast}
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
