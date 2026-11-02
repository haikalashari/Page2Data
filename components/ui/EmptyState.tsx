import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({
  icon = 'table',
  title,
  description,
  children,
}: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center animate-in">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200/80">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <h3 className="text-[14px] font-semibold text-slate-800">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-[260px] text-[12px] leading-relaxed text-slate-500">{description}</p>
      ) : null}
      {children ? <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
