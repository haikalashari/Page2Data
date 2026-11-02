import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/state/app-context';

export function AppHeader() {
  const { dataset, view, setView, saving, savedAt } = useApp();
  const settingsOpen = view === 'settings';

  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-slate-200/80 bg-white/90 px-3 py-2.5 backdrop-blur">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
        <Icon name="table" className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[13px] font-semibold tracking-tight text-slate-900">Page2Data</h1>
          {dataset ? (
            saving ? (
              <span className="text-[10px] text-slate-400">Saving…</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                <Icon name="check" className="h-2.5 w-2.5" />
                Saved
              </span>
            ) : null
          ) : null}
        </div>
        <p className="truncate text-[11px] text-slate-400">
          {dataset ? dataset.name : 'Web tables → clean datasets'}
        </p>
      </div>

      <Button
        variant={settingsOpen ? 'primary' : 'ghost'}
        size="sm"
        className="shrink-0 px-2"
        onClick={() => setView(settingsOpen ? (dataset ? 'data' : 'extract') : 'settings')}
        aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
        title="AI settings"
      >
        <Icon name={settingsOpen ? 'x' : 'settings'} className="h-4 w-4" />
      </Button>
    </header>
  );
}
