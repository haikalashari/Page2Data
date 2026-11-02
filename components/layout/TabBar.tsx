import { useApp, type View } from '@/state/app-context';
import { cn } from '@/utils/helpers';
import { Icon, type IconName } from '@/components/ui/Icon';

const TABS: ReadonlyArray<{ id: View; label: string; icon: IconName }> = [
  { id: 'extract', label: 'Extract', icon: 'table' },
  { id: 'data', label: 'Data', icon: 'columns' },
  { id: 'clean', label: 'Clean', icon: 'filter' },
  { id: 'ai', label: 'AI', icon: 'sparkles' },
];

export function TabBar() {
  const { view, setView, dataset } = useApp();

  return (
    <div className="shrink-0 border-b border-slate-200/70 bg-white/60 px-2 py-2 backdrop-blur">
      <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5">
        {TABS.map((tab) => {
          const disabled = !dataset && tab.id !== 'extract';
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => setView(tab.id)}
              aria-current={active ? 'page' : undefined}
              title={disabled ? 'Extract a table first' : tab.label}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/70'
                  : 'text-slate-500 hover:text-slate-700',
                disabled && 'cursor-not-allowed opacity-40 hover:text-slate-500',
              )}
            >
              <Icon name={tab.icon} className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
