import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/state/app-context';
import { formatDate } from '@/utils/helpers';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'saved dataset';
  }
}

export function SavedDatasets() {
  const { summaries, openDataset, removeDataset } = useApp();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (summaries.length === 0) return null;

  return (
    <section className="pt-1">
      <div className="flex items-center justify-between">
        <SectionLabel>Saved datasets</SectionLabel>
        <span className="text-[10px] text-slate-400">{summaries.length}</span>
      </div>

      <div className="mt-2 space-y-1.5">
        {summaries.slice(0, 8).map((summary) => {
          const confirming = pendingDelete === summary.id;
          return (
            <div
              key={summary.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                <Icon name="database" className="h-3 w-3" />
              </div>

              <button
                type="button"
                onClick={() => void openDataset(summary.id)}
                className="min-w-0 flex-1 text-left"
                title={summary.name}
              >
                <p className="truncate text-[12px] font-medium text-slate-700">{summary.name}</p>
                <p className="truncate text-[10px] text-slate-400">
                  {hostOf(summary.sourceUrl)} · {summary.rowCount.toLocaleString()} rows ·{' '}
                  {summary.columnCount} cols · {formatDate(summary.extractedAt)}
                </p>
              </button>

              {confirming ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => {
                      setPendingDelete(null);
                      void removeDataset(summary.id);
                    }}
                  >
                    Delete
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setPendingDelete(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDelete(summary.id)}
                  aria-label={`Delete ${summary.name}`}
                  className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
