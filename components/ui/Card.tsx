import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/helpers';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200/70',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200/70',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200/70',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn('h-1.5 w-1.5 rounded-full bg-current opacity-70', className)} />;
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200/80 bg-white card-shadow', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400', className)}>
      {children}
    </p>
  );
}
